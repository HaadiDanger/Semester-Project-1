import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { delimiter, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { createCafeMenuImportSQL, loadCafeMenu } from "./lib/cafe-menu-import.mjs"

const { values } = parseArgs({ options: { cafe: { type: "string", default: "nescafe-iust" }, instance: { type: "string" },
  operator: { type: "string", default: "cafe-menu-import-cli" }, sql: { type: "string" } } })
const { menu, photos } = await loadCafeMenu(values.cafe)
const sql = createCafeMenuImportSQL({ menu, photos, instanceId: values.instance, operator: values.operator })
if (values.sql) {
  const destination = resolve(values.sql)
  await writeFile(destination, sql, { flag: "wx" })
  console.log(`Wrote ${menu.name} import SQL to ${destination}. It checks the selected instance UUID and runs atomically.`)
} else {
  const root = fileURLToPath(new URL("../", import.meta.url)), env = { ...process.env }
  if (process.platform === "win32") {
    const locations = [join(process.env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources", "bin"),
      ...["Programs/DockerDesktop", "DockerDesktop"].map(path => join(process.env.LOCALAPPDATA || "", path, "resources", "bin"))]
    const directory = locations.find(path => existsSync(join(path, "docker.exe")))
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH"
    if (directory) env[pathKey] = directory + delimiter + (env[pathKey] || "")
  }
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8")
  const project = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1]
  if (!project) throw new Error("Identify the configured local Supabase project before importing a café.")
  const status = spawnSync(process.execPath, [join(root, "node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], { cwd: root, env, encoding: "utf8", timeout: 30000 })
  if (status.error || status.status !== 0) throw new Error("Start the configured local Supabase stack before importing a café.")
  const target = JSON.parse(status.stdout)
  if (target.API_URL !== "http://127.0.0.1:54321") throw new Error("This command imports only into the configured local Supabase stack. Use --sql for an explicitly selected remote database.")
  function database(input) {
    const result = spawnSync("docker", ["exec", "-i", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], { cwd: root, env, input, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || "The local menu database operation failed.")
    if (result.stderr.trim()) console.log(result.stderr.trim())
    return result.stdout.trim()
  }
  const actual = database("select instance_id from private.instance_config where singleton;")
  if (actual !== values.instance) throw new Error("The local database does not match --instance. No menu records were written.")
  database(sql)
  console.log(`${menu.name} menu import completed in local instance ${actual}.`)
  console.log(database("select jsonb_build_object('cafes',(select count(*) from public.canteens where seed_batch_id is null),'published_menu_items',(select count(*) from private.published_canteen_menu));"))
}
