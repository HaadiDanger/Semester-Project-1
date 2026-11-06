import { deflateSync } from "node:zlib"

// Code-drawn raster, visibly labelled SAMPLE / NOT REAL. No fabricated receipt or photograph.
export function sampleEvidence() {
  const width = 320, height = 160
  const pixels = Buffer.alloc((width * 4 + 1) * height)
  function pixel(x, y, colour) {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const offset = y * (width * 4 + 1) + 1 + x * 4
    pixels.set([...colour, 255], offset)
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixel(x, y, y < 8 || y > 151 ? [188,173,244] : [21,29,36])
  const glyphs = {
    S: [15,16,16,14,1,1,30], A: [14,17,17,31,17,17,17], M: [17,27,21,21,17,17,17], P: [30,17,17,30,16,16,16],
    L: [16,16,16,16,16,16,31], E: [31,16,16,30,16,16,31], N: [17,25,25,21,19,19,17], O: [14,17,17,17,17,17,14],
    T: [31,4,4,4,4,4,4], R: [30,17,17,30,20,18,17], " ": [0,0,0,0,0,0,0],
  }
  function text(label, startY, scale) {
    let startX = Math.floor((width - label.length * 6 * scale) / 2)
    for (const char of label) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (glyphs[char][y] & (1 << (4 - x))) {
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixel(startX + x * scale + dx, startY + y * scale + dy, [167,221,212])
      }
      startX += 6 * scale
    }
  }
  text("SAMPLE", 35, 5); text("NOT REAL", 98, 3)
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const value of body) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
    const result = Buffer.alloc(body.length + 8)
    result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4)
    return result
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))])
}
