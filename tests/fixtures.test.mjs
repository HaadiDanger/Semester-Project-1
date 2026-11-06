import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import { validateDevEnvironment, connectDevTarget, localFetch } from "../scripts/lib/dev-target.mjs"
import { DATASET_HASH, FIXTURES, verifyFixtureAccount } from "../scripts/lib/fixture-manifest.mjs"
import { categories, profiles, SEED_BATCH } from "../scripts/fixtures/profiles.mjs"
import { seedDevelopment } from "../scripts/seed-dev.mjs"
import { cleanupDevelopment } from "../scripts/cleanup-dev.mjs"
import { createSupabaseDouble } from "./helpers/supabase-double.mjs"
import { createUser, profileReferences, publishProfile, readyAsset, saveProfile, saveReference, token, worker } from "./helpers/records.mjs"
import { rpc } from "./helpers/database.mjs"
import { temporaryDirectory } from "./helpers/temp.mjs"

let target, db, directory, admin, genuine, refs, seedManifest
before(async () => {
  target = await createSupabaseDouble(); db = target.db
  directory = await temporaryDirectory("iust-fixtures-")
})
after(async () => { await db?.close(); if (directory) await rm(directory.path, { recursive: true, force: true }) })
const options = () => ({ connect: async () => target, directory: directory.url, log: () => {} })
const manifestPath = () => new URL("accounts.json", directory.url)
const env = () => ({ DEV_SUPABASE_URL: "http://127.0.0.1:54321", DEV_SEED_CONFIRM: "IUST_CONNECT_LOCAL_DEVELOPMENT", DEV_EXPECTED_INSTANCE_ID: target.instanceId,
  DEV_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + "test-only-not-a-key", DEV_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "test-only-not-a-key" })

test("fixture targets reject cloud, host tricks, wrong credentials, bad UUIDs and redirects before writes", async () => {
  assert.equal(validateDevEnvironment(env()).instanceId, target.instanceId)
  for (const url of ["https://example.supabase.co", "http://127.0.0.1:54322", "http://localhost.evil.invalid:54321", "http://user@localhost:54321",
    "http://localhost:54321/not-root", "http://localhost:54321/?redirect=remote", "http://localhost:54321/#fragment", "https://localhost:54321", "http://192.168.1.2:54321"]) {
    assert.throws(() => validateDevEnvironment({ ...env(), DEV_SUPABASE_URL: url }), /local Supabase/)
  }
  assert.throws(() => validateDevEnvironment({ ...env(), DEV_EXPECTED_INSTANCE_ID: "-".repeat(36) }), /exact UUID/)
  assert.throws(() => validateDevEnvironment({ ...env(), DEV_SEED_CONFIRM: "yes" }), /DEV_SEED_CONFIRM/)
  assert.throws(() => validateDevEnvironment({ ...env(), DEV_SUPABASE_PUBLISHABLE_KEY: env().DEV_SUPABASE_SERVICE_ROLE_KEY }), /separate publishable/)
  let calls = 0
  const guarded = localFetch(target.url, async (input, init) => { calls++; assert.equal(init.redirect, "error"); return new Response("{}") })
  await guarded(`${target.url}/rest/v1/rpc/dev_fixture_target`)
  assert.throws(() => guarded("https://example.supabase.co/rest/v1"), /cannot leave/)
  assert.equal(calls, 1)
  const previousFetch = globalThis.fetch
  try {
    for (const bad of [{ environment: "production", seed_enabled: false }, { instance_id: token() }, { application: "another-app" }]) {
      globalThis.fetch = async input => {
        assert.match(String(input), /\/rest\/v1\/rpc\/dev_fixture_target$/)
        return new Response(JSON.stringify({ application: "iust-connect", instance_id: target.instanceId, environment: "development", seed_enabled: true, ...bad }), { headers: { "content-type": "application/json" } })
      }
      await assert.rejects(connectDevTarget(env()), /does not match/)
    }
  } finally { globalThis.fetch = previousFetch }
  await assert.rejects(cleanupDevelopment({ ...options(), confirm: false }), /Pass --confirm/)
})

