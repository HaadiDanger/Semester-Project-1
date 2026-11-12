import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { ImageMagick, MagickFormat, MagickGeometry } from "@imagemagick/magick-wasm"
import { normalizeImage } from "../supabase/functions/_shared/image-validator.mjs"

// Curated, openly licensed photographs only. This is an operator build tool, never a browser request.
const sources = JSON.parse(await readFile(new URL("./data/menu-photo-sources.json", import.meta.url), "utf8"))
const lockPath = new URL("./data/menu-photos.json", import.meta.url)
let locked = []
try { locked = JSON.parse(await readFile(lockPath, "utf8")) } catch (error) { if (error.code !== "ENOENT") throw error }
const keys = process.argv.slice(2)
if (keys.some(key => !sources.some(photo => photo.key === key))) throw new Error("Unknown photo key. Use the keys in scripts/data/menu-photo-sources.json.")
const directory = new URL("../public/images/menu/", import.meta.url)
await mkdir(directory, { recursive: true })
const pending = []
for (const source of sources.filter(photo => !keys.length || keys.includes(photo.key))) {
  if (source.crop) {
    const { x, y, width, height } = source.crop
    assert.ok([x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0
      && x + width <= 1 && y + height <= 1, `Invalid relative crop: ${source.key}`)
  }
  const prior = locked.find(photo => photo.key === source.key)
  if (prior?.title === source.title && prior.alt === source.alt && JSON.stringify(prior.crop) === JSON.stringify(source.crop)
    && (!source.source_url || prior.source_url === source.source_url && prior.source_date === source.source_date)
    && (!source.author || prior.author === source.author) && (!source.license_url || prior.license_url === source.license_url)) {
    try {
      const existing = await readFile(new URL(`${source.key}.webp`, directory))
      if (createHash("sha256").update(existing).digest("hex") === prior.sha256) continue
      throw new Error(`Existing ${source.key} was modified. Review it before replacing it.`)
    } catch (error) { if (error.code !== "ENOENT") throw error }
  }
  pending.push(source)
}
if (!pending.length) { console.log("All selected food photographs match their recorded SHA-256 hashes."); process.exit(0) }
const headers = { "User-Agent": "IUSTOrbitMenu/1.0 (https://github.com/HaadiDanger/Semester-Project-1)" }
const commons = pending.filter(photo => !photo.source_url)
const params = new URLSearchParams({ action: "query", format: "json", titles: commons.map(photo => photo.title).join("|"),
  prop: "imageinfo", iiprop: "url|extmetadata|size|sha1|timestamp", iiurlwidth: "800" })
let pages = []
if (commons.length) {
  const metadata = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers, signal: AbortSignal.timeout(30000) })
  if (!metadata.ok) throw new Error(`Wikimedia metadata returned HTTP ${metadata.status}. Retry later; completed files are preserved.`)
  pages = Object.values((await metadata.json()).query?.pages || {})
}
const text = value => (value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
const cleanURL = value => { const url = new URL(value); url.protocol = "https:"; url.search = ""; return url.href }
async function flickrInfo(source) {
  assert.match(source.source_url, /^https:\/\/www\.flickr\.com\/photos\/[a-zA-Z0-9@_-]+\/\d+\/$/, "Use the reviewed Flickr photograph page")
  assert.match(source.source_date, /^\d{4}-\d{2}-\d{2}$/, "Record the source page's taken date")
  const response = await fetch(source.source_url, { headers, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Flickr metadata returned HTTP ${response.status}. Completed files are preserved.`)
  const html = await response.text()
  const graphs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(match => {
    const data = JSON.parse(match[1]); return data["@graph"] || [data]
  })
  const image = graphs.find(data => data["@type"] === "ImageObject")
  assert.equal(image?.acquireLicensePage?.replace(/\/$/, ""), source.source_url.replace(/\/$/, ""), "Flickr source identity changed")
  assert.match(image.contentUrl, /^https:\/\/live\.staticflickr\.com\/\d+\/\d+_[a-z0-9_]+\.jpg$/, "Use Flickr's recorded display photograph")
  assert.equal(new URL(image.contentUrl).pathname.split("/").at(-1).split("_")[0], source.source_url.split("/").at(-2), "Flickr photograph identity changed")
  const license = image.license?.match(/^https:\/\/creativecommons\.org\/licenses\/(by(?:-sa)?)\/([234]\.0)\/$/)
  assert.ok(license && typeof image.author?.name === "string" && image.author.name.trim(), "Review Flickr's current author and permissive licence")
  return { thumburl: image.contentUrl, descriptionurl: source.source_url, extmetadata: {
    Artist: { value: image.author.name }, LicenseShortName: { value: `CC ${license[1].toUpperCase()} ${license[2]}` },
    LicenseUrl: { value: image.license }, DateTimeOriginal: { value: source.source_date }, ImageDescription: { value: source.title },
  } }
}
for (const source of pending) {
  const info = source.source_url ? await flickrInfo(source) : pages.find(page => page.title === source.title)?.imageinfo?.[0], meta = info?.extmetadata
  if (!info || !meta?.LicenseShortName?.value || !(source.license_url || meta.LicenseUrl?.value) || !meta.Artist?.value) throw new Error(`Incomplete photograph/attribution metadata for ${source.title}. Review the source.`)
  const license = text(meta.LicenseShortName.value)
  if (!/^(CC BY(?:-SA)? [234]\.0|CC0|Public domain)$/.test(license)) throw new Error(`Review the licence for ${source.title}: ${license}`)
  const downloadURL = cleanURL(info.thumburl || info.url)
  const response = await fetch(downloadURL, { headers, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Photo ${source.key} returned HTTP ${response.status}. Retry later; completed files are preserved.`)
  const input = new Uint8Array(await response.arrayBuffer())
  let image = await normalizeImage(input, () => readFile(new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm"))))
  if (source.crop) {
    const { x, y, width, height } = source.crop
    image = ImageMagick.read(image.bytes, MagickFormat.WebP, photo => {
      photo.crop(new MagickGeometry(Math.round(x * photo.width), Math.round(y * photo.height), Math.round(width * photo.width), Math.round(height * photo.height)))
      photo.resetPage(); photo.quality = 85
      return photo.write(MagickFormat.WebP, data => ({ bytes: new Uint8Array(data), width: photo.width, height: photo.height }))
    })
    image.sha256 = createHash("sha256").update(image.bytes).digest("hex")
  }
  const record = { key: source.key, path: `/images/menu/${source.key}.webp`, alt: source.alt, title: source.title,
    author: source.author || text(meta.Artist.value), source_url: cleanURL(info.descriptionurl),
    license, license_url: cleanURL(source.license_url || meta.LicenseUrl.value), source_date: text(meta.DateTimeOriginal?.value) || `Uploaded ${info.timestamp}`,
    source_description: text(meta.ImageDescription?.value), downloaded_from: downloadURL, original_url: info.url ? cleanURL(info.url) : null,
    original_sha1: info.sha1, downloaded_sha256: createHash("sha256").update(input).digest("hex"),
    retrieved_on: new Date().toISOString().slice(0, 10), crop: source.crop,
    transformations: `${source.crop ? "Crop to the recorded relative rectangle; " : ""}Auto-orient, strip metadata, convert to WebP; display cropped to fit`,
    width: image.width, height: image.height, sha256: image.sha256, byte_size: image.bytes.length }
  await writeFile(new URL(`${source.key}.webp`, directory), image.bytes)
  locked = [...locked.filter(photo => photo.key !== source.key), record].sort((a, b) => a.key.localeCompare(b.key))
  await writeFile(lockPath, JSON.stringify(locked, null, 2) + "\n")
  console.log(`${source.key}: ${image.width} × ${image.height}, ${Math.round(image.bytes.length / 1024)} KiB · ${license}`)
}
console.log("Review each photograph before importing the menu. Source metadata is recorded in scripts/data/menu-photos.json.")
