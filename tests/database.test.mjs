import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, asRole, rpc } from "./helpers/database.mjs"
import { randomUUID } from "node:crypto"

let db
let admin, department, programme, category, skill, secondSkill
const request = () => randomUUID()
async function user({ confirmed = true, role } = {}) {
  const id = randomUUID()
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)", [id, `${id}@example.invalid`, confirmed ? new Date() : null])
  if (role) await db.query("insert into private.user_roles(user_id,role) values($1,$2)", [id, role])
  return id
}
async function reference(table, data) {
  return (await rpc(db, admin, "admin_save_reference", { p_table: table, p_id: null, p_data: data, p_expected_updated_at: null, p_reason: "Database test reference", p_request_id: request() })).id
}
const profileInput = (extra = {}) => ({ display_name: "Test Community Member", bio: "I enjoy football, drawing and sharing small projects.",
  programme_id: programme, member_type: "student", stage_number: 2, skills: [skill], projects: [], contacts: [], ...extra })
async function save(id, data = {}, version = 0, token = request()) {
  return rpc(db, id, "save_my_profile", { p_profile: profileInput(data), p_expected_version: version, p_request_id: token })
}
async function action(id, name, version, token = request()) {
  return rpc(db, id, "profile_action", { p_action: name, p_expected_version: version, p_request_id: token })
}
async function moderate(id, name, version, data = {}, actor = admin) {
  return rpc(db, actor, "admin_moderate_profile", { p_user_id: id, p_action: name, p_expected_version: version, p_data: { reason: "Permission test decision", ...data }, p_request_id: request() })
}
async function approved(extra = {}) {
  const id = await user()
  let result = await save(id, extra)
  result = await action(id, "submit", result.write_version)
  await moderate(id, "eligibility", result.write_version, { eligibility_status: "eligible" })
  const profile = await rpc(db, id, "get_my_profile")
  await moderate(id, "approve", profile.write_version)
  return id
}
before(async () => {
  db = await createDatabase()
  admin = await user({ role: "admin" })
  await db.query("insert into private.user_roles(user_id,role) values($1,'role_manager')", [admin])
  department = await reference("departments", { name: "Test Department" })
  programme = await reference("programmes", { name: "Test Programme", department_id: department, stage_unit: "semester", stage_count: 8 })
  category = await reference("skill_categories", { name: "Test Creativity" })
  skill = await reference("skills", { name: "Drawing", category_id: category })
  secondSkill = await reference("skills", { name: "Handmade crafts", category_id: category })
})
after(async () => { await db?.close() })

test("migrations apply; application tables have RLS and no client writes", async () => {
  const { rows } = await db.query(`select n.nspname, c.relname, c.relrowsecurity,
    has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as writable
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r'`)
  assert.ok(rows.length >= 23)
  assert.equal(rows.filter(row => !row.relrowsecurity || row.writable).length, 0)
})

test("anonymous users cannot access private administration or mutate profiles", async () => {
  await assert.rejects(asRole(db, "anon", null, "select * from private.user_roles"), /permission denied/)
  await assert.rejects(asRole(db, "anon", null, "delete from public.profiles"), /permission denied/)
  const result = await asRole(db, "anon", null, "select id,display_name from public.profiles")
  assert.equal(result.rows.length, 0)
})

test("confirmed ownership, persistent multi-entry portfolios, audience RLS and anonymous discovery", async () => {
  const projectIds = [request(), request()]
  const id = await approved({
    display_name: "A Test Maker", skills: [skill, secondSkill],
    projects: projectIds.map((projectId, i) => ({ id: projectId, title: `Project ${i + 1}`, description: "A small handmade demonstration", audience: i ? "owner" : "public", sort_order: i })),
    contacts: [
      { kind: "website", label: "Public project", value: "https://example.invalid/public", audience: "public" },
      { kind: "email", value: "private@example.invalid", audience: "owner" },
      { kind: "website", value: "https://example.invalid/campus", audience: "campus" },
    ],
  })
  const visitor = await rpc(db, null, "get_profile", { p_id: id })
  assert.equal(visitor.contacts.length, 1)
  assert.equal(visitor.projects.length, 1)
  assert.equal(visitor.write_version, undefined)
  const owner = await rpc(db, id, "get_my_profile")
  assert.equal(owner.projects.length, 2)
  assert.equal(owner.contacts.length, 3)
  assert.equal(owner.status, "approved")
  const outsider = await user()
  const otherView = await rpc(db, outsider, "get_profile", { p_id: id })
  assert.equal(otherView.contacts.length, 1)
  const visibleContacts = await asRole(db, "authenticated", outsider, "select * from public.profile_contacts where profile_id=$1", [id])
  assert.equal(visibleContacts.rows.length, 1)
  const visiblePortfolio = await asRole(db, "anon", null, "select * from public.portfolio_items where profile_id=$1", [id])
  assert.equal(visiblePortfolio.rows.length, 1)
  const search = await rpc(db, null, "discover_profiles", { p_filters: { query: "handmade", department, programme, category, skill, stage: 2, page_size: 1 } })
  assert.equal(search.total, 1)
  assert.equal(search.items[0].id, id)
  assert.equal((await rpc(db, null, "discover_profiles", { p_filters: { query: "%_" } })).total, 0)
  await assert.rejects(save(outsider, { projects: [{ id: projectIds[0], title: "Stolen", description: "Not owned by this account" }] }), /belongs to another/)
  assert.equal(await rpc(db, outsider, "get_my_profile"), null, "failed aggregate write rolls back parent creation")
  await assert.rejects(asRole(db, "authenticated", outsider, "update public.profiles set display_name='Changed' where id=$1", [id]), /permission denied/)
})

