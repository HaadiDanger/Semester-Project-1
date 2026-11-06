import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, asRole, rpc } from "./helpers/database.mjs"
import { createUser, profileReferences, publishProfile, saveProfile, saveReference, token } from "./helpers/records.mjs"

let db, admin, manager, refs
before(async () => {
  db = await createDatabase()
  admin = await createUser(db, { role: "admin" }); manager = await createUser(db, { role: "role_manager" })
  refs = await profileReferences(db, admin)
})
after(async () => { await db?.close() })
const moderate = (id, action, version, data = {}, actor = admin) => rpc(db, actor, "admin_moderate_profile", {
  p_user_id: id, p_action: action, p_expected_version: version, p_data: { reason: "Automated administration decision", ...data }, p_request_id: token(),
})
const merge = (table, source, target, request = token()) => rpc(db, admin, "admin_merge_taxonomy", {
  p_table: table, p_source: source, p_target: target, p_reason: "Consolidate duplicate test references", p_request_id: request,
})
const role = (id, name, grant, actor = manager, request = token()) => rpc(db, actor, "manage_role", {
  p_user_id: id, p_role: name, p_grant: grant, p_reason: "Automated role decision", p_request_id: request,
})

test("role managers and content administrators have distinct powers; self-grants and last-role removal are blocked", async () => {
  const member = await createUser(db)
  await assert.rejects(role(member, "admin", true, admin), /Role-manager/)
  await assert.rejects(rpc(db, manager, "get_admin_snapshot"), /Administrator/)
  await assert.rejects(role(manager, "admin", true), /another account/)
  await assert.rejects(role(admin, "admin", false), /last active/)
  await assert.rejects(role(await createUser(db, { confirmed: false }), "admin", true), /active, confirmed/)
  const request = token()
  assert.deepEqual(await role(member, "admin", true, manager, request), await role(member, "admin", true, manager, request))
  assert.equal((await rpc(db, member, "get_session_context")).is_admin, true)
  const count = (await db.query("select count(*)::int n from private.admin_audit_log where action='role.grant' and target_key=$1", [member])).rows[0].n
  assert.equal(count, 1)
  await role(member, "admin", false)
  assert.equal((await rpc(db, member, "get_session_context")).is_admin, false)
  await assert.rejects(rpc(db, member, "get_admin_snapshot"), /Administrator/)
  assert.equal((await rpc(db, manager, "get_role_directory")).some(row => row.id === member), true)
})

test("moderation protects privileged accounts and private notes; rejection, removal, restoration and email changes enforce review", async () => {
  await assert.rejects(moderate(admin, "suspend", 1), /own account/)
  await assert.rejects(moderate(manager, "suspend", 1), /Revoke protected roles/)
  const id = await createUser(db)
  let p = await saveProfile(db, id, refs)
  p = await rpc(db, id, "profile_action", { p_action: "submit", p_expected_version: p.write_version, p_request_id: token() })
  await moderate(id, "reject", p.write_version, { reason: "Please clarify the biography", staff_note: "Private test note" })
  p = await rpc(db, id, "get_my_profile")
  assert.equal(p.status, "rejected"); assert.equal(p.owner_reason, "Please clarify the biography")
  assert.equal(JSON.stringify(p).includes("Private test note"), false)
  p = await saveProfile(db, id, refs, {}, p.write_version)
  p = await publishProfile(db, id, admin, p.write_version)
  await moderate(id, "remove", p.write_version)
  assert.equal(await rpc(db, null, "get_profile", { p_id: id }), null)
  p = await rpc(db, id, "get_my_profile")
  await assert.rejects(saveProfile(db, id, refs, {}, p.write_version), /removed profiles/)
  await moderate(id, "restore", p.write_version)
  p = await rpc(db, id, "get_my_profile")
  assert.equal(p.status, "draft"); assert.equal(p.discovery_opt_in, false)
  p = await publishProfile(db, id, admin, p.write_version)
  await db.query("update auth.users set email=$2 where id=$1", [id, `${token()}@example.invalid`])
  assert.equal((await rpc(db, id, "get_session_context")).eligibility_status, "pending")
  assert.equal(await rpc(db, null, "get_profile", { p_id: id }), null)
  await assert.rejects(moderate(id, "feature", p.write_version, { featured_rank: 1 }), /changed/)
})

