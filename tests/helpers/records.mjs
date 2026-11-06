import { randomUUID } from "node:crypto"
import { rpc } from "./database.mjs"

export const token = () => randomUUID()
export async function createUser(db, { role, email, confirmed = true, metadata = {} } = {}) {
  const id = token()
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,$3,$4)", [id, email || `${id}@example.invalid`, confirmed ? new Date() : null, metadata])
  if (role) await db.query("insert into private.user_roles(user_id,role) values($1,$2)", [id, role])
  return id
}
export async function saveReference(db, admin, table, data, existing = null) {
  return rpc(db, admin, "admin_save_reference", { p_table: table, p_id: existing?.id || null, p_data: data,
    p_expected_updated_at: existing?.updated_at || null, p_reason: "Automated test reference", p_request_id: token() })
}
export async function profileReferences(db, admin) {
  const department = await saveReference(db, admin, "departments", { name: "Test department" })
  const programme = await saveReference(db, admin, "programmes", { name: "Test programme", department_id: department.id, stage_unit: "semester", stage_count: 8 })
  const category = await saveReference(db, admin, "skill_categories", { name: "Test category" })
  const skill = await saveReference(db, admin, "skills", { name: "Test skill", category_id: category.id })
  return { department: department.id, programme: programme.id, category: category.id, skill: skill.id }
}
export async function saveProfile(db, id, refs, extra = {}, version = 0) {
  return rpc(db, id, "save_my_profile", { p_profile: { display_name: "Test member", bio: "An automated test profile, not a real person.",
    programme_id: refs.programme, member_type: "student", stage_number: 1, skills: [refs.skill], projects: [], contacts: [], ...extra }, p_expected_version: version, p_request_id: token() })
}
export async function publishProfile(db, id, admin, version) {
  let result = await rpc(db, id, "profile_action", { p_action: "submit", p_expected_version: version, p_request_id: token() })
  await rpc(db, admin, "admin_moderate_profile", { p_user_id: id, p_action: "eligibility", p_expected_version: result.write_version,
    p_data: { reason: "Automated eligibility test", eligibility_status: "eligible" }, p_request_id: token() })
  result = await rpc(db, id, "get_my_profile")
  await rpc(db, admin, "admin_moderate_profile", { p_user_id: id, p_action: "approve", p_expected_version: result.write_version,
    p_data: { reason: "Automated content approval" }, p_request_id: token() })
  return rpc(db, id, "get_my_profile")
}
export const worker = (db, name, args) => rpc(db, null, name, args, "service_role")
export const validMetadata = { byte_size: 1000, width: 320, height: 160, sha256: "a".repeat(64) }
// Simulates the trusted image worker's SQL contract; it does not write real Storage bytes.
export async function readyAsset(db, owner, purpose = "photo") {
  const reserved = await rpc(db, owner, "reserve_asset", { p_purpose: purpose, p_request_id: token() })
  const claim = await worker(db, "worker_claim_asset", { p_id: reserved.id, p_user_id: owner })
  await worker(db, "worker_complete_asset", { p_id: reserved.id, p_user_id: owner, p_token: claim.token, p_metadata: validMetadata })
  return reserved
}