test("normal users cannot self-approve, grant roles, inspect admin queues or edit official references", async () => {
  const id = await user()
  const draft = await save(id)
  await assert.rejects(moderate(id, "approve", draft.write_version, {}, id), /Administrator/)
  await assert.rejects(rpc(db, id, "get_admin_snapshot"), /Administrator/)
  await assert.rejects(rpc(db, id, "manage_role", { p_user_id: id, p_role: "admin", p_grant: true, p_reason: "Attempt", p_request_id: request() }), /Role-manager/)
  await assert.rejects(rpc(db, id, "admin_save_reference", { p_table: "skills", p_id: null, p_data: { name: "No", category_id: category }, p_expected_updated_at: null, p_reason: "Attempt", p_request_id: request() }), /Administrator/)
  await assert.rejects(save(id, { status: "approved" }, draft.write_version), /Unknown or protected/)
  assert.equal(await rpc(db, null, "get_profile", { p_id: id }), null)
})

test("approval requires eligibility, stale moderation conflicts, and content edits withdraw publication", async () => {
  const id = await user()
  let state = await save(id)
  state = await action(id, "submit", state.write_version)
  await assert.rejects(moderate(id, "approve", state.write_version), /eligibility/)
  await assert.rejects(save(id, {}, state.write_version), /Withdraw/)
  state = await action(id, "unpublish", state.write_version)
  await assert.rejects(moderate(id, "approve", state.write_version - 1), /changed/)
  const published = await approved({ display_name: "Editable Member" })
  const beforeEdit = await rpc(db, published, "get_my_profile")
  const changed = await save(published, { bio: "Now I also bake birthday cakes." }, beforeEdit.write_version)
  assert.equal(changed.status, "draft")
  assert.equal(await rpc(db, null, "get_profile", { p_id: published }), null)
  await assert.rejects(action(published, "publish", changed.write_version), /Only an approved/)
  await assert.rejects(save(published, {}, beforeEdit.write_version), /changed/)
})

test("unpublish and republish require approval; suspension blocks existing claims and restore returns a draft", async () => {
  const id = await approved()
  let profile = await rpc(db, id, "get_my_profile")
  let state = await action(id, "unpublish", profile.write_version)
  assert.equal(await rpc(db, null, "get_profile", { p_id: id }), null)
  state = await action(id, "publish", state.write_version)
  assert.ok(await rpc(db, null, "get_profile", { p_id: id }))
  await moderate(id, "suspend", state.write_version)
  profile = await rpc(db, id, "get_my_profile")
  assert.equal(profile.status, "suspended")
  assert.equal(await rpc(db, null, "get_profile", { p_id: id }), null)
  await assert.rejects(save(id, {}, profile.write_version), /permitted account/)
  await moderate(id, "restore", profile.write_version)
  assert.equal((await rpc(db, id, "get_my_profile")).status, "draft")
})

test("idempotent saves do not duplicate content and cannot be reused for changed input", async () => {
  const id = await user()
  const token = request()
  const initial = await save(id, {}, 0, token)
  assert.deepEqual(await save(id, {}, 0, token), initial)
  await assert.rejects(save(id, { bio: "Different input for the same token." }, 0, token), /already used/)
  const { rows } = await db.query("select count(*)::int as count from public.profiles where id=$1", [id])
  assert.equal(rows[0].count, 1)
})

test("Auth metadata cannot grant privileges and unconfirmed accounts cannot create profiles", async () => {
  const id = await user({ confirmed: false })
  await db.query("update auth.users set raw_user_meta_data=$2 where id=$1", [id, { role: "admin", eligibility_status: "eligible" }])
  assert.equal((await rpc(db, id, "get_session_context")).is_admin, false)
  await assert.rejects(save(id), /confirmed/)
})

test("deletion requests immediately hide profiles; admin deletion removes owned collections", async () => {
  const id = await approved({ projects: [{ title: "Temporary work", description: "Profile deletion example", audience: "public" }] })
  const profile = await rpc(db, id, "get_my_profile")
  const state = await action(id, "request_deletion", profile.write_version)
  assert.equal(await rpc(db, null, "get_profile", { p_id: id }), null)
  await assert.rejects(save(id, {}, state.write_version), /deletion request/)
  await moderate(id, "delete", state.write_version)
  assert.equal(await rpc(db, id, "get_my_profile"), null)
  assert.equal((await db.query("select * from public.portfolio_items where profile_id=$1", [id])).rows.length, 0)
})

test("production rejects sample inserts and origins cannot be changed by API payloads", async () => {
  await assert.rejects(db.query("insert into public.departments(name,key,seed_batch_id) values('Sample','sample',$1)", [request()]), /seed-enabled development/)
  await assert.rejects(rpc(db, admin, "admin_save_reference", { p_table: "departments", p_id: null, p_data: { name: "Fake", seed_batch_id: request() }, p_expected_updated_at: null, p_reason: "Attempt", p_request_id: request() }), /protected/)
})
