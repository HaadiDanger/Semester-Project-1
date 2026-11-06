import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, rpc } from "./helpers/database.mjs"
import { createUser, profileReferences, publishProfile, saveProfile, saveReference, token, worker } from "./helpers/records.mjs"

let db, instanceId, refs, admin, member, batchA, batchB, adminA, adminB, memberA, memberB
before(async () => {
  db = await createDatabase()
  await db.exec("update private.instance_config set environment='development',seed_enabled=true")
  instanceId = (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
  admin = await createUser(db, { role: "admin" }); member = await createUser(db)
  refs = await profileReferences(db, admin)
  batchA = token(); batchB = token()
  const fixture = async (batch, isAdmin = false) => {
    const id = await createUser(db, { email: `${token()}@iust-connect.example.invalid`, metadata: { iust_connect_fixture: true, seed_batch_id: batch } })
    await worker(db, "dev_register_fixture", { p_instance_id: instanceId, p_batch_id: batch, p_user_id: id, p_admin: isAdmin })
    return id
  }
  adminA = await fixture(batchA, true); adminB = await fixture(batchB, true)
  memberA = await fixture(batchA); memberB = await fixture(batchB)
  for (const [id, moderator] of [[member, admin], [memberA, adminA], [memberB, adminB]]) {
    const saved = await saveProfile(db, id, refs)
    await publishProfile(db, id, moderator, saved.write_version)
  }
})
after(async () => { await db?.close() })
const report = (actor, target) => rpc(db, actor, "report_profile", { p_profile_id: target, p_category: "other", p_description: "Automated origin-isolation report", p_request_id: token() })
const resolve = (actor, id) => rpc(db, actor, "admin_resolve_request", { p_kind: "report", p_id: id, p_decision: "resolved", p_reason: "Independent test review", p_skill_id: null, p_request_id: token() })

test("sample batches cannot borrow each other's authority, references or private audiences", async () => {
  const categoryA = await saveReference(db, adminA, "skill_categories", { name: "Batch A category" })
  const skillA = await saveReference(db, adminA, "skills", { name: "Batch A skill", category_id: categoryA.id })
  const p = await rpc(db, memberB, "get_my_profile")
  await assert.rejects(saveProfile(db, memberB, refs, { skills: [skillA.id] }, p.write_version), /permitted skills/)
  await assert.rejects(saveReference(db, adminB, "skills", { name: "Cross-batch skill", category_id: categoryA.id }), /valid skill category/)
  await assert.rejects(saveReference(db, adminB, "skill_categories", { name: "Borrowed category" }, categoryA), /not available/)
  await assert.rejects(rpc(db, adminA, "admin_moderate_profile", { p_user_id: memberB, p_action: "suspend", p_expected_version: p.write_version,
    p_data: { reason: "Cross-batch moderation attempt" }, p_request_id: token() }), /not available/)
  let saved = await saveProfile(db, memberB, refs, { visibility: "campus" }, p.write_version)
  await publishProfile(db, memberB, adminB, saved.write_version)
  assert.equal(await rpc(db, memberA, "get_profile", { p_id: memberB }), null)
  assert.equal(await rpc(db, adminA, "get_profile", { p_id: memberB }), null)
  assert.ok(await rpc(db, adminB, "get_profile", { p_id: memberB }))
  const current = await rpc(db, memberB, "get_my_profile")
  saved = await saveProfile(db, memberB, refs, { visibility: "public" }, current.write_version)
  await publishProfile(db, memberB, adminB, saved.write_version)
  assert.ok(await rpc(db, null, "get_profile", { p_id: memberB }), "labelled public development samples remain discoverable")
})

test("report provenance controls queues, counts and resolution; subjects and reporters must recuse", async () => {
  await assert.rejects(report(memberA, memberB), /different fixture batches/)
  const aboutGenuine = await report(memberA, member)
  const aboutSample = await report(member, memberA)
  assert.equal((await db.query("select count(*)::int n from private.moderation_reports where seed_batch_id=$1", [batchA])).rows[0].n, 2)
  const queue = await rpc(db, adminA, "get_admin_snapshot", { p_section: "reports" })
  assert.deepEqual(queue.items.map(row => row.id), [aboutSample.id])
  assert.equal((await rpc(db, adminA, "get_admin_snapshot")).open_reports, 1)
  assert.equal((await rpc(db, adminB, "get_admin_snapshot")).open_reports, 0)
  await assert.rejects(resolve(adminA, aboutGenuine.id), /not available/)
  await assert.rejects(resolve(adminB, aboutSample.id), /not available/)
  await resolve(adminA, aboutSample.id)
  await resolve(admin, aboutGenuine.id)
  const own = await report(admin, member)
  await assert.rejects(resolve(admin, own.id), /not available/)
  assert.equal((await rpc(db, admin, "get_admin_snapshot", { p_section: "reports" })).items.some(row => row.id === own.id), false)
  const independent = await createUser(db, { role: "admin" })
  assert.equal((await rpc(db, independent, "get_admin_snapshot")).open_reports, 1)
  await resolve(independent, own.id)
})

test("batch cleanup removes its cross-origin reports while retaining genuine reports and other batches", async () => {
  await worker(db, "dev_cleanup_fixture_data", { p_instance_id: instanceId, p_batch_id: batchA })
  assert.equal((await db.query("select count(*)::int n from private.moderation_reports where seed_batch_id=$1", [batchA])).rows[0].n, 0)
  assert.equal((await db.query("select count(*)::int n from private.moderation_reports where seed_batch_id is null")).rows[0].n, 1)
  assert.ok(await rpc(db, null, "get_profile", { p_id: member }))
  assert.ok(await rpc(db, null, "get_profile", { p_id: memberB }))
})