test("reference normalization, parent activity, occupied academic stages and optimistic versions are enforced", async () => {
  await assert.rejects(saveReference(db, admin, "skill_categories", { name: "  TEST   CATEGORY " }), /unique constraint/)
  await assert.rejects(saveReference(db, admin, "programmes", { name: "Missing stage count", department_id: refs.department, stage_unit: "semester" }), /check constraint/)
  let data = await rpc(db, admin, "get_reference_data", { p_include_inactive: true })
  let programme = data.programmes.find(row => row.id === refs.programme)
  const id = await createUser(db)
  await saveProfile(db, id, refs, { stage_number: 7 })
  await assert.rejects(saveReference(db, admin, "programmes", { stage_count: 6 }, programme), /outside that range/)
  await assert.rejects(saveReference(db, admin, "programmes", { stage_unit: "year" }, programme), /stage unit/)
  const updated = await saveReference(db, admin, "programmes", { name: "Renamed test programme" }, programme)
  await assert.rejects(saveReference(db, admin, "programmes", { name: "Stale rename" }, programme), /Reference changed/)
  assert.notEqual(updated.updated_at, programme.updated_at)
  const parent = data.departments.find(row => row.id === refs.department)
  await saveReference(db, admin, "departments", { is_active: false }, parent)
  assert.equal((await rpc(db, null, "get_reference_data")).programmes.some(row => row.id === refs.programme), false)
  data = await rpc(db, admin, "get_reference_data", { p_include_inactive: true })
  assert.equal(data.programmes.some(row => row.id === refs.programme), true)
  await saveReference(db, admin, "departments", { is_active: true }, data.departments.find(row => row.id === refs.department))
  await assert.rejects(saveReference(db, admin, "user_roles", { role: "admin" }), /Unknown reference/)
  await assert.rejects(saveReference(db, admin, "skills", { name: "Protected", category_id: refs.category, seed_batch_id: token() }), /protected field/)
})

test("skill and category merges preserve associations, aliases, approval and stable pagination without duplicates", async () => {
  const category = await saveReference(db, admin, "skill_categories", { name: "Other category" })
  const source = await saveReference(db, admin, "skills", { name: "Duplicate skill", category_id: category.id })
  const target = await saveReference(db, admin, "skills", { name: "Canonical skill", category_id: refs.category })
  const ids = []
  for (const name of ["Shared Name", "Shared Name", "Another Name"]) {
    const id = await createUser(db); ids.push(id)
    const saved = await saveProfile(db, id, refs, { display_name: name, skills: [source.id, target.id] })
    await publishProfile(db, id, admin, saved.write_version)
  }
  const beforeMerge = await rpc(db, ids[0], "get_my_profile")
  const request = token()
  assert.deepEqual(await merge("skills", source.id, target.id, request), await merge("skills", source.id, target.id, request))
  const p = await rpc(db, ids[0], "get_my_profile")
  assert.equal(p.status, "approved"); assert.equal(p.skills.length, 1)
  assert.equal(p.skills[0].id, target.id); assert.ok(p.write_version > beforeMerge.write_version)
  assert.equal(p.content_version, beforeMerge.content_version)
  const query = { query: "Duplicate skill", category: refs.category, skill: target.id, department: refs.department, programme: refs.programme, stage: 1, member_type: "student", page_size: 1 }
  const pages = []
  for (const page of [1, 2, 3]) {
    const data = await rpc(db, null, "discover_profiles", { p_filters: { ...query, page } })
    assert.equal(data.total, 3); pages.push(data.items[0].id)
  }
  assert.equal(new Set(pages).size, 3)
  assert.equal((await rpc(db, null, "discover_profiles", { p_filters: { ...query, query: "%" } })).total, 0)
  await assert.rejects(rpc(db, ids[0], "suggest_skill", { p_name: "Duplicate skill", p_category_id: null, p_request_id: token() }), /already exists/)
  await assert.rejects(saveReference(db, admin, "skills", { name: "Duplicate skill", category_id: refs.category }), /alias/)
  const otherSkill = await saveReference(db, admin, "skills", { name: "Category move skill", category_id: category.id })
  await merge("skill_categories", category.id, refs.category)
  assert.equal((await rpc(db, null, "get_reference_data")).skills.find(row => row.id === otherSkill.id).category_id, refs.category)
})

