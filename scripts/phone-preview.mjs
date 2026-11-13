import { build, loadEnv } from "vite"
import { networkInterfaces, tmpdir } from "node:os"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createPhonePreviewServer, selectLanAddress, validatePreviewBackend } from "./lib/phone-preview.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
if (args.some((value, index) => index % 2 === 0 && !["--host", "--port"].includes(value)) || args.length % 2) throw new Error("Usage: npm run preview:phone -- [--host private-LAN-IP] [--port 4175]")
const host = selectLanAddress(networkInterfaces(), option("--host"))
const port = Number(option("--port") || 4175)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a preview port between 1024 and 65535.")
const env = loadEnv("development", root, "VITE_")
const target = (env.VITE_SUPABASE_URL || "").trim()
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim()
const origin = new URL(env.VITE_APP_URL || "http://localhost:5173").origin
validatePreviewBackend(target, key, origin)
const temp = join(tmpdir(), "opencode")
await mkdir(temp, { recursive: true })
const directory = await mkdtemp(join(temp, "iust-phone-preview-"))
let server
try {
  await build({ root, mode: "phone-preview", define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("/supabase"), "import.meta.env.VITE_APP_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
    "import.meta.env.VITE_PHONE_PREVIEW": JSON.stringify("true"),
  }, build: { outDir: directory, emptyOutDir: true } })
  server = createPhonePreviewServer({ directory, host, target, key, origin })
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve) })
  console.log(`\nPhone preview: http://${host}:${port}/\nWith FPS/JS-heap meter: http://${host}:${port}/?perf=1\nSame router/Wi-Fi required. Public browsing only; no sign-in, uploads or writes.\nKeep this process and the local Supabase stack running. Ctrl+C stops this preview.`)
  const stop = () => server.close(async () => { await rm(directory, { recursive: true, force: true }); process.exit(0) })
  process.once("SIGINT", stop); process.once("SIGTERM", stop)
} catch (error) {
  server?.close()
  await rm(directory, { recursive: true, force: true })
  throw error
}
