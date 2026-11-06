import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { localFetch } from "./lib/dev-target.mjs"

// Configure only the already inspected local stack. Generated credentials never enter stdout.
const instanceId = process.env.DEV_EXPECTED_INSTANCE_ID
if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(instanceId || "")) {
  throw new Error("Set DEV_EXPECTED_INSTANCE_ID to the UUID returned by the read-only database inspection.")
}
const root = fileURLToPath(new URL("../", import.meta.url))
const env = { ...process.env }
if (process.platform === "win32") {
  const locations = [join(process.env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources", "bin"),
    ...["Programs/DockerDesktop", "DockerDesktop"].map(path => join(process.env.LOCALAPPDATA || "", path, "resources", "bin"))]
  const directory = locations.find(path => existsSync(join(path, "docker.exe")))
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH"
  if (directory) env[pathKey] = directory + delimiter + (env[pathKey] || "")
}
const result = spawnSync(process.execPath, [join(root, "node_modules", "supabase", "dist", "supabase.js"), "status", "-o", "json"],
  { cwd: root, env, encoding: "utf8", timeout: 30000 })
if (result.error || result.status !== 0) throw new Error("Cannot inspect the local stack. Start Docker Desktop and run npx supabase start first.")
let status
try { status = JSON.parse(result.stdout) } catch { throw new Error("Local Supabase status did not return valid JSON.") }
if (status.API_URL !== "http://127.0.0.1:54321" || !status.SERVICE_ROLE_KEY || !(status.PUBLISHABLE_KEY || status.ANON_KEY)) {
  throw new Error("Expected the local Supabase API at http://127.0.0.1:54321 with separate server and public keys.")
}
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: localFetch(status.API_URL) } })
const { data, error } = await service.rpc("dev_fixture_target")
if (error || data?.application !== "iust-connect" || data.instance_id !== instanceId) {
  throw new Error("The local database does not match the exact inspected IUST Orbit instance.")
}
const files = {
  ".env.local": `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY || status.ANON_KEY}\nVITE_APP_URL=http://localhost:5173\n`,
  ".env.functions.local": `APP_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\nASSET_CLEANUP_SECRET=${randomBytes(32).toString("base64url")}\n`,
}
for (const [name, contents] of Object.entries(files)) {
  try {
    await writeFile(join(root, name), contents, { flag: "wx", mode: 0o600 })
    console.log(`Created ignored ${name}.`)
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    console.log(`Preserved existing ${name}; review its configuration before using this stack.`)
  }
}
console.log(`Local instance verified: ${instanceId}. No accounts, fixtures or cloud resources were modified.`)
