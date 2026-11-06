import { before, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { ImageMagick, MagickFormat, Orientation } from "@imagemagick/magick-wasm"
import { ImageInputError, inspectImage, normalizeImage, MAX_BYTES } from "../supabase/functions/_shared/image-validator.mjs"
import { sampleEvidence } from "../scripts/fixtures/sample-evidence.mjs"

const png = sampleEvidence()
const loadWasm = () => readFile(new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")))
before(async () => { await normalizeImage(png, loadWasm) })
const encode = (format, change = () => {}) => ImageMagick.read(png, MagickFormat.Png, image => {
  change(image)
  return image.write(format, bytes => new Uint8Array(bytes))
})

test("real WASM decoder accepts PNG, JPEG and WebP, re-encodes pixels, and returns a verifiable digest", async () => {
  for (const bytes of [png, encode(MagickFormat.Jpeg), encode(MagickFormat.WebP)]) {
    const result = await normalizeImage(bytes, loadWasm)
    assert.equal(inspectImage(result.bytes).format, MagickFormat.WebP)
    assert.equal(result.width, 320); assert.equal(result.height, 160)
    assert.equal(result.sha256, createHash("sha256").update(result.bytes).digest("hex"))
    assert.ok(result.bytes.length > 0 && result.bytes.length <= MAX_BYTES)
  }
})

test("normalization strips EXIF/XMP/comments and applies EXIF orientation before stripping", async () => {
  const exif = Buffer.alloc(32)
  exif.write("Exif\0\0II"); exif.writeUInt16LE(42, 8); exif.writeUInt32LE(8, 10)
  exif.writeUInt16LE(1, 14); exif.writeUInt16LE(0x0112, 16); exif.writeUInt16LE(3, 18)
  exif.writeUInt32LE(1, 20); exif.writeUInt16LE(6, 24)
  const jpeg = encode(MagickFormat.Jpeg, image => {
    image.setProfile("exif", exif)
    image.setProfile("xmp", new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/">PRIVATE_LOCATION_TEST</x:xmpmeta>'))
    image.setAttribute("comment", "PRIVATE_COMMENT_TEST")
    image.orientation = Orientation.RightTop
  })
  ImageMagick.read(jpeg, MagickFormat.Jpeg, image => { assert.ok(image.getProfile("exif")); assert.ok(image.getProfile("xmp")) })
  const result = await normalizeImage(jpeg, loadWasm)
  assert.equal(result.width, 160); assert.equal(result.height, 320)
  ImageMagick.read(result.bytes, MagickFormat.WebP, image => {
    assert.equal(image.getProfile("exif"), null); assert.equal(image.getProfile("xmp"), null)
    assert.equal(image.getAttribute("comment"), null)
  })
  assert.equal(Buffer.from(result.bytes).includes(Buffer.from("PRIVATE_")), false)
})

test("large accepted images shrink proportionally to 2048 pixels", async () => {
  const large = encode(MagickFormat.Png, image => image.resize(3000, 1500))
  const result = await normalizeImage(large, loadWasm)
  assert.equal(result.width, 2048); assert.equal(result.height, 1024)
})

test("active formats, oversize bytes, oversized dimensions, truncation and corrupt pixel streams are rejected", async () => {
  const wide = Buffer.from(png); wide.writeUInt32BE(4097, 16)
  const pixels = Buffer.from(png); pixels.writeUInt32BE(4096, 16); pixels.writeUInt32BE(4096, 20)
  const damaged = Buffer.from(png); damaged.fill(0, 50, 150)
  for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    Buffer.from("GIF89a" + "x".repeat(40)), new Uint8Array(MAX_BYTES + 1), wide, pixels, png.subarray(0, 24), png.subarray(0, -3), damaged]) {
    await assert.rejects(normalizeImage(bytes, loadWasm), ImageInputError)
  }
})

test("APNG and animated or malformed WebP containers are rejected before decoding", () => {
  const apng = Buffer.from(png); apng.write("acTL", 37)
  assert.throws(() => inspectImage(apng), ImageInputError)
  const webp = Buffer.from(encode(MagickFormat.WebP))
  const animationChunk = Buffer.alloc(8); animationChunk.write("ANIM")
  const animated = Buffer.concat([webp, animationChunk]); animated.writeUInt32LE(animated.length - 8, 4)
  assert.throws(() => inspectImage(animated), ImageInputError)
  const invalidLength = Buffer.from(webp); invalidLength.writeUInt32LE(0xffffffff, 16)
  assert.throws(() => inspectImage(invalidLength), ImageInputError)
  assert.throws(() => inspectImage(webp.subarray(0, -1)), ImageInputError)
})
