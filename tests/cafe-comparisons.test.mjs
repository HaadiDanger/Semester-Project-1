import { test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, rpc } from "./helpers/database.mjs"
import { createUser, token } from "./helpers/records.mjs"
import { createCafeMenuImportSQL, loadCafeMenu } from "../scripts/lib/cafe-menu-import.mjs"

const menus = await Promise.all(["nescafe-iust", "brew-and-brink"].map(loadCafeMenu))
const compare = (db, filters = {}) => rpc(db, null, "get_canteen_menu_comparisons", { p_filters: filters })
async function importMenu(db, data) {
  const instanceId = (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
  await db.exec(createCafeMenuImportSQL({ ...data, instanceId }))
}
async function database() {
  const db = await createDatabase()
  try { for (const menu of menus) await importMenu(db, menu); return db }
  catch (error) { await db.close(); throw error }
}
async function publishOffering(db, cafe, item, amount) {
  const offering = (await db.query("insert into public.canteen_offerings(canteen_id,menu_item_id) values($1,$2) returning id", [cafe, item])).rows[0].id
  const price = (await db.query("insert into private.price_records(offering_id,event_kind,amount,recorded_by_operator,request_id) values($1,'set',$2,'comparison-test',$3) returning id", [offering, amount, token()])).rows[0].id
  await db.query("insert into private.canteen_menu_entries(offering_id,price_record_id,source_label,source_kind,is_published) values($1,$2,'Disposable test menu','text',true)", [offering, price])
  return offering
}

test("published menus compare the three shared items with actual prices and source labels even when exact portions are unknown", async () => {
  const db = await database()
  try {
    const result = await compare(db)
    assert.equal(result.first_canteen.name, "BREW AND BRINK"); assert.equal(result.second_canteen.name, "NESCAFÉ IUST")
    assert.equal(result.total, 3)
    assert.deepEqual(result.items.map(item => [item.name, item.offers.map(offer => offer.amount), item.difference]), [
      ["Cold Coffee", [110, 70], 40], ["Cheese Fries", [150, 90], 60], ["Chicken Popcorn", [130, 120], 10],
    ])
    assert.ok(result.items.every(item => item.serving_quantity === null && item.offers[1].is_lowest && !item.offers[0].is_lowest))
    assert.deepEqual(result.items[0].offers.map(offer => offer.source_kind), ["text", "photograph"])
    for (const secret of ["price_record_id", "recorded_by", "request_id", "source_note", "evidence_asset_id"]) assert.equal(JSON.stringify(result).includes(secret), false)
    const verified = await rpc(db, null, "get_canteen_prices", { p_filters: { query: "Cold Coffee" } })
    assert.ok(verified.items.every(item => item.amount === null && item.status !== "eligible"))
  } finally { await db.close() }
})

test("comparison filters retain both prices, count before pagination, and keep the selected café pair when reversed", async () => {
  const db = await database()
  try {
    const original = await compare(db)
    const firstPage = await compare(db, { budget: "90", page_size: 1 })
    assert.equal(firstPage.total, 2); assert.equal(firstPage.items[0].name, "Cold Coffee")
    const nextPage = await compare(db, { budget: "90", page_size: 1, page: 2 })
    assert.deepEqual(nextPage.items[0].offers.map(offer => offer.amount), [150, 90])
    assert.equal((await compare(db, { sort: "difference" })).items[0].name, "Cheese Fries")
    assert.equal((await compare(db, { sort: "highest" })).items[0].name, "Chicken Popcorn")
    const cold = original.items[0]
    assert.equal((await compare(db, { category: cold.category_id, query: "COFFEE" })).total, 1)
    assert.equal((await compare(db, { query: "%" })).total, 0)
    const swapped = await compare(db, { canteen: original.second_canteen.id, compare_with: original.first_canteen.id })
    assert.deepEqual(swapped.items[0].offers.map(offer => offer.amount), [70, 110])
    assert.equal(swapped.items[0].difference, cold.difference)
    for (const filters of [{ budget: "-1" }, { budget: "1.234" }, { sort: "unknown" }, { page: 0 }, { page_size: 49 }, { query: "x".repeat(161) }, { unexpected: true }, { canteen: original.first_canteen.id, compare_with: original.first_canteen.id }]) await assert.rejects(compare(db, filters))
  } finally { await db.close() }
})

test("size variants stay separate, ties include zero and decimals, and another café cannot affect the selected pair", async () => {
  const db = await database()
  try {
    const original = await compare(db)
    assert.ok(!original.items.some(item => item.name === "Tea"))
    const smallTea = (await db.query("select id from public.menu_items where name='Tea' and variant='Small'")).rows[0].id
    await publishOffering(db, original.second_canteen.id, smallTea, 15)
    const tea = (await compare(db, { query: "Tea" })).items.find(item => item.name === "Tea")
    assert.equal(tea.variant, "Small"); assert.equal(tea.difference, 0)
    assert.ok(tea.offers.every(offer => offer.is_lowest && offer.amount === 15))
    assert.ok(!(await compare(db)).items.some(item => item.name === "Tea" && item.variant !== "Small"))
    const third = (await db.query("insert into public.canteens(name,key) values('Third comparison café',private.norm('Third comparison café')) returning id")).rows[0].id
    await publishOffering(db, third, original.items[0].id, 0)
    await publishOffering(db, third, smallTea, 20.25)
    const selected = { canteen: original.first_canteen.id, compare_with: third }
    const free = await compare(db, { ...selected, budget: "0" })
    assert.equal(free.total, 1); assert.equal(free.items[0].lowest_price, 0); assert.equal(free.items[0].difference, 110)
    const decimal = (await compare(db, { ...selected, query: "Tea" })).items[0]
    assert.deepEqual(decimal.offers.map(offer => offer.amount), [15, 20.25]); assert.equal(decimal.difference, 5.25)
    assert.equal((await compare(db, { canteen: original.first_canteen.id, compare_with: original.second_canteen.id, budget: "0" })).total, 0)
  } finally { await db.close() }
})

test("new prices require publication and withdrawn prices cannot reappear in menu comparisons", async () => {
  const db = await database()
  try {
    const admin = await createUser(db, { role: "admin" })
    const cold = (await compare(db, { query: "Cold Coffee" })).items[0]
    const offering = cold.offers[0].id
    const { entry } = await rpc(db, admin, "admin_get_menu_entry", { p_offering_id: offering })
    const price = await rpc(db, admin, "admin_record_price", { p_offering_id: offering, p_event_kind: "set", p_amount: "60",
      p_expected_price_id: entry.price_record_id, p_corrects_price_id: null, p_reason: "Disposable replacement menu price", p_request_id: token() })
    assert.equal((await compare(db, { query: "Cold Coffee" })).total, 0)
    await rpc(db, admin, "admin_save_menu_entry", { p_offering_id: offering, p_price_record_id: price.id,
      p_data: { source_label: "Updated test text menu", source_kind: "text", is_published: true },
      p_expected_version: entry.version, p_reason: "Publish the replacement menu amount", p_request_id: token() })
    const updated = (await compare(db, { query: "Cold Coffee" })).items[0]
    assert.deepEqual(updated.offers.map(offer => offer.amount), [60, 70]); assert.equal(updated.difference, 10)
    await rpc(db, admin, "admin_record_price", { p_offering_id: offering, p_event_kind: "withdraw", p_amount: null,
      p_expected_price_id: price.id, p_corrects_price_id: null, p_reason: "Withdraw the test menu price", p_request_id: token() })
    assert.equal((await compare(db, { query: "Cold Coffee", budget: "100" })).total, 0)
  } finally { await db.close() }
})

test("empty and single-café menus return no invented comparisons", async () => {
  const db = await createDatabase()
  try {
    const empty = await compare(db)
    assert.equal(empty.total, 0); assert.deepEqual(empty.canteens, []); assert.equal(empty.first_canteen, null)
    await importMenu(db, menus[0])
    const single = await compare(db)
    assert.equal(single.canteens.length, 1); assert.equal(single.second_canteen, null); assert.equal(single.total, 0)
    assert.deepEqual(single.items, []); assert.deepEqual(single.categories, [])
  } finally { await db.close() }
})
