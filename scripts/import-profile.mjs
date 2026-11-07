import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { createClient } from "@supabase/supabase-js"
import { localFetch } from "./lib/dev-target.mjs"
import { createProfileImportSQL, loadProfileImport, profileImportHash } from "./lib/profile-import.mjs"

const { values } = parseArgs({ options: { profile: { type: "string", default: "anas-tech" }, instance: { type: "string" },
  operator: { type: "string", default: "profile-import-cli" } } })
const { profile, bytes } = await loadProfileImport(values.profile)
const sql = createProfileImportSQL({ profile, instanceId: values.instance, operator: values.operator })
const manifestHash = profileImportHash(profile)
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
assert.ok(project, "Identify the configured local Supabase project first")
const result = spawnSync(process.execPath, [join(root, "node_modules/supabase/dist/supabase.js"), "status", "-o", "json"],
  { cwd: root, env, encoding: "utf8", timeout: 30000 })
assert.ok(!result.error && result.status === 0, "Start the configured local Supabase stack before importing a profile")
const target = JSON.parse(result.stdout)
assert.ok(target.API_URL === "http://127.0.0.1:54321" && target.SERVICE_ROLE_KEY && (target.PUBLISHABLE_KEY || target.ANON_KEY),
  "Profile import requires the configured local Supabase API and separate server/public keys")
function database(input) {
  const response = spawnSync("docker", ["exec", "-i", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
    { cwd: root, env, input, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 })
  if (response.error || response.status !== 0) throw new Error(response.stderr?.trim() || "The local profile database operation failed.")
  return response.stdout.trim()
}
const state = JSON.parse(database(`select jsonb_build_object('instance_id',instance_id,
  'ready',exists(select 1 from information_schema.columns where table_schema='private' and table_name='profile_moderation' and column_name='reviewed_by_operator'),
  'receipt',(select details from private.admin_audit_log where action='profile.import' and target_key='${profile.key}'))
  from private.instance_config where singleton;`))
assert.equal(state.instance_id, values.instance, "The local database does not match --instance. No profile data was written.")
assert.ok(state.ready, "Apply the operator profile-import migration before importing")
if (state.receipt) {
  assert.equal(state.receipt.manifest_sha256, manifestHash, "This profile was already imported with different content. Existing data was preserved.")
  console.log(`${profile.display_name} was already imported. Preserved its current content, account, photo and visibility.`)
} else {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch(target.API_URL) } }
  const service = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options)
  const existing = JSON.parse(database(`select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'key',raw_app_meta_data->>'iust_profile_import',
    'hash',raw_app_meta_data->>'manifest_sha256')),'[]') from auth.users where id='${profile.id}' or lower(email)='${profile.placeholder_email}';`))
  assert.ok(existing.length === 0 || existing.length === 1 && existing[0].id === profile.id && existing[0].email === profile.placeholder_email
    && existing[0].key === profile.key && existing[0].hash === manifestHash, "An existing account conflicts with this import. It was preserved.")
  assert.equal(database(`select count(*) from public.profiles where id='${profile.id}' or name_key=private.norm(convert_from(decode('${Buffer.from(profile.display_name).toString("hex")}','hex'),'UTF8'));`),
    "0", "An existing profile conflicts with this import. It was preserved.")
  const credentialsPath = new URL(`../.profile-imports/${profile.key}.json`, import.meta.url)
  let credentials
  try { credentials = JSON.parse(await readFile(credentialsPath, "utf8")) } catch (error) { if (error.code !== "ENOENT") throw error }
  if (credentials) {
    assert.ok(credentials.instanceId === values.instance && credentials.id === profile.id && credentials.email === profile.placeholder_email
      && credentials.manifestHash === manifestHash && typeof credentials.password === "string" && credentials.password.length >= 12,
      "Existing local import credentials do not match this target. They were preserved.")
  } else {
    assert.equal(existing.length, 0, "The existing import account's credentials are missing; its password was preserved")
    credentials = { instanceId: values.instance, id: profile.id, email: profile.placeholder_email, manifestHash, password: randomBytes(24).toString("base64url") }
    await mkdir(new URL("../.profile-imports/", import.meta.url), { recursive: true })
    await writeFile(credentialsPath, JSON.stringify(credentials, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  }
  if (!existing.length) {
    const created = await service.auth.admin.createUser({ id: profile.id, email: credentials.email, password: credentials.password, email_confirm: true,
      app_metadata: { iust_profile_import: profile.key, manifest_sha256: manifestHash }, user_metadata: { display_name: profile.display_name } })
    if (created.error) throw new Error(`Profile account creation failed: ${created.error.message}`)
    assert.equal(created.data.user.id, profile.id)
  }
  const path = `${profile.id}/${profile.photo.id}.webp`
  const upload = await service.storage.from("profile-media").upload(path, bytes, { contentType: "image/webp", cacheControl: "0", upsert: false })
  if (upload.error) {
    // A prior attempt may have uploaded the immutable image before its SQL transaction failed.
    const stored = await service.storage.from("profile-media").download(path)
    if (stored.error || !stored.data) throw new Error(`Profile photo upload failed: ${upload.error.message}`)
    assert.equal(createHash("sha256").update(Buffer.from(await stored.data.arrayBuffer())).digest("hex"), profile.photo.sha256,
      "An existing image conflicts with this import. It was preserved.")
  }
  database(sql)
  const anonymous = createClient(target.API_URL, target.PUBLISHABLE_KEY || target.ANON_KEY, options)
  const published = await anonymous.rpc("get_profile", { p_id: profile.id })
  if (published.error) throw new Error(`Profile verification failed: ${published.error.message}`)
  assert.equal(published.data?.display_name, profile.display_name)
  assert.equal(published.data?.photo_asset_id, profile.photo.id)
  console.log(`Added ${profile.display_name} and its portrait to local instance ${values.instance}.`)
  console.log(`Temporary sign-in credentials: .profile-imports/${profile.key}.json (ignored by Git).`)
}
console.log(`Profile: http://localhost:5173/student/${profile.id}`)
