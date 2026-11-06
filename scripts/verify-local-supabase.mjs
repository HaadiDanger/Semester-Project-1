import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { connectDevTarget, localFetch, rpc } from "./lib/dev-target.mjs"
import { isMain, readManifest, verifyFixtureAccount } from "./lib/fixture-manifest.mjs"
import { SEED_BATCH } from "./fixtures/profiles.mjs"
import { sampleEvidence } from "./fixtures/sample-evidence.mjs"

// Real local Auth / PostgREST / Storage / Edge integration only. There is no mock fallback.
// Uses three existing, hash-verified fixture accounts, restores the edited profile, and queues its test image for cleanup.
function payload(profile) {
  return {
    display_name: profile.display_name, programme_id: profile.programme_id, member_type: profile.member_type,
    stage_number: profile.stage_number, graduation_year: profile.graduation_year, bio: profile.bio, about: profile.about,
    services: profile.services, interests: profile.interests, skills: profile.skills.map(skill => skill.id),
    photo_asset_id: profile.photo_asset_id, photo_audience: profile.photo_audience, visibility: profile.visibility,
    projects: profile.projects.map(({ id, title, description, external_url, asset_id, audience, sort_order }) => ({ id, title, description, external_url, asset_id, audience, sort_order })),
    contacts: profile.contacts.map(({ id, kind, label, value, audience }) => ({ id, kind, label, value, audience })),
  }
}
async function denied(request, label) {
  const { data, error } = await request
  assert.ok(error || data === null || Array.isArray(data) && data.length === 0, label)
}

