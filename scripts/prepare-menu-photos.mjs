import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { normalizeImage } from "../supabase/functions/_shared/image-validator.mjs"

// Curated Wikimedia photographs only. This is an operator build tool, never a browser request.
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
  const prior = locked.find(photo => photo.key === source.key)
  if (prior?.title === source.title && prior.alt === source.alt && (!source.author || prior.author === source.author) && (!source.license_url || prior.license_url === source.license_url)) {
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
const params = new URLSearchParams({ action: "query", format: "json", titles: pending.map(photo => photo.title).join("|"),
  prop: "imageinfo", iiprop: "url|extmetadata|size|sha1|timestamp", iiurlwidth: "800" })
const metadata = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers, signal: AbortSignal.timeout(30000) })
if (!metadata.ok) throw new Error(`Wikimedia metadata returned HTTP ${metadata.status}. Retry later; completed files are preserved.`)
const pages = Object.values((await metadata.json()).query?.pages || {})
const text = value => (value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
const cleanURL = value => { const url = new URL(value); url.protocol = "https:"; url.search = ""; return url.href }
for (const source of pending) {
  const page = pages.find(page => page.title === source.title), info = page?.imageinfo?.[0], meta = info?.extmetadata
  if (!info || !meta?.LicenseShortName?.value || !(source.license_url || meta.LicenseUrl?.value) || !meta.Artist?.value) throw new Error(`Incomplete photograph/attribution metadata for ${source.title}. Review the source.`)
  const license = text(meta.LicenseShortName.value)
  if (!/^(CC BY(?:-SA)? [234]\.0|CC0|Public domain)$/.test(license)) throw new Error(`Review the licence for ${source.title}: ${license}`)
  const downloadURL = cleanURL(info.thumburl || info.url)
  const response = await fetch(downloadURL, { headers, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Photo ${source.key} returned HTTP ${response.status}. Retry later; completed files are preserved.`)
  const input = new Uint8Array(await response.arrayBuffer())
  const image = await normalizeImage(input, () => readFile(new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm"))))
  const record = { key: source.key, path: `/images/menu/${source.key}.webp`, alt: source.alt, title: source.title,
    author: source.author || text(meta.Artist.value), source_url: cleanURL(info.descriptionurl),
    license, license_url: cleanURL(source.license_url || meta.LicenseUrl.value), source_date: text(meta.DateTimeOriginal?.value) || `Uploaded ${info.timestamp}`,
    source_description: text(meta.ImageDescription?.value), downloaded_from: downloadURL, original_url: cleanURL(info.url),
    original_sha1: info.sha1, downloaded_sha256: createHash("sha256").update(input).digest("hex"),
    retrieved_on: new Date().toISOString().slice(0, 10), transformations: "Auto-orient, strip metadata, convert to WebP; display cropped to fit",
    width: image.width, height: image.height, sha256: image.sha256, byte_size: image.bytes.length }
  await writeFile(new URL(`${source.key}.webp`, directory), image.bytes)
  locked = [...locked.filter(photo => photo.key !== source.key), record].sort((a, b) => a.key.localeCompare(b.key))
  await writeFile(lockPath, JSON.stringify(locked, null, 2) + "\n")
  console.log(`${source.key}: ${image.width} × ${image.height}, ${Math.round(image.bytes.length / 1024)} KiB · ${license}`)
}
console.log("Review each photograph before importing the menu. Source metadata is recorded in scripts/data/menu-photos.json.")
