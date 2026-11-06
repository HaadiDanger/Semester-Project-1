import { test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, rpc } from "./helpers/database.mjs"
import { token } from "./helpers/records.mjs"
import { createCafeMenuImportSQL, loadCafeMenu } from "../scripts/lib/cafe-menu-import.mjs"

const data = await loadCafeMenu()
async function apply(db, sql) {
  try { await db.exec(sql) } catch (error) { await db.exec("rollback"); throw error }
}
const identity = async db => (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
const count = async (db, table) => (await db.query(`select count(*)::int as total from ${table}`)).rows[0].total

test("the NESCAFÉ photograph imports as 30 genuine database-backed listings with exact source amounts, four sections and all real-photo assets", async () => {
  const db = await createDatabase()
  try {
    await apply(db, createCafeMenuImportSQL({ ...data, instanceId: await identity(db) }))
    const result = await rpc(db, null, "get_canteen_menu")
    assert.equal(result.canteen.name, "NESCAFÉ IUST")
    assert.equal(result.total, 30); assert.equal(result.canteens.length, 1); assert.equal(result.categories.length, 4)
    assert.equal(result.canteen.min_price, 15); assert.equal(result.canteen.max_price, 120)
    assert.deepEqual(result.items.map(item => [item.name, item.amount]), data.menu.sections.flatMap(section => section.items.map(item => [item.name, item.price])))
    assert.ok(result.items.every(item => item.photo?.author && item.photo?.license_url && item.source_observed_on === null && item.serving_quantity === null && item.unit === null))
    assert.equal(result.canteen.cover_photo.key, data.menu.cover_photo_key)
    const comparison = await rpc(db, null, "get_canteen_prices", { p_filters: { page_size: 48 } })
    assert.equal(comparison.total, 30); assert.ok(comparison.items.every(item => item.amount === null && item.status !== "eligible" && !item.is_sample))
    assert.equal(await count(db, "auth.users"), 0); assert.equal(await count(db, "private.price_verifications"), 0)
    assert.equal(await count(db, "private.menu_photos"), data.photos.length)
    const audit = (await db.query("select * from private.admin_audit_log where action='menu.import'")).rows[0]
    assert.equal(audit.actor_kind, "operator"); assert.equal(audit.actor_user_id, null)
    assert.equal(audit.details.source.photo_sha256, data.menu.source.photo_sha256)
  } finally { await db.close() }
})

test("repeated imports are idempotent and preserve staff edits, withdrawn prices and hidden listings", async () => {
  const db = await createDatabase()
  try {
    const instanceId = await identity(db), sql = createCafeMenuImportSQL({ ...data, instanceId })
    await apply(db, sql)
    const before = await rpc(db, null, "get_canteen_menu")
    await apply(db, sql)
    assert.deepEqual(await rpc(db, null, "get_canteen_menu"), before)
    assert.equal(await count(db, "private.price_records"), 30)
    const item = before.items[0]
    await db.query("update public.canteens set menu_description='Staff-edited description' where id=$1", [before.canteen.id])
    await db.query("insert into private.price_records(offering_id,event_kind,recorded_by_operator,request_id) values($1,'withdraw','test-operator',$2)", [item.id, token()])
    await db.query("update private.canteen_menu_entries set is_published=false,version=version+1 where offering_id=$1", [item.id])
    await apply(db, sql)
    const after = await rpc(db, null, "get_canteen_menu")
    assert.equal(after.total, 29); assert.ok(!after.items.some(row => row.id === item.id))
    assert.equal(after.canteen.description, "Staff-edited description")
    assert.equal(await count(db, "private.price_records"), 31)
    assert.equal(await count(db, "private.admin_audit_log"), 1)
    const changed = structuredClone(data); changed.menu.sections[0].items[0].price = 99
    await assert.rejects(apply(db, createCafeMenuImportSQL({ ...changed, instanceId })), /already imported with different content/)
    assert.deepEqual(await rpc(db, null, "get_canteen_menu"), after)
  } finally { await db.close() }
})

test("wrong targets and late catalogue conflicts roll back the entire import and preserve existing records", async () => {
  const db = await createDatabase()
  try {
    await assert.rejects(apply(db, createCafeMenuImportSQL({ ...data, instanceId: token() })), /explicitly selected/)
    assert.equal(await count(db, "public.canteens"), 0)
    await db.exec("insert into public.food_categories(name,key,is_active) values('Noodles & pasta',private.norm('Noodles & pasta'),false)")
    const sql = createCafeMenuImportSQL({ ...data, instanceId: await identity(db) })
    await assert.rejects(apply(db, sql), /retired or sample data/)
    for (const table of ["public.canteens", "public.menu_items", "private.price_records", "private.menu_photos", "private.canteen_menu_entries", "private.admin_audit_log"]) assert.equal(await count(db, table), 0)
    assert.equal(await count(db, "public.food_categories"), 1)
    await db.exec("insert into public.canteens(name,key,menu_description) values('NESCAFÉ IUST',private.norm('NESCAFÉ IUST'),'Existing operator work')")
    await assert.rejects(apply(db, sql), /canteen with this name already exists/)
    assert.equal((await db.query("select menu_description from public.canteens")).rows[0].menu_description, "Existing operator work")
  } finally { await db.close() }
})