export async function verifyLocalSupabase() {
  if (!process.argv.includes("--confirm=exercise-local-fixtures")) throw new Error("Pass --confirm=exercise-local-fixtures. This integration check temporarily edits member-45 and uploads a labelled sample image on the explicitly enabled local instance.")
  const target = await connectDevTarget() // Read-only target verification precedes every integration write.
  const manifest = await readManifest(new URL("../.dev-seed/accounts.json", import.meta.url), target)
  if (!manifest) throw new Error("Run the guarded local seed first; no matching fixture manifest was found.")
  const inventory = await rpc(target.service, "dev_fixture_inventory", { p_instance_id: target.instanceId, p_batch_id: SEED_BATCH })
  const keys = ["sample-admin", "member-45", "member-44"]
  for (const key of keys) {
    const record = manifest.accounts[key]
    const account = inventory.users.find(user => user.id === record?.id)
    if (!account || key !== "sample-admin" && !record.completed) throw new Error(`Seed account ${key} is incomplete. Finish seeding before integration checks.`)
    verifyFixtureAccount(account, key, record)
  }
  const clients = []
  async function signIn(key) {
    const client = target.client(); clients.push(client)
    const { data, error } = await client.auth.signInWithPassword({ email: manifest.accounts[key].email, password: manifest.accounts[key].password })
    if (error) throw error
    assert.equal(data.user.id, manifest.accounts[key].id)
    const confirmed = await client.auth.getUser()
    if (confirmed.error) throw confirmed.error
    verifyFixtureAccount(confirmed.data.user, key, manifest.accounts[key])
    return client
  }
  let owner, admin, original, expectedVersion, asset, touched = false
  try {
    admin = await signIn("sample-admin"); owner = await signIn("member-45")
    const other = await signIn("member-44"), secondSession = await signIn("member-45"), anonymous = target.client()
    const context = await rpc(owner, "get_session_context")
    assert.equal(context.is_admin, false); assert.equal(context.is_sample, true)
    assert.equal((await rpc(admin, "get_session_context")).is_admin, true)
    original = await rpc(owner, "get_my_profile")
    assert.ok(original?.is_sample && original.status === "approved" && original.discovery_opt_in && !original.deletion_requested_at,
      "member-45 must be an active, published fixture before this check")
    expectedVersion = original.write_version
    assert.ok(await rpc(anonymous, "get_profile", { p_id: original.id }))
    await denied(anonymous.rpc("get_my_profile"), "anonymous owner API must be denied")
    await denied(other.rpc("get_admin_snapshot"), "ordinary sessions must not read administration")
    await denied(owner.from("profiles").update({ display_name: "Forbidden direct write" }).eq("id", original.id).select("id"), "direct table updates must be denied")
    await denied(owner.from("profiles").select("photo_asset_id"), "private photo pointers must not be selectable")
    await denied(other.rpc("save_my_profile", { p_profile: { ...payload(original), id: original.id }, p_expected_version: 0, p_request_id: randomUUID() }), "spoofed ownership must be denied")
    await denied(owner.rpc("worker_claim_asset", { p_id: randomUUID(), p_user_id: original.id }), "ordinary sessions must not call worker RPCs")

    asset = await rpc(owner, "reserve_asset", { p_purpose: "portfolio", p_request_id: randomUUID() })
    const upload = await owner.storage.from(asset.bucket).upload(asset.path, sampleEvidence(), { contentType: "image/png", upsert: false })
    if (upload.error) throw upload.error
    await denied(other.storage.from(asset.bucket).upload(`${original.id}/${randomUUID()}`, sampleEvidence(), { contentType: "image/png" }), "foreign quarantine uploads must be denied")
    await denied(owner.storage.from(asset.bucket).download(asset.path), "raw quarantine bytes must not be downloadable")
    await denied(owner.storage.from(asset.bucket).createSignedUrl(asset.path, 60), "quarantine signing must be denied")
    await denied(owner.storage.from(asset.bucket).list(original.id), "quarantine listing must not expose objects")
    const processed = await owner.functions.invoke("asset-gateway", { body: { action: "process", asset_id: asset.id } })
    if (processed.error) throw processed.error
    assert.equal(processed.data.state, "ready")
    const fetchLocal = localFetch(target.url)
    async function image(client) {
      const session = client ? (await client.auth.getSession()).data.session : null
      return fetchLocal(`${target.url}/functions/v1/asset-gateway`, { method: "POST", headers: {
        apikey: process.env.DEV_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session?.access_token || process.env.DEV_SUPABASE_PUBLISHABLE_KEY}`, "content-type": "application/json",
      }, body: JSON.stringify({ action: "read", asset_id: asset.id }) })
    }
    assert.equal((await image(null)).status, 403)
    assert.equal((await image(other)).status, 403)
    const ownImage = await image(owner)
    assert.equal(ownImage.status, 200); assert.equal(ownImage.headers.get("content-type"), "image/webp")
    assert.match(ownImage.headers.get("cache-control"), /no-store/)
    assert.ok((await ownImage.arrayBuffer()).byteLength > 0)
    await denied(owner.storage.from("profile-media").createSignedUrl(`${original.id}/${asset.id}.webp`, 60), "final bucket signing must be denied")

    const projects = ["owner", "campus", "public"].map((audience, index) => ({ id: randomUUID(), title: `Integration sample ${index + 1}`,
      description: "Temporary local integration example, not genuine student work.", audience, sort_order: index,
      external_url: null, asset_id: audience === "public" ? asset.id : null }))
    const saved = await rpc(owner, "save_my_profile", { p_profile: { ...payload(original), projects }, p_expected_version: expectedVersion, p_request_id: randomUUID() })
    expectedVersion = saved.write_version; touched = true
    assert.equal(await rpc(anonymous, "get_profile", { p_id: original.id }), null)
    assert.equal(await rpc(other, "get_profile", { p_id: original.id }), null)
    assert.deepEqual((await rpc(secondSession, "get_my_profile")).projects.map(project => project.id), projects.map(project => project.id))
    const submitted = await rpc(owner, "profile_action", { p_action: "submit", p_expected_version: expectedVersion, p_request_id: randomUUID() })
    expectedVersion = submitted.write_version
    await rpc(admin, "admin_moderate_profile", { p_user_id: original.id, p_action: "approve", p_expected_version: expectedVersion,
      p_data: { reason: "Local integration sample approval" }, p_request_id: randomUUID() })
    expectedVersion++
    assert.equal((await rpc(anonymous, "get_profile", { p_id: original.id })).projects.length, 1)
    assert.equal((await rpc(other, "get_profile", { p_id: original.id })).projects.length, 2)
    assert.equal((await image(null)).status, 200)
    const hidden = await rpc(owner, "profile_action", { p_action: "unpublish", p_expected_version: expectedVersion, p_request_id: randomUUID() })
    expectedVersion = hidden.write_version
    assert.equal((await image(null)).status, 403)
    if (manifest.includeCanteens !== false) {
      const current = await rpc(anonymous, "get_canteen_prices", { p_filters: { query: "Lemon drink" } })
      assert.equal(current.total, 1, "the full seed's current-first canteen case must exist")
      assert.equal(current.items[0].status, "unverified")
      const prices = await rpc(anonymous, "get_canteen_prices", { p_filters: { query: "Lemon drink", budget: "25" } })
      assert.equal(prices.total, 0, "an older verified price must not resurface under a budget")
    } else console.log("Canteen comparison checks skipped: this instance uses a profiles-only fixture manifest.")
    await denied(anonymous.rpc("admin_price_history", { p_offering_id: randomUUID() }), "price evidence/history must be private")
    console.log(`Real local integration checks passed for instance ${target.instanceId}: Auth sessions, PostgREST ownership/privacy, three portfolios, moderation, Storage denials and Edge normalization/streaming${manifest.includeCanteens !== false ? ", plus current-first prices" : ""}.`)
  } finally {
    try {
      if (touched) {
        const current = await rpc(owner, "get_my_profile")
        assert.equal(current.write_version, expectedVersion, "Fixture changed concurrently. Preserve it and restore manually; the check will not overwrite another edit.")
        if (current.moderation_status === "pending") {
          expectedVersion = (await rpc(owner, "profile_action", { p_action: "unpublish", p_expected_version: expectedVersion, p_request_id: randomUUID() })).write_version
        }
        expectedVersion = (await rpc(owner, "save_my_profile", { p_profile: payload(original), p_expected_version: expectedVersion, p_request_id: randomUUID() })).write_version
        expectedVersion = (await rpc(owner, "profile_action", { p_action: "submit", p_expected_version: expectedVersion, p_request_id: randomUUID() })).write_version
        await rpc(admin, "admin_moderate_profile", { p_user_id: original.id, p_action: "approve", p_expected_version: expectedVersion,
          p_data: { reason: "Restore fixture after local integration check" }, p_request_id: randomUUID() })
        assert.deepEqual(payload(await rpc(owner, "get_my_profile")), payload(original))
        console.log("Original fixture content and publication restored; version counters and sample audit history advanced.")
      }
      if (asset) {
        await rpc(owner, "delete_my_asset", { p_id: asset.id, p_request_id: randomUUID() })
        console.log("Temporary sample image queued for the scheduled asset-cleanup worker.")
      }
    } finally { await Promise.allSettled(clients.map(client => client.auth.signOut({ scope: "local" }))) }
  }
}
if (isMain(import.meta.url)) {
  try { await verifyLocalSupabase() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
