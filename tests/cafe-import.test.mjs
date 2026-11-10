import { test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, rpc } from "./helpers/database.mjs"
import { createUser, token } from "./helpers/records.mjs"
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

test("Brew and Brink preserves café-specific sections, text provenance and size variants alongside shared NESCAFÉ items", async () => {
  const db = await createDatabase()
  try {
    const instanceId = await identity(db), brew = await loadCafeMenu("brew-and-brink")
    await apply(db, createCafeMenuImportSQL({ ...data, instanceId }))
    const nescafe = await rpc(db, null, "get_canteen_menu")
    const sql = createCafeMenuImportSQL({ ...brew, instanceId })
    await apply(db, sql)
    const result = await rpc(db, null, "get_canteen_menu")
    assert.equal(result.canteen.name, "BREW AND BRINK")
    assert.equal(result.canteen.subtitle, "University Café – Food & Beverages Menu")
    assert.equal(result.total, 29); assert.equal(result.canteens.length, 2)
    assert.deepEqual(result.categories.map(row => [row.name, row.item_count]), [
      ["Mojitos & Refreshers", 7], ["Shakes & Cold Beverages", 4], ["Tea & Hot Coffee", 6], ["Specials & Fast Food", 10], ["Momos", 2],
    ])
    assert.ok(result.items.every(item => item.source_kind === "text" && item.source_observed_on === null && item.serving_quantity === null))
    assert.deepEqual(result.items.filter(item => item.name === "Tea" || item.name === "Coffee").map(item => [item.name, item.variant, item.amount]), [
      ["Tea", "Small", 15], ["Tea", "Large", 30], ["Coffee", "Small", 30], ["Coffee", "Large", 60],
    ])
    const coldCoffee = result.items.find(item => item.name === "Cold Coffee")
    assert.equal(coldCoffee.category, "Shakes & Cold Beverages"); assert.equal(coldCoffee.amount, 110)
    const shared = (await db.query("select count(*)::int as total from public.canteen_offerings a join public.canteen_offerings b on b.menu_item_id=a.menu_item_id where a.canteen_id=$1 and b.canteen_id=$2", [nescafe.canteen.id, result.canteen.id])).rows[0].total
    assert.equal(shared, 3)
    const previous = await rpc(db, null, "get_canteen_menu", { p_filters: { canteen: nescafe.canteen.id } })
    for (const key of ["canteen", "categories", "items"]) assert.deepEqual(previous[key], nescafe[key])
    await apply(db, sql)
    assert.deepEqual(await rpc(db, null, "get_canteen_menu"), result)
    assert.equal(await count(db, "private.price_records"), 59)
    assert.equal(await count(db, "private.admin_audit_log"), 2)

    // Saving a shared item must retain its café section and text source, even for older clients.
    const admin = await createUser(db, { role: "admin" })
    const { entry } = await rpc(db, admin, "admin_get_menu_entry", { p_offering_id: coldCoffee.id })
    await rpc(db, admin, "admin_save_menu_entry", { p_offering_id: coldCoffee.id, p_price_record_id: entry.price_record_id,
      p_data: { source_label: entry.source_label, photo_key: entry.photo_key, display_order: entry.display_order, is_published: true },
      p_expected_version: entry.version, p_reason: "Retain the supplied text source and café section", p_request_id: token() })
    const saved = await rpc(db, null, "get_canteen_menu", { p_filters: { canteen: result.canteen.id, category: coldCoffee.category_id, query: "Cold Coffee" } })
    assert.equal(saved.total, 1); assert.equal(saved.items[0].category, "Shakes & Cold Beverages"); assert.equal(saved.items[0].source_kind, "text")
    const audit = (await db.query("select details from private.admin_audit_log where action='menu.import' and target_key='brew-and-brink'")).rows[0]
    assert.equal(audit.details.source.text_sha256, brew.menu.source.text_sha256)
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
