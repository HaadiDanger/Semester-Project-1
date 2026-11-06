import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createSupabaseDouble } from "./helpers/supabase-double.mjs"
import { createUser, profileReferences, publishProfile, saveProfile, token, worker } from "./helpers/records.mjs"
import { rpc } from "./helpers/database.mjs"
import { createCleanupHandler } from "../supabase/functions/_shared/cleanup-handler.mjs"
import { sampleEvidence } from "../scripts/fixtures/sample-evidence.mjs"

let target, db, owner, admin, refs
before(async () => {
  target = await createSupabaseDouble(); db = target.db
  owner = await createUser(db); admin = await createUser(db, { role: "admin" }); refs = await profileReferences(db, admin)
})
after(async () => { await db?.close() })
const request = (body, id = owner, extra = {}) => new Request("http://localhost:54321/functions/v1/asset-gateway", {
  method: "POST", headers: { origin: "http://localhost:5173", ...(id ? { authorization: `Bearer test-user.${id}` } : {}) }, body: JSON.stringify(body), ...extra,
})
async function reserve(bytes = sampleEvidence(), purpose = "portfolio", id = owner) {
  const asset = await rpc(db, id, "reserve_asset", { p_purpose: purpose, p_request_id: token() })
  assert.equal((await target.uploadFor(id, asset.bucket, asset.path, bytes)).error, null)
  return asset
}

test("gateway validates origins, methods, bounded JSON and bearer tokens before processing", async () => {
  const body = { action: "process", asset_id: token() }
  assert.equal((await target.handler(request(body, null))).status, 401)
  assert.equal((await target.handler(request(body, owner, { headers: { origin: "https://unapproved.example.invalid" } }))).status, 403)
  assert.equal((await target.handler(request(body, owner, { headers: { authorization: "Bearer invalid" } }))).status, 401)
  assert.equal((await target.handler(request({ ...body, owner_id: owner }))).status, 400)
  assert.equal((await target.handler(request(body, owner, { body: "{" }))).status, 400)
  assert.equal((await target.handler(request(body, owner, { body: " ".repeat(4100) }))).status, 413)
  assert.equal((await target.handler(new Request("http://localhost", { method: "GET" }))).status, 405)
  const options = await target.handler(new Request("http://localhost", { method: "OPTIONS", headers: { origin: "http://localhost:5173" } }))
  assert.equal(options.status, 204); assert.equal(options.headers.get("access-control-allow-origin"), "http://localhost:5173")
})

test("real image processing plus SQL finalization publishes normalized bytes and safely retries ready claims", async () => {
  const asset = await reserve()
  const result = await target.handler(request({ action: "process", asset_id: asset.id }))
  assert.equal(result.status, 200); assert.equal((await result.json()).state, "ready")
  const state = (await db.query("select * from private.assets where id=$1", [asset.id])).rows[0]
  assert.equal(state.media_type, "image/webp"); assert.equal(state.width, 320)
  assert.ok(target.bytes.has(`${state.bucket_id}/${state.object_path}`))
  assert.equal(target.bytes.has(`upload-quarantine/${asset.path}`), false)
  assert.equal((await target.handler(request({ action: "process", asset_id: asset.id }))).status, 200)
  assert.equal((await target.handler(request({ action: "read", asset_id: asset.id }, null))).status, 403)
})

test("public reads stream no-store WebP while profile unpublication revokes new reads", async () => {
  const asset = await reserve(sampleEvidence(), "photo")
  await target.handler(request({ action: "process", asset_id: asset.id }))
  const saved = await saveProfile(db, owner, refs, { photo_asset_id: asset.id, photo_audience: "public" })
  const p = await publishProfile(db, owner, admin, saved.write_version)
  const response = await target.handler(request({ action: "read", asset_id: asset.id }, null))
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/webp")
  assert.match(response.headers.get("cache-control"), /no-store/)
  assert.match(response.headers.get("content-security-policy"), /sandbox/)
  assert.ok((await response.arrayBuffer()).byteLength > 0)
  await rpc(db, owner, "profile_action", { p_action: "unpublish", p_expected_version: p.write_version, p_request_id: token() })
  assert.equal((await target.handler(request({ action: "read", asset_id: asset.id }, null))).status, 403)
})

