import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { asRole, createDatabase, rpc } from "./helpers/database.mjs"
import { createUser, saveReference, token } from "./helpers/records.mjs"

let db, admin, ordinary, category
before(async () => {
  db = await createDatabase()
  admin = await createUser(db, { role: "admin" }); ordinary = await createUser(db)
  category = (await saveReference(db, admin, "food_categories", { name: "Menu test category" })).id
  await db.exec(`insert into private.menu_photos(key,path,alt,author,source_url,license,license_url,source_date,sha256,width,height)
    values('test-photo','/images/menu/test-photo.webp','Test photo metadata','Test photographer','https://example.invalid/photo',
      'CC BY 4.0','https://creativecommons.org/licenses/by/4.0/','2020-01-01',repeat('a',64),800,600)`)
})
after(async () => { await db?.close() })
const search = filters => rpc(db, null, "get_canteen_menu", { p_filters: filters || {} })
const record = (id, amount, expected = null) => rpc(db, admin, "admin_record_price", {
  p_offering_id: id, p_event_kind: amount === null ? "withdraw" : "set", p_amount: amount === null ? null : String(amount),
  p_expected_price_id: expected, p_corrects_price_id: null, p_reason: "Private source note", p_request_id: token(),
})
const publication = (offering, price, extra = {}) => ({ p_offering_id: offering, p_price_record_id: price,
  p_data: { source_label: "User-supplied menu photograph", source_observed_on: null, photo_key: "test-photo", is_published: true },
  p_expected_version: null, p_reason: "Transcribe test menu", p_request_id: token(), ...extra })
const publish = (offering, price, extra = {}, actor = admin) => rpc(db, actor, "admin_save_menu_entry", publication(offering, price, extra))
async function menu(name, amounts = [15]) {
  const cafe = await saveReference(db, admin, "canteens", { name })
  const entries = []
  for (const [index, amount] of amounts.entries()) {
    const item = await saveReference(db, admin, "menu_items", { name: `${name} dish ${index}`, food_category_id: category })
    const offering = await saveReference(db, admin, "canteen_offerings", { canteen_id: cafe.id, menu_item_id: item.id })
    const price = await record(offering.id, amount)
    entries.push({ item, offering, price })
  }
  return { cafe, entries }
}

test("an empty database and unpublished prices do not invent a café menu", async () => {
  const empty = await search()
  assert.equal(empty.canteen, null); assert.deepEqual(empty.canteens, []); assert.deepEqual(empty.items, [])
  const { cafe } = await menu("Unpublished café")
  assert.equal((await search({ canteen: cafe.id })).total, 0)
  assert.equal((await search({ canteen: token() })).canteen, null)
})

test("published menu-board amounts include source and photo credits without claiming exact portions or verified comparisons", async () => {
  const { cafe, entries: [{ offering, price }] } = await menu("Photographed café")
  await publish(offering.id, price.id)
  const result = await search({ canteen: cafe.id })
  assert.equal(result.total, 1); assert.equal(result.canteen.name, "Photographed café")
  assert.equal(result.items[0].amount, 15); assert.equal(result.canteen.min_price, 15)
  assert.equal(result.items[0].source_observed_on, null); assert.equal(result.items[0].serving_quantity, null)
  assert.equal(result.items[0].photo.author, "Test photographer")
  assert.equal(result.items[0].photo.path, "/images/menu/test-photo.webp")
  const comparison = await rpc(db, null, "get_canteen_prices", { p_filters: { canteen: cafe.id } })
  assert.equal(comparison.items[0].amount, null); assert.notEqual(comparison.items[0].status, "eligible")
  for (const secret of ["Private source note", "recorded_by", "price_record_id", "request_id", "sha256"]) assert.equal(JSON.stringify(result).includes(secret), false)
})

test("category, literal search, zero/decimal budgets and sorting operate on current published listings before pagination", async () => {
  const { cafe, entries } = await menu("Budget café", [0, 20.25, 100])
  for (const [index, { offering, price }] of entries.entries()) await publish(offering.id, price.id, { p_data: { source_label: "Budget menu", is_published: true, display_order: index } })
  const result = await search({ canteen: cafe.id, category, budget: "20.25", sort: "highest", page_size: 1 })
  assert.equal(result.total, 2); assert.equal(result.items[0].amount, 20.25)
  assert.equal(result.categories[0].item_count, 3)
  assert.equal((await search({ canteen: cafe.id, budget: "0" })).total, 1)
  assert.equal((await search({ canteen: cafe.id, query: "BUDGET CAFÉ DISH 1" })).total, 1)
  assert.equal((await search({ canteen: cafe.id, query: "%" })).total, 0)
  assert.equal((await search({ canteen: cafe.id, category: token() })).total, 0)
  assert.equal((await search({ canteen: cafe.id, budget: "20.25", page: 2, page_size: 1, sort: "highest" })).items[0].amount, 0)
  for (const filters of [{ budget: "NaN" }, { budget: "-1" }, { budget: "1.234" }, { sort: "random" }, { page: 0 }, { page_size: 100 }, { query: "x".repeat(161) }, { unknown: true }]) await assert.rejects(search(filters))
})