test("production SQL independently rejects fixture identities, registration, metadata relabelling and wrong instances", async () => {
  await assert.rejects(createUser(db, { email: "guard@iust-connect.example.invalid" }), /explicitly enabled development/)
  const ordinary = await createUser(db)
  await assert.rejects(worker(db, "dev_register_fixture", { p_instance_id: target.instanceId, p_batch_id: SEED_BATCH, p_user_id: ordinary }), /explicitly enabled/)
  await db.exec("update private.instance_config set environment='development',seed_enabled=true")
  await assert.rejects(worker(db, "dev_register_fixture", { p_instance_id: token(), p_batch_id: SEED_BATCH, p_user_id: ordinary }), /explicitly enabled/)
  await assert.rejects(worker(db, "dev_register_fixture", { p_instance_id: target.instanceId, p_batch_id: SEED_BATCH, p_user_id: ordinary }), /dedicated, confirmed/)
  await assert.rejects(rpc(db, ordinary, "dev_fixture_target"), /permission denied/)
  await assert.rejects(db.query("update private.instance_config set instance_id=$1", [token()]), /immutable/)
  await db.query("delete from private.account_controls where user_id=$1", [ordinary]); await db.query("delete from auth.users where id=$1", [ordinary])
})

test("profiles-only seeding preserves an empty canteen on reruns; an explicit opt-in adds cases without replacing the 45 owners", async () => {
  admin = await createUser(db, { role: "admin" }); genuine = await createUser(db)
  refs = await profileReferences(db, admin)
  const saved = await saveProfile(db, genuine, refs, { display_name: "Mustafa Shahzad", contacts: [{ kind: "email", value: "private@example.invalid", audience: "owner" }] })
  await publishProfile(db, genuine, admin, saved.write_version)
  assert.equal((await seedDevelopment({ ...options(), includeCanteens: false })).profileCount, 45)
  const profilesOnly = JSON.parse(await readFile(manifestPath(), "utf8"))
  assert.equal(profilesOnly.includeCanteens, false)
  assert.equal(Object.keys(profilesOnly.accounts).length, 46)
  const emptyCanteen = async () => (await db.query("select (select count(*) from public.canteens)::int canteens,(select count(*) from public.food_categories)::int categories,(select count(*) from public.menu_items)::int items,(select count(*) from public.canteen_offerings)::int offerings,(select count(*) from private.price_records)::int prices,(select count(*) from private.price_verifications)::int verifications,(select count(*) from private.assets)::int assets")).rows[0]
  assert.deepEqual(await emptyCanteen(), { canteens: 0, categories: 0, items: 0, offerings: 0, prices: 0, verifications: 0, assets: 0 })
  assert.equal((await seedDevelopment(options())).includeCanteens, false)
  assert.deepEqual(await emptyCanteen(), { canteens: 0, categories: 0, items: 0, offerings: 0, prices: 0, verifications: 0, assets: 0 })
  assert.deepEqual(JSON.parse(await readFile(manifestPath(), "utf8")).accounts, profilesOnly.accounts)
  assert.equal((await seedDevelopment({ ...options(), includeCanteens: true })).includeCanteens, true)
  seedManifest = JSON.parse(await readFile(manifestPath(), "utf8"))
  assert.deepEqual(seedManifest.accounts, profilesOnly.accounts)
  assert.equal(seedManifest.datasetHash, DATASET_HASH); assert.equal(Object.keys(seedManifest.accounts).length, 46)
  const samples = (await db.query("select id,display_name,write_version from public.profiles where seed_batch_id=$1 order by id", [SEED_BATCH])).rows
  assert.equal(samples.length, 45); assert.ok(samples.some(row => row.display_name === "Hashim")); assert.ok(samples.some(row => row.display_name === "Mustafa Shahzad"))
  assert.equal((await db.query("select count(*)::int n from public.profiles p join auth.users u on u.id=p.id where p.seed_batch_id=$1", [SEED_BATCH])).rows[0].n, 45)
  assert.equal((await db.query("select count(*)::int n from public.profile_contacts c join public.profiles p on p.id=c.profile_id where p.seed_batch_id=$1", [SEED_BATCH])).rows[0].n, 0)
  assert.ok(profiles.every(profile => profile.skills.every(skill => Object.values(categories).flat().includes(skill))))
  const counts = async () => (await db.query("select (select count(*) from auth.users) users,(select count(*) from private.price_records) prices,(select count(*) from private.price_verifications) checks,(select count(*) from private.admin_audit_log) audit")).rows
  const beforeCounts = await counts()
  await assert.rejects(seedDevelopment({ ...options(), includeCanteens: false }), /Canteen fixtures were already enabled/)
  await seedDevelopment(options())
  assert.deepEqual(await counts(), beforeCounts)
  assert.deepEqual((await db.query("select id,display_name,write_version from public.profiles where seed_batch_id=$1 order by id", [SEED_BATCH])).rows, samples)
  const prices = await rpc(db, null, "get_canteen_prices", { p_filters: { page_size: 48 } })
  assert.ok(prices.items.every(row => row.is_sample))
  for (const status of ["eligible", "unverified", "missing", "withdrawn", "stale", "incomparable", "unavailable", "revoked"]) assert.ok(prices.items.some(row => row.status === status), status)
  assert.equal((await rpc(db, null, "get_canteen_prices", { p_filters: { query: "Lemon drink", budget: "25" } })).total, 0)
  assert.equal((await rpc(db, null, "discover_profiles")).total, 46, "45 samples do not cap enrollment")
  const changed = { ...seedManifest, instanceId: token() }
  await writeFile(manifestPath(), JSON.stringify(changed))
  await assert.rejects(seedDevelopment(options()), /different instance/)
  await assert.rejects(cleanupDevelopment({ ...options(), confirm: true }), /different instance/)
  assert.deepEqual(await counts(), beforeCounts)
  await writeFile(manifestPath(), JSON.stringify(seedManifest))
})

