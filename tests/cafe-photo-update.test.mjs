import { test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, rpc } from "./helpers/database.mjs"
import { createUser, token } from "./helpers/records.mjs"
import { createCafeMenuImportSQL, loadCafeMenu } from "../scripts/lib/cafe-menu-import.mjs"
import { createCafePhotoUpdateSQL, loadCafePhotoUpdate } from "../scripts/lib/cafe-photo-update.mjs"

const data = await loadCafePhotoUpdate("nescafe-hot-drink-cups")
const menus = await Promise.all(["nescafe-iust", "brew-and-brink"].map(loadCafeMenu))
const tables = ["public.canteens", "public.food_categories", "public.menu_items", "public.canteen_offerings",
  "private.canteen_menu_entries", "private.price_records", "private.price_verifications", "private.menu_photos",
  "private.admin_audit_log", "auth.users", "public.profiles", "private.account_controls", "private.assets"]
const identity = async db => (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
async function apply(db, sql) {
  try { await db.exec(sql) } catch (error) { await db.exec("rollback"); throw error }
}
async function importMenus(db, instanceId) {
  for (const menu of menus) await apply(db, createCafeMenuImportSQL({ ...menu, instanceId }))
}
async function snapshot(db) {
  return Object.fromEntries(await Promise.all(tables.map(async table => {
    const rows = (await db.query(`select to_jsonb(r) as data from ${table} r`)).rows.map(row => row.data)
    const key = row => row.id || row.offering_id || row.key || row.user_id
    return [table, rows.sort((a, b) => String(key(a)).localeCompare(String(key(b))))]
  })))
}

test("the hot-drink plan selects exactly four distinct disposable-cup photographs without changing the original imports", () => {
  assert.deepEqual(data.update.items.map(item => [item.name, item.from, item.to]), [
    ["Cappuccino", "cappuccino", "takeaway-cappuccino"], ["Cafe Latte", "cafe-latte", "takeaway-latte"],
    ["Cafe Mocha", "cafe-mocha", "takeaway-mocha"], ["Hot Chocolate", "hot-chocolate", "takeaway-hot-chocolate"],
  ])
  assert.deepEqual(data.update.cover, { from: "cappuccino", to: "takeaway-cappuccino" })
  assert.equal(data.photos.length, 4)
  assert.equal(new Set(data.photos.map(photo => photo.sha256)).size, 4)
  assert.ok(data.photos.every(photo => /disposable/i.test(photo.alt)))
  for (const item of data.update.items) {
    const original = menus[0].menu.sections.flatMap(section => section.items).find(dish => dish.name === item.name)
    assert.equal(original.photo_key, item.from); assert.equal(original.price, 30)
  }
  assert.equal(menus[0].menu.cover_photo_key, "cappuccino")
  assert.equal(menus[1].menu.cover_photo_key, "takeaway-latte")
})

test("the photo transaction changes only four NESCAFÉ pointers, their versions/timestamps and its cover, preserving prices, Brew and profiles", async () => {
  const db = await createDatabase()
  try {
    const instanceId = await identity(db)
    await importMenus(db, instanceId)
    await createUser(db)
    const before = await snapshot(db), cafe = before["public.canteens"].find(row => row.name === "NESCAFÉ IUST")
    const brew = await rpc(db, null, "get_canteen_menu")
    await apply(db, createCafePhotoUpdateSQL({ ...data, instanceId }))
    const after = await snapshot(db)
    for (const table of tables.filter(table => !["public.canteens", "private.canteen_menu_entries", "private.menu_photos", "private.admin_audit_log"].includes(table))) {
      assert.deepEqual(after[table], before[table], table)
    }
    for (const row of after["public.canteens"]) {
      const previous = before["public.canteens"].find(item => item.id === row.id)
      assert.deepEqual(row, row.id === cafe.id ? { ...previous, menu_cover_photo_key: data.update.cover.to, updated_at: row.updated_at } : previous)
    }
    let changed = 0
    for (const row of after["private.canteen_menu_entries"]) {
      const previous = before["private.canteen_menu_entries"].find(item => item.offering_id === row.offering_id)
      const offering = before["public.canteen_offerings"].find(item => item.id === row.offering_id)
      const item = before["public.menu_items"].find(item => item.id === offering.menu_item_id)
      const replacement = offering.canteen_id === cafe.id && data.update.items.find(change => change.name === item.name)
      if (replacement) changed++
      assert.deepEqual(row, replacement ? { ...previous, photo_key: replacement.to, version: previous.version + 1, updated_at: row.updated_at } : previous)
    }
    assert.equal(changed, 4)
    for (const photo of before["private.menu_photos"]) assert.deepEqual(after["private.menu_photos"].find(row => row.key === photo.key), photo)
    const newKeys = data.photos.filter(photo => !before["private.menu_photos"].some(row => row.key === photo.key)).map(photo => photo.key)
    assert.equal(after["private.menu_photos"].length, before["private.menu_photos"].length + newKeys.length)
    assert.equal(after["private.admin_audit_log"].length, before["private.admin_audit_log"].length + 1)
    for (const receipt of before["private.admin_audit_log"]) assert.deepEqual(after["private.admin_audit_log"].find(row => row.id === receipt.id), receipt)
    assert.deepEqual(await rpc(db, null, "get_canteen_menu"), brew)
    const nescafe = await rpc(db, null, "get_canteen_menu", { p_filters: { canteen: cafe.id } })
    assert.equal(nescafe.total, 30)
    for (const change of data.update.items) assert.equal(nescafe.items.find(item => item.name === change.name).photo.key, change.to)
  } finally { await db.close() }
})

test("completed photo updates and original imports are idempotent and preserve later staff photos and hidden listings", async () => {
  const db = await createDatabase()
  try {
    const instanceId = await identity(db), sql = createCafePhotoUpdateSQL({ ...data, instanceId })
    await importMenus(db, instanceId)
    await apply(db, sql)
    await db.exec("update private.canteen_menu_entries set photo_key='tea',is_published=false,version=version+1 where photo_key='takeaway-hot-chocolate'")
    const before = await snapshot(db)
    await apply(db, sql)
    await importMenus(db, instanceId)
    assert.deepEqual(await snapshot(db), before)
    const changed = structuredClone(data); changed.update.reason = "A changed completed plan must not overwrite staff work."
    await assert.rejects(apply(db, createCafePhotoUpdateSQL({ ...changed, instanceId })), /already applied with different content/)
    assert.deepEqual(await snapshot(db), before)
  } finally { await db.close() }
})

test("wrong instances, missing cafés, late stale pointers/covers and existing photo-metadata conflicts reject atomically", async () => {
  const db = await createDatabase()
  try {
    const instanceId = await identity(db), empty = await snapshot(db)
    await assert.rejects(apply(db, createCafePhotoUpdateSQL({ ...data, instanceId: token() })), /explicitly selected photo-update instance/)
    await assert.rejects(apply(db, createCafePhotoUpdateSQL({ ...data, instanceId })), /Import the selected genuine/)
    assert.deepEqual(await snapshot(db), empty)
    await importMenus(db, instanceId)
    const before = await snapshot(db)
    for (const [kind, message] of [["listing", /listing photograph changed/], ["cover", /café cover changed/], ["metadata", /conflicts with existing source metadata/]]) {
      const changed = structuredClone(data)
      if (kind === "listing") changed.update.items.at(-1).from = "takeaway-latte"
      if (kind === "cover") changed.update.cover.from = "takeaway-latte"
      if (kind === "metadata") changed.photos.find(photo => photo.key === "takeaway-latte").author = "Conflicting test metadata"
      await assert.rejects(apply(db, createCafePhotoUpdateSQL({ ...changed, instanceId })), message)
      assert.deepEqual(await snapshot(db), before, kind)
    }
  } finally { await db.close() }
})