test("bad bytes and Storage failures remain unreadable and are queued for cleanup", async () => {
  const invalid = await reserve(new TextEncoder().encode("<svg><script>alert(1)</script></svg>"))
  assert.equal((await target.handler(request({ action: "process", asset_id: invalid.id }))).status, 422)
  assert.equal((await db.query("select state from private.assets where id=$1", [invalid.id])).rows[0].state, "delete_pending")
  const outage = await reserve()
  target.faults.upload = true
  assert.equal((await target.handler(request({ action: "process", asset_id: outage.id }))).status, 502)
  target.faults.upload = false
  assert.equal((await target.handler(request({ action: "read", asset_id: outage.id }))).status, 403)
})

test("lost completion and quarantine-deletion responses preserve successful uploads", async () => {
  const first = await reserve()
  target.faults.afterRpc = name => { if (name === "worker_complete_asset") { target.faults.afterRpc = null; throw new Error("Lost commit response") } }
  assert.equal((await target.handler(request({ action: "process", asset_id: first.id }))).status, 200)
  assert.equal((await db.query("select state from private.assets where id=$1", [first.id])).rows[0].state, "ready")
  const second = await reserve()
  target.faults.beforeRemove = () => { target.faults.beforeRemove = null; throw new Error("Cleanup transport error") }
  assert.equal((await target.handler(request({ action: "process", asset_id: second.id }))).status, 200)
})

test("late Storage writes after an expired processing lease are requeued instead of becoming invisible orphans", async () => {
  const asset = await reserve()
  target.faults.beforeUpload = async () => {
    target.faults.beforeUpload = null
    await db.query("update private.assets set processing_expires_at=now()-interval '1 minute' where id=$1", [asset.id])
    const job = (await worker(db, "worker_claim_cleanup", { p_limit: 100 })).find(job => job.id === asset.id)
    await worker(db, "worker_finish_cleanup", { p_id: job.id, p_token: job.token, p_success: true })
  }
  const result = await target.handler(request({ action: "process", asset_id: asset.id }))
  assert.equal(result.status, 409)
  assert.equal((await db.query("select state from private.assets where id=$1", [asset.id])).rows[0].state, "delete_pending")
  assert.equal((await worker(db, "worker_claim_cleanup", { p_limit: 100 })).some(job => job.id === asset.id && job.delete_final), true)
})

test("cleanup requires its independent secret, handles individual failures and acknowledges leases", async () => {
  const secret = "test-only-cleanup-secret-".repeat(3)
  const handler = createCleanupHandler({ service: target.service, cleanupSecret: secret })
  for (const authorization of ["", secret, "Bearer sb_publishable_test", `Bearer test-user.${admin}`]) {
    assert.equal((await handler(new Request("http://localhost/cleanup", { method: "POST", headers: { authorization } }))).status, 401)
  }
  const asset = await reserve()
  await db.query("update private.assets set expires_at=now()-interval '1 minute' where id=$1", [asset.id])
  target.faults.remove = 1
  const invoke = () => handler(new Request("http://localhost/cleanup", { method: "POST", headers: { authorization: `Bearer ${secret}` } }))
  assert.equal((await invoke()).status, 200)
  assert.equal((await db.query("select cleanup_error from private.assets where id=$1", [asset.id])).rows[0].cleanup_error, "storage_delete_failed")
  await db.query("update private.assets set cleanup_expires_at=now()-interval '1 minute' where id=$1", [asset.id])
  const result = await (await invoke()).json()
  assert.ok(result.completed > 0)
  assert.equal((await db.query("select state from private.assets where id=$1", [asset.id])).rows[0].state, "deleted")
})
