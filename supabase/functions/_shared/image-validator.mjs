import { ConfigurationFiles, ImageMagick, initializeImageMagick, MagickFormat, ResourceLimits, ColorSpace } from "@imagemagick/magick-wasm"

export const MAX_BYTES = 5 * 1024 * 1024
let initialized
export class ImageInputError extends Error {}
const invalid = () => { throw new ImageInputError("Choose a non-animated JPEG, PNG or WebP image, up to 5 MiB, 4096 px per side and 16 megapixels.") }

// Inspect dimensions before decoding. Content-Type and filenames are not trusted.
export function inspectImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24 || bytes.length > MAX_BYTES) invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (at, length) => String.fromCharCode(...bytes.subarray(at, at + length))
  let format, width, height
  if (bytes[0] === 137 && text(1, 7) === "PNG\r\n\x1a\n" && text(12, 4) === "IHDR") {
    if (bytes.length < 33 || view.getUint32(8) !== 13) invalid()
    format = MagickFormat.Png
    width = view.getUint32(16); height = view.getUint32(20)
    let ended = false
    for (let at = 8; at < bytes.length;) {
      if (at + 12 > bytes.length) invalid()
      const size = view.getUint32(at)
      if (text(at + 4, 4) === "acTL" || size > bytes.length - at - 12) invalid()
      if (text(at + 4, 4) === "IEND") { if (size !== 0 || at + 12 !== bytes.length) invalid(); ended = true }
      at += size + 12
    }
    if (!ended) invalid()
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    format = MagickFormat.Jpeg
    for (let at = 2; at + 9 < bytes.length;) {
      if (bytes[at++] !== 255) invalid()
      while (bytes[at] === 255) at++
      const marker = bytes[at++]
      if (marker === 218 || marker === 217) break
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue
      if (at + 2 > bytes.length) invalid()
      const size = view.getUint16(at)
      if (size < 2 || at + size > bytes.length) invalid()
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if (size < 8) invalid()
        height = view.getUint16(at + 3); width = view.getUint16(at + 5)
        break
      }
      at += size
    }
  } else if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    if (view.getUint32(4, true) !== bytes.length - 8) invalid()
    for (let at = 12; at < bytes.length;) {
      if (at + 8 > bytes.length) invalid()
      const size = view.getUint32(at + 4, true)
      if (["ANIM", "ANMF"].includes(text(at, 4)) || size > bytes.length - at - 8) invalid()
      at += 8 + size + (size % 2)
      if (at > bytes.length) invalid()
    }
    format = MagickFormat.WebP
    const chunk = text(12, 4)
    if (chunk === "VP8X" && bytes.length >= 30) {
      if (bytes[20] & 2) invalid()
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    } else if (chunk === "VP8 " && bytes.length >= 30 && text(23, 3) === "\x9d\x01\x2a") {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383
    } else if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 47) {
      const bits = view.getUint32(21, true)
      width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1
    }
  }
  if (!format || !width || !height || width > 4096 || height > 4096 || width * height > 16000000) invalid()
  return { format, width, height }
}

export async function normalizeImage(bytes, loadWasm) {
  const header = inspectImage(bytes)
  initialized ??= (async () => {
    const config = ConfigurationFiles.default
    config.policy.data = `<policymap>
      <policy domain="delegate" rights="none" pattern="*" />
      <policy domain="coder" rights="none" pattern="*" />
      <policy domain="coder" rights="read|write" pattern="{JPEG,PNG,WEBP}" />
      <policy domain="path" rights="none" pattern="@*" />
    </policymap>`
    await initializeImageMagick(await loadWasm(), config)
    ResourceLimits.width = 4096n
    ResourceLimits.height = 4096n
    ResourceLimits.area = 16000000n
    ResourceLimits.memory = 128n * 1024n * 1024n
    ResourceLimits.disk = 0n
    // The decoder also counts its working images; a limit of one rejects valid PNGs.
    // Animated containers are rejected by inspectImage before decoding.
    ResourceLimits.listLength = 4n
    ResourceLimits.maxProfileSize = 1024n * 1024n
    ResourceLimits.time = 15n
  })().catch(error => { initialized = undefined; throw error })
  await initialized
  let output
  try {
    output = ImageMagick.read(bytes, header.format, image => {
      if (image.width !== header.width || image.height !== header.height) invalid()
      image.autoOrient()
      if (image.width > 2048 || image.height > 2048) image.resize(2048, 2048)
      image.colorSpace = ColorSpace.sRGB
      image.strip()
      image.quality = 85
      return image.write(MagickFormat.WebP, data => ({ bytes: new Uint8Array(data), width: image.width, height: image.height }))
    })
  } catch { invalid() }
  if (!output?.bytes.length || output.bytes.length > MAX_BYTES) invalid()
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", output.bytes))
  return { ...output, sha256: [...hash].map(value => value.toString(16).padStart(2, "0")).join("") }
}
