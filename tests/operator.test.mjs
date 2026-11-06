import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createDatabase, rpc } from "./helpers/database.mjs"
import { createUser, token } from "./helpers/records.mjs"

let db, instanceId, owner, email
before(async () => {
  db = await createDatabase()
  instanceId = (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
  email = `${token()}@example.invalid`
  owner = await createUser(db, { email })
})
after(async () => { await db?.close() })
async function operate(file, values) {
  const sql = await readFile(new URL(`../supabase/operator/${file}.sql`, import.meta.url), "utf8")
  return db.transaction(async tx => {
    for (const [key, value] of Object.entries({ instance_id: instanceId, user_id: owner, email, label: "test-operator", reason: "Automated operator procedure check", ...values })) {
      await tx.query("select set_config($1,$2,true)", [`iust.operator.${key}`, value])
    }
    await tx.exec(sql)
  })
}

test("first-admin bootstrap rejects missing intent, wrong instance/email, unconfirmed and sample identities", async () => {
  const file = "bootstrap-admin", confirm = "IUST_CONNECT_FIRST_ADMIN"
  await assert.rejects(operate(file, {}), /confirmation/)
  await assert.rejects(operate(file, { confirm, instance_id: token() }), /exact inspected/)
  await assert.rejects(operate(file, { confirm, email: "wrong@example.invalid" }), /must match/)
  await assert.rejects(operate(file, { confirm, user_id: await createUser(db, { confirmed: false }) }), /must match/)
  await db.query("update auth.users set raw_app_meta_data=$2 where id=$1", [owner, { iust_connect_fixture: true }])
  await assert.rejects(operate(file, { confirm }), /must match/)
  await db.query("update auth.users set raw_app_meta_data='{}' where id=$1", [owner])
  assert.equal((await db.query("select count(*)::int n from private.user_roles")).rows[0].n, 0)
})

test("first-admin bootstrap is audited, idempotent and separate from university eligibility", async () => {
  const args = { confirm: "IUST_CONNECT_FIRST_ADMIN" }
  await operate("bootstrap-admin", args)
  await operate("bootstrap-admin", args)
  const account = await rpc(db, owner, "get_session_context")
  assert.equal(account.is_admin, true); assert.equal(account.is_role_manager, true)
  assert.equal(account.eligibility_status, "pending")
  assert.equal((await db.query("select count(*)::int n from private.admin_audit_log where action='operator.bootstrap_admin'")).rows[0].n, 1)
  const otherEmail = `${token()}@example.invalid`, other = await createUser(db, { email: otherEmail })
  await assert.rejects(operate("bootstrap-admin", { ...args, user_id: other, email: otherEmail }), /already exists/)
})

test("local fixture enablement requires separate confirmation and exact instance; reruns do not duplicate audit", async () => {
  const file = "enable-local-development", confirm = "IUST_CONNECT_LOCAL_DEVELOPMENT"
  await assert.rejects(operate(file, { confirm: "IUST_CONNECT_FIRST_ADMIN" }), /confirmation/)
  await assert.rejects(operate(file, { confirm, instance_id: token() }), /exact inspected/)
  assert.equal((await rpc(db, null, "get_app_config")).samples_enabled, false)
  await operate(file, { confirm }); await operate(file, { confirm })
  assert.equal((await rpc(db, null, "get_app_config")).samples_enabled, true)
  assert.equal((await db.query("select count(*)::int n from private.admin_audit_log where action='operator.enable_fixtures'")).rows[0].n, 1)
})
