import { copyFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const target = new URL("../supabase/functions/_shared/", import.meta.url)
await mkdir(target, { recursive: true })
await copyFile(fileURLToPath(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")), new URL("magick.wasm", target))
console.log("Prepared pinned ImageMagick WASM for the asset-gateway static bundle.")
