import { test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, asRole, rpc } from "./helpers/database.mjs"
import { createUser, token, worker } from "./helpers/records.mjs"
import { createProfileImportSQL, loadProfileImport, profileImportHash } from "../scripts/lib/profile-import.mjs"

const { profile } = await loadProfileImport()
const identity = async db => (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
const count = async (db, table) => (await db.query(`select count(*)::int as total from ${table}`)).rows[0].total
async function apply(db, sql) {
  try { await db.exec(sql) } catch (error) { await db.exec("rollback"); throw error }
}
async function prepare(db) {
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)",
    [profile.id, profile.placeholder_email, { iust_profile_import: profile.key, manifest_sha256: profileImportHash(profile) }])
  return createProfileImportSQL({ profile, instanceId: await identity(db), operator: "test-repository-owner" })
}

test("Anas Tech imports into discovery with the supplied portrait, tech copy, private login and operator attribution", async () => {
  const db = await createDatabase()
  try {
    await apply(db, await prepare(db))
    const found = await rpc(db, null, "discover_profiles", { p_filters: { query: "anas tech" } })
    assert.equal(found.total, 1); assert.equal(found.items[0].id, profile.id)
    const detail = await rpc(db, null, "get_profile", { p_id: profile.id })
    assert.equal(detail.display_name, "Anas Tech"); assert.equal(detail.bio, profile.bio)
    assert.equal(detail.about, profile.about); assert.equal(detail.photo_asset_id, profile.photo.id)
    assert.equal(detail.is_sample, false); assert.equal(detail.programme, null); assert.equal(detail.stage_number, null)
    assert.deepEqual(detail.skills.map(skill => skill.name).sort(), profile.skills.map(skill => skill.name).sort())
    assert.deepEqual(detail.contacts, []); assert.deepEqual(detail.projects, [])
    assert.equal(detail.email, undefined); assert.equal(detail.reviewed_by_operator, undefined)
    const photo = await worker(db, "worker_asset_access", { p_id: profile.photo.id, p_viewer_id: null })
    assert.equal(photo.bucket, "profile-media"); assert.equal(photo.path, `${profile.id}/${profile.photo.id}.webp`)
    assert.equal(await count(db, "private.user_roles"), 0)
    const moderation = (await db.query("select * from private.profile_moderation where profile_id=$1", [profile.id])).rows[0]
    assert.equal(moderation.reviewed_by, null); assert.equal(moderation.reviewed_by_operator, "test-repository-owner")
    const audit = (await db.query("select * from private.admin_audit_log where action='profile.import'")).rows[0]
    assert.equal(audit.actor_kind, "operator"); assert.equal(audit.actor_user_id, null)
    assert.equal(audit.details.source.original_photo_sha256, profile.source.original_photo_sha256)
    await assert.rejects(asRole(db, "authenticated", profile.id, "update private.account_controls set eligibility_decided_by_operator='forged'"), /permission denied/)
    await assert.rejects(asRole(db, "authenticated", profile.id, "update private.profile_moderation set reviewed_by_operator='forged'"), /permission denied/)
  } finally { await db.close() }
})

test("reimport preserves owner edits and hiding, clears stale operator review and never creates duplicate profiles", async () => {
  const db = await createDatabase()
  try {
    const sql = await prepare(db)
    await apply(db, sql); await apply(db, sql)
    const saved = await rpc(db, profile.id, "save_my_profile", { p_profile: { display_name: "Anas Tech", bio: "My own updated introduction.",
      photo_asset_id: profile.photo.id, photo_audience: "owner", skills: [], contacts: [], projects: [] }, p_expected_version: 1, p_request_id: token() })
    await apply(db, sql)
    assert.equal((await rpc(db, profile.id, "get_my_profile")).bio, "My own updated introduction.")
    assert.equal(await rpc(db, null, "get_profile", { p_id: profile.id }), null)
    await assert.rejects(worker(db, "worker_asset_access", { p_id: profile.photo.id, p_viewer_id: null }), /not available/)
    assert.equal((await db.query("select reviewed_by_operator from private.profile_moderation where profile_id=$1", [profile.id])).rows[0].reviewed_by_operator, null)
    assert.equal(await count(db, "public.profiles"), 1); assert.equal(await count(db, "private.assets"), 1)
    assert.equal((await db.query("select count(*)::int as total from private.admin_audit_log where action='profile.import'")).rows[0].total, 1)
    await assert.rejects(rpc(db, profile.id, "profile_action", { p_action: "submit", p_expected_version: saved.write_version, p_request_id: token() }), /programme/)
    await assert.rejects(apply(db, createProfileImportSQL({ profile: { ...profile, bio: "A changed manifest must not replace owner content." }, instanceId: await identity(db) })), /already imported with different content/)
  } finally { await db.close() }
})