test("sample authority cannot expose genuine private content, alter genuine roles or contaminate real price minima", async () => {
  const sampleAdmin = seedManifest.accounts["sample-admin"].id, member = seedManifest.accounts["member-01"].id
  await assert.rejects(rpc(db, sampleAdmin, "admin_update_settings", { p_stale_after_days: 30, p_eligibility_instructions: "Test", p_reason: "Test", p_request_id: token() }), /Sample administrators/)
  await assert.rejects(rpc(db, sampleAdmin, "admin_moderate_profile", { p_user_id: genuine, p_action: "suspend", p_expected_version: 1, p_data: { reason: "Test" }, p_request_id: token() }), /not available/)
  await assert.rejects(rpc(db, member, "reserve_asset", { p_purpose: "photo", p_request_id: token() }), /initials/)
  let p = await rpc(db, genuine, "get_my_profile")
  assert.deepEqual((await rpc(db, sampleAdmin, "get_profile", { p_id: genuine })).contacts, [])
  assert.equal(Object.hasOwn(await rpc(db, sampleAdmin, "get_profile", { p_id: genuine }), "moderation_status"), false)
  p = await saveProfile(db, genuine, refs, { display_name: "Mustafa Shahzad", visibility: "campus" }, p.write_version)
  await publishProfile(db, genuine, admin, p.write_version)
  assert.equal(await rpc(db, sampleAdmin, "get_profile", { p_id: genuine }), null)
  const sampleRefs = await rpc(db, sampleAdmin, "get_reference_data", { p_include_inactive: true })
  await assert.rejects(saveProfile(db, await createUser(db), refs, { skills: [sampleRefs.skills.find(row => row.is_sample).id] }), /permitted skills/)
  const manager = await createUser(db, { role: "role_manager" })
  await assert.rejects(rpc(db, manager, "manage_role", { p_user_id: admin, p_role: "admin", p_grant: false, p_reason: "Last genuine admin test", p_request_id: token() }), /last active/)
  const category = await saveReference(db, admin, "food_categories", { name: "Shared test food" })
  const menu = await saveReference(db, admin, "menu_items", { food_category_id: category.id, name: "Origin-isolated drink", serving_quantity: 200, unit_code: "ml", is_comparable: true })
  const canteen = await saveReference(db, admin, "canteens", { name: "Genuine-origin test canteen" })
  const evidence = await readyAsset(db, admin, "price_evidence")
  await assert.rejects(worker(db, "worker_asset_access", { p_id: evidence.id, p_viewer_id: sampleAdmin }), /not available/)
  for (const [actor, canteenId, amount, evidenceId, method] of [[admin, canteen.id, "100", evidence.id, "displayed_menu"],
    [sampleAdmin, sampleRefs.canteens.find(row => row.is_sample).id, "0", seedManifest.evidenceId, "simulated"]]) {
    const offering = await saveReference(db, actor, "canteen_offerings", { canteen_id: canteenId, menu_item_id: menu.id, is_available: true })
    const price = await rpc(db, actor, "admin_record_price", { p_offering_id: offering.id, p_event_kind: "set", p_amount: amount, p_expected_price_id: null, p_corrects_price_id: null, p_reason: "Origin test", p_request_id: token() })
    await rpc(db, actor, "admin_verify_price", { p_price_id: price.id, p_decision: "verified", p_observed_at: new Date(Date.now() - 60000).toISOString(), p_source_method: method, p_evidence_asset_id: evidenceId, p_expected_verification_id: null, p_reason: "Origin test", p_request_id: token() })
  }
  const data = await rpc(db, null, "get_canteen_prices", { p_filters: { query: "Origin-isolated drink" } })
  assert.equal(data.items.find(row => !row.is_sample).lowest_price, 100)
  assert.equal(data.items.find(row => row.is_sample).lowest_price, 0)
  assert.ok(data.items.every(row => row.eligible_count === 1))
  await assert.rejects(db.exec("update private.instance_config set environment='production',seed_enabled=false"), /Remove fixture Auth/)
  const changedUuid = { id: token(), email: FIXTURES["member-01"].email, app_metadata: { iust_connect_fixture: true, seed_batch_id: SEED_BATCH, fixture_key: "member-01", fixture_hash: FIXTURES["member-01"].hash } }
  assert.throws(() => verifyFixtureAccount(changedUuid, "member-01", seedManifest.accounts["member-01"]), /exact fixture UUID/)
})