test("replacement and withdrawal never resurrect an older cheap menu price; hiding a superseded listing remains possible", async () => {
  const { cafe, entries: [{ offering, price }] } = await menu("Changing café", [10])
  await publish(offering.id, price.id)
  const updated = await record(offering.id, 90, price.id)
  assert.equal((await search({ canteen: cafe.id, budget: "20" })).total, 0)
  assert.equal((await search({ canteen: cafe.id })).total, 0)
  await assert.rejects(publish(offering.id, price.id, { p_expected_version: 1 }), /current set-price/)
  await publish(offering.id, updated.id, { p_expected_version: 1 })
  assert.equal((await search({ canteen: cafe.id })).items[0].amount, 90)
  assert.equal((await search({ canteen: cafe.id, budget: "20" })).total, 0)
  await record(offering.id, null, updated.id)
  assert.equal((await search({ canteen: cafe.id })).total, 0)
  await publish(offering.id, updated.id, { p_expected_version: 2, p_data: { source_label: "Withdrawn menu", is_published: false } })
  assert.equal((await rpc(db, admin, "admin_get_menu_entry", { p_offering_id: offering.id })).entry.is_published, false)
})

test("revocation, retirement and unpublication remove a listing and reject accidental republication", async () => {
  const { cafe, entries } = await menu("Retiring café", [15, 30, 50])
  for (const { offering, price } of entries) await publish(offering.id, price.id)
  const [{ offering, price }, retired, hidden] = entries
  await rpc(db, admin, "admin_verify_price", { p_price_id: price.id, p_decision: "revoked", p_observed_at: null,
    p_source_method: null, p_evidence_asset_id: null, p_expected_verification_id: null, p_reason: "Photograph price was incorrect", p_request_id: token() })
  await assert.rejects(publish(offering.id, price.id, { p_expected_version: 1 }), /revoked price/)
  await saveReference(db, admin, "menu_items", { is_active: false }, retired.item)
  await assert.rejects(publish(retired.offering.id, retired.price.id, { p_expected_version: 1 }), /Retired/)
  await publish(hidden.offering.id, hidden.price.id, { p_expected_version: 1, p_data: { source_label: "Hidden menu", is_published: false } })
  assert.equal((await search({ canteen: cafe.id })).total, 0)
  assert.equal((await rpc(db, admin, "admin_get_menu_entry", { p_offering_id: offering.id })).is_visible, false)
})

test("publication enforces authorization, matching prices, optimistic versions, idempotency and real source dates", async () => {
  const { entries: [{ offering, price }, other] } = await menu("Protected café", [20, 40])
  await assert.rejects(publish(offering.id, price.id, {}, ordinary), /Administrator/)
  await assert.rejects(publish(offering.id, price.id, {}, null), /permission denied/)
  await assert.rejects(rpc(db, ordinary, "admin_get_menu_entry", { p_offering_id: offering.id }), /administrator/)
  for (const table of ["canteen_menu_entries", "menu_photos", "published_canteen_menu"]) {
    await assert.rejects(asRole(db, "anon", null, `select * from private.${table}`), /permission denied/)
    await assert.rejects(asRole(db, "authenticated", ordinary, `select * from private.${table}`), /permission denied/)
  }
  await assert.rejects(publish(offering.id, other.price.id), /current set-price/)
  await assert.rejects(publish(offering.id, other.price.id, { p_data: { source_label: "Wrong price", is_published: false } }), /matching set-price/)
  await assert.rejects(publish(offering.id, price.id, { p_data: { source_label: "Future menu", is_published: true, source_observed_on: "2099-01-01" } }), /future/)
  const args = publication(offering.id, price.id)
  const saved = await rpc(db, admin, "admin_save_menu_entry", args)
  assert.deepEqual(await rpc(db, admin, "admin_save_menu_entry", args), saved)
  await assert.rejects(publish(offering.id, price.id), /changed/)
  assert.equal((await db.query("select count(*)::int as n from private.admin_audit_log where action='menu.publish' and target_key=$1", [offering.id])).rows[0].n, 1)
})

test("operator prices require exactly one attributable actor and cannot make a sample café into a genuine menu", async () => {
  const { entries: [{ offering }] } = await menu("Operator café")
  await assert.rejects(db.query("insert into private.price_records(offering_id,event_kind,amount,request_id) values($1,'set',40,$2)", [offering.id, token()]), /price_record_actor/)
  await assert.rejects(db.query("insert into private.price_records(offering_id,event_kind,amount,request_id,recorded_by,recorded_by_operator) values($1,'set',40,$2,$3,'menu importer')", [offering.id, token(), admin]), /price_record_actor/)
  const price = (await db.query("insert into private.price_records(offering_id,event_kind,amount,request_id,recorded_by_operator) values($1,'set',40,$2,'menu importer') returning id", [offering.id, token()])).rows[0]
  await publish(offering.id, price.id)
  assert.equal((await rpc(db, admin, "admin_price_history", { p_offering_id: offering.id })).items[0].recorded_by_operator, "menu importer")
  await db.exec("update private.instance_config set environment='development',seed_enabled=true")
  const sample = await createUser(db, { role: "admin" })
  await db.query("select set_config('iust.fixture_registration',$1,false)", [sample])
  await db.query("update private.account_controls set seed_batch_id=$1 where user_id=$2", [token(), sample])
  const sampleCafe = await saveReference(db, sample, "canteens", { name: "Sample menu café" })
  const sampleOffering = await saveReference(db, sample, "canteen_offerings", { canteen_id: sampleCafe.id, menu_item_id: (await db.query("select menu_item_id from public.canteen_offerings where id=$1", [offering.id])).rows[0].menu_item_id })
  const samplePrice = await record(sampleOffering.id, 5)
  await assert.rejects(publish(sampleOffering.id, samplePrice.id), /Genuine offering/)
  await assert.rejects(publish(offering.id, price.id, { p_expected_version: 1 }, sample), /genuine administrator/)
})