test("skill requests are bounded, owned and resolved transactionally with idempotent audit", async () => {
  const id = await createUser(db), other = await createUser(db)
  const args = { p_name: "Useful new skill", p_category_id: refs.category, p_request_id: token() }
  const pending = await rpc(db, id, "suggest_skill", args)
  assert.deepEqual(await rpc(db, id, "suggest_skill", args), pending)
  await assert.rejects(rpc(db, id, "suggest_skill", { ...args, p_request_id: token() }), /unique constraint/)
  assert.equal((await rpc(db, other, "get_my_skill_requests")).length, 0)
  const resolve = { p_kind: "skill", p_id: pending.id, p_decision: "accepted", p_reason: "Mapped to the existing test skill", p_skill_id: refs.skill, p_request_id: token() }
  await assert.rejects(rpc(db, id, "admin_resolve_request", resolve), /Administrator/)
  assert.deepEqual(await rpc(db, admin, "admin_resolve_request", resolve), await rpc(db, admin, "admin_resolve_request", resolve))
  assert.equal((await rpc(db, id, "get_my_skill_requests"))[0].status, "accepted")
  await assert.rejects(rpc(db, admin, "admin_resolve_request", { ...resolve, p_request_id: token() }), /not pending/)
  for (let i = 0; i < 4; i++) await rpc(db, id, "suggest_skill", { p_name: `New skill ${i}`, p_category_id: null, p_request_id: token() })
  await assert.rejects(rpc(db, id, "suggest_skill", { p_name: "Sixth suggestion", p_category_id: null, p_request_id: token() }), /five skills per day/)
})

test("reports hide reporter identity, disallow self-resolution, and survive profile deletion without leaking to owners", async () => {
  const target = await createUser(db, { role: "admin" }), reporter = await createUser(db)
  const saved = await saveProfile(db, target, refs)
  const profile = await publishProfile(db, target, admin, saved.write_version)
  await assert.rejects(rpc(db, target, "report_profile", { p_profile_id: target, p_category: "other", p_description: "Self report", p_request_id: token() }), /not available/)
  const report = await rpc(db, reporter, "report_profile", { p_profile_id: target, p_category: "other", p_description: "A test report", p_request_id: token() })
  assert.equal((await rpc(db, target, "get_admin_snapshot", { p_section: "reports" })).total, 0)
  const queue = await rpc(db, admin, "get_admin_snapshot", { p_section: "reports" })
  assert.equal(queue.items[0].id, report.id); assert.equal(Object.hasOwn(queue.items[0], "reporter_id"), false)
  await assert.rejects(asRole(db, "authenticated", reporter, "select * from private.moderation_reports"), /permission denied/)
  const resolve = { p_kind: "report", p_id: report.id, p_decision: "resolved", p_reason: "Investigated test concern", p_skill_id: null, p_request_id: token() }
  await assert.rejects(rpc(db, target, "admin_resolve_request", resolve), /not available/)
  await rpc(db, admin, "admin_resolve_request", resolve)
  const deleting = await rpc(db, target, "profile_action", { p_action: "request_deletion", p_expected_version: profile.write_version, p_request_id: token() })
  await moderate(target, "delete", deleting.write_version)
  const retained = (await db.query("select profile_id,target_subject,status from private.moderation_reports where id=$1", [report.id])).rows[0]
  assert.equal(retained.profile_id, null); assert.equal(retained.target_subject, target); assert.equal(retained.status, "resolved")
})

test("settings preserve defaults, validate ranges and produce auditable changes", async () => {
  assert.equal((await rpc(db, null, "get_app_config")).stale_after_days, 30)
  const args = { p_stale_after_days: 20, p_eligibility_instructions: "Contact the named platform administrator for the approved eligibility process.", p_reason: "Test configurable freshness", p_request_id: token() }
  await assert.rejects(rpc(db, manager, "admin_update_settings", args), /Administrator/)
  await assert.rejects(rpc(db, admin, "admin_update_settings", { ...args, p_stale_after_days: 0 }), /check constraint/)
  assert.equal((await rpc(db, admin, "admin_update_settings", args)).stale_after_days, 20)
  assert.deepEqual(await rpc(db, admin, "admin_update_settings", args), await rpc(db, null, "get_app_config"))
  const audit = await rpc(db, admin, "get_admin_snapshot", { p_section: "audit", p_filters: { query: "settings.update" } })
  assert.equal(audit.total, 1); assert.equal(audit.items[0].reason, args.p_reason)
})