test("targeted cleanup resumes Storage and Auth failures, preserves same-name genuine users and shared references, and reruns safely", async () => {
  const cleanup = () => cleanupDevelopment({ ...options(), confirm: true })
  target.faults.remove = 1
  await assert.rejects(cleanup(), error => error.message.includes("Storage deletion outage"))
  assert.equal((await db.query("select count(*)::int n from public.profiles where seed_batch_id=$1", [SEED_BATCH])).rows[0].n, 0)
  assert.equal((await db.query("select display_name from public.profiles where id=$1", [genuine])).rows[0].display_name, "Mustafa Shahzad")
  assert.equal((await rpc(db, seedManifest.accounts["member-01"].id, "get_session_context")).account_status, "closed")
  target.faults.deleteUser = true
  await assert.rejects(cleanup(), error => error.message.includes("Auth deletion outage"))
  target.faults.deleteUser = false
  const result = await cleanup()
  assert.equal(result.users, 46)
  assert.deepEqual(await cleanup(), { users: 0, assets: 0 })
  assert.equal((await db.query("select count(*)::int n from auth.users where raw_app_meta_data->>'seed_batch_id'=$1", [SEED_BATCH])).rows[0].n, 0)
  assert.equal((await db.query("select count(*)::int n from public.profiles where id=$1", [genuine])).rows[0].n, 1)
  assert.equal((await db.query("select count(*)::int n from public.menu_items where name='Origin-isolated drink'")).rows[0].n, 1)
  assert.equal((await db.query("select count(*)::int n from private.price_records where seed_batch_id is null")).rows[0].n, 1)
  assert.equal((await db.query("select count(*)::int n from private.admin_audit_log where seed_batch_id=$1", [SEED_BATCH])).rows[0].n, 0)
  await db.exec("update private.instance_config set environment='production',seed_enabled=false")
  assert.equal((await rpc(db, null, "get_app_config")).samples_enabled, false)
})