test("wrong targets, mismatched accounts and late skill conflicts cannot partially publish the profile", async () => {
  const db = await createDatabase()
  try {
    const sql = await prepare(db)
    await assert.rejects(apply(db, createProfileImportSQL({ profile, instanceId: token() })), /explicitly selected/)
    await db.query("update auth.users set raw_app_meta_data='{}' where id=$1", [profile.id])
    await assert.rejects(apply(db, sql), /matching, confirmed import account/)
    await db.query("update auth.users set raw_app_meta_data=$2 where id=$1", [profile.id, { iust_profile_import: profile.key, manifest_sha256: profileImportHash(profile) }])
    await db.exec("insert into public.skill_categories(name,key) values('Technology','technology'); insert into public.skills(name,key,category_id,is_active) select 'Digital tools','digital tools',id,false from public.skill_categories where key='technology';")
    await assert.rejects(apply(db, sql), /skill conflicts/)
    for (const table of ["public.profiles", "private.assets", "private.profile_moderation", "private.admin_audit_log"]) assert.equal(await count(db, table), 0)
    assert.equal(await count(db, "public.skills"), 1)
    const account = (await db.query("select * from private.account_controls where user_id=$1", [profile.id])).rows[0]
    assert.equal(account.eligibility_status, "pending"); assert.equal(account.eligibility_decided_by_operator, null)
    const originalSkill = (await db.query("select id from public.skills where key='digital tools'")).rows[0].id
    await db.exec("update public.skills set is_active=true where key='digital tools';")
    await apply(db, sql)
    assert.equal(await count(db, "public.skill_categories"), 1); assert.equal(await count(db, "public.skills"), 3)
    assert.equal((await db.query("select skill_id from public.profile_skills where profile_id=$1 and skill_id=$2", [profile.id, originalSkill])).rows[0].skill_id, originalSkill)
    assert.equal((await rpc(db, null, "get_profile", { p_id: profile.id })).display_name, profile.display_name)
  } finally { await db.close() }
})

test("later administrator decisions and email changes supersede operator eligibility and revoke public access", async () => {
  const db = await createDatabase()
  try {
    await apply(db, await prepare(db))
    const admin = await createUser(db, { role: "admin" })
    await rpc(db, admin, "admin_moderate_profile", { p_user_id: profile.id, p_action: "eligibility", p_expected_version: 1,
      p_data: { eligibility_status: "eligible", reason: "A later administrator decision" }, p_request_id: token() })
    let account = (await db.query("select * from private.account_controls where user_id=$1", [profile.id])).rows[0]
    assert.equal(account.eligibility_decided_by, admin); assert.equal(account.eligibility_decided_by_operator, null)
    assert.ok(await rpc(db, null, "get_profile", { p_id: profile.id }))
    await db.query("update auth.users set email='updated-contact@example.invalid' where id=$1", [profile.id])
    account = (await db.query("select * from private.account_controls where user_id=$1", [profile.id])).rows[0]
    assert.equal(account.eligibility_status, "pending"); assert.equal(account.eligibility_decided_by, null)
    assert.equal(account.eligibility_decided_by_operator, null)
    assert.equal(await rpc(db, null, "get_profile", { p_id: profile.id }), null)
    await assert.rejects(worker(db, "worker_asset_access", { p_id: profile.photo.id, p_viewer_id: null }), /not available/)
  } finally { await db.close() }
})
