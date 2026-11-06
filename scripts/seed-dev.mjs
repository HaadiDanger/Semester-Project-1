import { mkdir } from "node:fs/promises"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { connectDevTarget, rpc } from "./lib/dev-target.mjs"
import { categories, profiles, SEED_BATCH } from "./fixtures/profiles.mjs"
import { sampleEvidence } from "./fixtures/sample-evidence.mjs"
import { canteenCases } from "./fixtures/canteens.mjs"
import { DATASET_HASH, FIXTURES, isMain, readManifest, verifyFixtureAccount, writeManifest } from "./lib/fixture-manifest.mjs"

export async function seedDevelopment({ connect = connectDevTarget, directory = new URL("../.dev-seed/", import.meta.url), log = console.log, includeCanteens } = {}) {
if (includeCanteens !== undefined && typeof includeCanteens !== "boolean") throw new Error("includeCanteens must be a boolean when provided.")
const target = await connect() // No writes before all target guards pass.
const manifestPath = new URL("accounts.json", directory)
let manifest = await readManifest(manifestPath, target)
if (manifest && (manifest.includeCanteens ?? true) && includeCanteens === false) {
  throw new Error("Canteen fixtures were already enabled for this manifest. --profiles-only does not delete existing data; use the documented targeted cleanup before starting a profiles-only batch.")
}
const withCanteens = includeCanteens ?? manifest?.includeCanteens ?? true
await mkdir(directory, { recursive: true })
manifest ??= { instanceId: target.instanceId, batchId: SEED_BATCH, datasetHash: DATASET_HASH, seededAt: new Date().toISOString(), accounts: {} }
manifest.includeCanteens = withCanteens
const persist = () => writeManifest(manifestPath, manifest)
const token = text => {
  const hash = createHash("sha256").update(`${SEED_BATCH}:${text}`).digest("hex").slice(0, 32)
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20)}`
}
const existingUsers = []
for (let page = 1; ; page++) {
  const { data, error } = await target.service.auth.admin.listUsers({ page, perPage: 100 })
  if (error) throw error
  existingUsers.push(...data.users)
  if (data.users.length < 100) break
}
async function account(key, isAdmin = false) {
  let record = manifest.accounts[key]
  const email = FIXTURES[key].email
  if (!record) {
    if (existingUsers.some(item => item.email === email)) throw new Error(`Fixture ${key} exists but its local credentials are missing. Use targeted cleanup; do not overwrite the account.`)
    record = manifest.accounts[key] = { email, fixtureHash: FIXTURES[key].hash, password: randomBytes(24).toString("base64url"), completed: false }
    await persist()
  }
  let found = existingUsers.find(item => item.email === email)
  if (!found && record.id) throw new Error(`Fixture ${key} no longer exists at its recorded Auth UUID. Run targeted cleanup before reseeding.`)
  if (!found) {
    const { data, error } = await target.service.auth.admin.createUser({ email, password: record.password, email_confirm: true,
      app_metadata: { iust_connect_fixture: true, seed_batch_id: SEED_BATCH, fixture_key: key, fixture_hash: FIXTURES[key].hash } })
    if (error) throw error
    found = data.user
    existingUsers.push(found)
  }
  verifyFixtureAccount(found, key, record)
  record.id = found.id
  await persist()
  await rpc(target.service, "dev_register_fixture", { p_instance_id: target.instanceId, p_batch_id: SEED_BATCH, p_user_id: found.id, p_admin: isAdmin })
  const client = target.client()
  const { error } = await client.auth.signInWithPassword({ email: record.email, password: record.password })
  if (error) throw error
  return { client, record }
}
const { client: admin } = await account("sample-admin", true)
const references = await rpc(admin, "get_reference_data", { p_include_inactive: true })
async function reference(table, data) {
  const found = references[table].find(item => table === "canteen_offerings"
    ? item.canteen_id === data.canteen_id && item.menu_item_id === data.menu_item_id
    : item.name === data.name)
  if (found) {
    if (!found.is_sample) throw new Error(`A genuine ${table} entry conflicts with fixture ${data.name}. Existing data was preserved.`)
    return found.id
  }
  const result = await rpc(admin, "admin_save_reference", { p_table: table, p_id: null, p_data: data,
    p_expected_updated_at: null, p_reason: "Development fixture — not official IUST reference information", p_request_id: token(`reference:${table}:${JSON.stringify(data)}`) })
  references[table].push({ ...data, ...result, is_sample: true })
  return result.id
}
const programmes = []
for (let i = 0; i < 3; i++) {
  const department = await reference("departments", { name: `Sample Department ${String.fromCharCode(65 + i)} (development)` })
  programmes.push(await reference("programmes", { name: `Sample Programme ${String.fromCharCode(65 + i)} (development)`, department_id: department,
    stage_unit: i === 1 ? "year" : "semester", stage_count: i === 1 ? 3 : i === 2 ? 6 : 8 }))
}
const skillIds = {}
for (const [name, skills] of Object.entries(categories)) {
  const category = await reference("skill_categories", { name })
  for (const name of skills) skillIds[name] = await reference("skills", { name, category_id: category })
}
for (const [index, example] of profiles.entries()) {
  const { client, record } = await account(example.key)
  if (record.completed) { await client.auth.signOut(); continue }
  let profile = await rpc(client, "get_my_profile")
  if (!profile) {
    await rpc(client, "save_my_profile", { p_profile: {
      display_name: example.name, bio: example.bio, about: example.about, programme_id: programmes[example.programme],
      member_type: example.member_type, stage_number: example.member_type === "student" ? example.stage_number : null,
      graduation_year: example.member_type === "graduate" ? 2025 : null, skills: example.skills.map(name => skillIds[name]),
      projects: example.projects, contacts: [], visibility: "public", photo_audience: "owner",
    }, p_expected_version: 0, p_request_id: token(`${example.key}:save`) })
    profile = await rpc(client, "get_my_profile")
  }
  if (profile.display_name !== example.name || profile.bio !== example.bio) throw new Error(`Fixture ${example.key} was edited; preserving it rather than overwriting it.`)
  if (profile.status === "draft") {
    await rpc(client, "profile_action", { p_action: "submit", p_expected_version: profile.write_version, p_request_id: token(`${example.key}:submit`) })
    profile = await rpc(client, "get_my_profile")
  }
  if (profile.status === "pending") {
    await rpc(admin, "admin_moderate_profile", { p_user_id: record.id, p_action: "approve", p_expected_version: profile.write_version,
      p_data: { reason: "Simulated moderation of a development fixture; not verified IUST membership" }, p_request_id: token(`${example.key}:approve`) })
    profile = await rpc(client, "get_my_profile")
  }
  if (profile.status !== "approved") throw new Error(`Fixture ${example.key} requires manual review; its current state was preserved.`)
  const rank = [0, 1, 8].indexOf(index) + 1
  if (rank && profile.featured_rank !== rank) await rpc(admin, "admin_moderate_profile", { p_user_id: record.id, p_action: "feature",
    p_expected_version: profile.write_version, p_data: { featured_rank: rank, reason: "Development spotlight fixture" }, p_request_id: token(`${example.key}:feature`) })
  record.completed = true
  await persist()
  await client.auth.signOut()
}

async function finish() {
  await admin.auth.signOut()
  log(`Completed ${profiles.length} Auth-owned development profiles${withCanteens ? " and illustrative canteen cases" : " (canteen fixtures disabled)"} in local instance ${target.instanceId}.`)
  log("Local account credentials are in .dev-seed/accounts.json (ignored by Git). No real IUST identity or price is implied.")
  return { profileCount: profiles.length, instanceId: target.instanceId, includeCanteens: withCanteens }
}
if (!withCanteens) return finish()

// Canteen fixtures use their own labelled catalogue and code-drawn evidence.
const canteens = []
for (const letter of ["A", "B", "C"]) canteens.push(await reference("canteens", { name: `Sample Canteen ${letter}`, location_description: "Development example — not a real IUST canteen" }))
const food = await reference("food_categories", { name: "Development food examples" })
let evidenceId = manifest.evidenceId
if (!evidenceId) {
  const reserved = await rpc(admin, "reserve_asset", { p_purpose: "price_evidence", p_request_id: randomUUID() })
  const upload = await admin.storage.from(reserved.bucket).upload(reserved.path, sampleEvidence(), { contentType: "image/png", upsert: false })
  if (upload.error) throw upload.error
  const processed = await admin.functions.invoke("asset-gateway", { body: { action: "process", asset_id: reserved.id } })
  if (processed.error || processed.data?.state !== "ready") throw new Error("Fixture evidence processing failed. Start the local Edge Functions and rerun the seed; completed profiles are preserved.")
  evidenceId = manifest.evidenceId = reserved.id
  await persist()
}
for (const sample of canteenCases) {
  // Variant and size distinguish otherwise identically named food items.
  const itemKey = `${sample.name} · ${sample.quantity ?? "unknown"} ${sample.unit ?? "size"}`
  const menu = await reference("menu_items", { name: itemKey, variant: sample.variant, food_category_id: food,
    serving_quantity: sample.quantity, unit_code: sample.unit, portion_spec: "", is_comparable: !sample.incomparable })
  for (const [index, amount] of sample.prices.entries()) {
    const offering = await reference("canteen_offerings", { canteen_id: canteens[index], menu_item_id: menu, is_available: !sample.unavailable })
    if (amount === null) continue
    let history = await rpc(admin, "admin_price_history", { p_offering_id: offering })
    if (!history.items.length) {
      await rpc(admin, "admin_record_price", { p_offering_id: offering, p_event_kind: "set", p_amount: String(amount),
        p_expected_price_id: null, p_corrects_price_id: null, p_reason: "Illustrative development price; not a real menu price", p_request_id: token(`price:${offering}`) })
      history = await rpc(admin, "admin_price_history", { p_offering_id: offering })
    }
    let latest = history.items[0]
    if (sample.withdrawn && latest.event_kind !== "withdraw") {
      await rpc(admin, "admin_record_price", { p_offering_id: offering, p_event_kind: "withdraw", p_amount: null,
        p_expected_price_id: latest.id, p_corrects_price_id: null, p_reason: "Sample withdrawal case", p_request_id: token(`withdraw:${offering}`) })
    } else if (!sample.unverified && !sample.withdrawn && !latest.verifications.length && (!sample.replacement || Number(latest.amount) === amount)) {
      const observed = new Date(new Date(manifest.seededAt).getTime() - (sample.stale ? 31 : 0) * 86400000).toISOString()
      await rpc(admin, "admin_verify_price", { p_price_id: latest.id, p_decision: "verified", p_observed_at: observed,
        p_source_method: "simulated", p_evidence_asset_id: evidenceId, p_expected_verification_id: null,
        p_reason: "Simulated verification — development fixture, not a genuine check", p_request_id: token(`verify:${offering}`) })
    }
    if (sample.replacement && Number(latest.amount) === amount) {
      await rpc(admin, "admin_record_price", { p_offering_id: offering, p_event_kind: "set", p_amount: String(sample.replacement),
        p_expected_price_id: latest.id, p_corrects_price_id: null, p_reason: "Development case: a new unverified price replaces an older verified price", p_request_id: token(`replace:${offering}`) })
    }
    if (sample.revoked) {
      latest = (await rpc(admin, "admin_price_history", { p_offering_id: offering })).items[0]
      if (latest.verifications[0]?.decision !== "revoked") await rpc(admin, "admin_verify_price", {
        p_price_id: latest.id, p_decision: "revoked", p_observed_at: null, p_source_method: null, p_evidence_asset_id: null,
        p_expected_verification_id: latest.verifications[0]?.id || null, p_reason: "Development revocation example", p_request_id: token(`revoke:${offering}`),
      })
    }
  }
}
return finish()
}
if (isMain(import.meta.url)) {
  const flags = process.argv.slice(2)
  if (flags.some(flag => !["--profiles-only", "--with-canteens"].includes(flag)) || flags.includes("--profiles-only") && flags.includes("--with-canteens")) {
    throw new Error("Use --profiles-only or --with-canteens, or omit both to keep the manifest's saved choice.")
  }
  await seedDevelopment({ includeCanteens: flags.includes("--profiles-only") ? false : flags.includes("--with-canteens") ? true : undefined })
}
