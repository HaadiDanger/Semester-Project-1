import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createDatabase, asRole, rpc } from "./helpers/database.mjs"
import { createUser, readyAsset, saveReference, token } from "./helpers/records.mjs"

let db, admin, ordinary, category, canteens, evidence
before(async () => {
  db = await createDatabase()
  admin = await createUser(db, { role: "admin" }); ordinary = await createUser(db)
  category = (await saveReference(db, admin, "food_categories", { name: "Test food" })).id
  canteens = []
  for (const name of ["Test canteen A", "Test canteen B", "Test canteen C"]) canteens.push((await saveReference(db, admin, "canteens", { name })).id)
  evidence = (await readyAsset(db, admin, "price_evidence")).id
})
after(async () => { await db?.close() })
async function item(name, extra = {}) {
  return (await saveReference(db, admin, "menu_items", { name, food_category_id: category, serving_quantity: 150, unit_code: "ml", is_comparable: true, ...extra })).id
}
async function offering(menu, index = 0, extra = {}) {
  return (await saveReference(db, admin, "canteen_offerings", { canteen_id: canteens[index], menu_item_id: menu, is_available: true, ...extra })).id
}
const record = (id, amount, expected = null, extra = {}, actor = admin) => rpc(db, actor, "admin_record_price", {
  p_offering_id: id, p_event_kind: amount === null ? "withdraw" : "set", p_amount: amount === null ? null : String(amount),
  p_expected_price_id: expected, p_corrects_price_id: null, p_reason: "Automated source test", p_request_id: token(), ...extra,
})
const verify = (id, extra = {}, actor = admin) => rpc(db, actor, "admin_verify_price", { p_price_id: id, p_decision: "verified",
  p_observed_at: new Date(Date.now() - 60000).toISOString(), p_source_method: "displayed_menu", p_evidence_asset_id: evidence,
  p_expected_verification_id: null, p_reason: "Automated observation test", p_request_id: token(), ...extra })
const search = (query, extra = {}) => rpc(db, null, "get_canteen_prices", { p_filters: { query, ...extra } })

test("equivalent portions, ties, differences, zero prices and sorting are computed before pagination", async () => {
  const menu = await item("Comparison drink")
  const amounts = [0, 20.25, 0]
  for (const [index, amount] of amounts.entries()) await verify((await record(await offering(menu, index), amount)).id)
  const data = await search("Comparison drink", { page_size: 1, page: 2 })
  assert.equal(data.total, 3)
  assert.equal(data.items[0].lowest_price, 0)
  assert.equal(data.items[0].eligible_count, 3)
  assert.equal(data.items[0].is_cheapest, true)
  const descending = await search("Comparison drink", { sort: "highest" })
  assert.equal(descending.items[0].amount, 20.25)
  assert.equal(descending.items[0].difference, 20.25)
  assert.equal(descending.items.filter(row => row.is_cheapest).length, 2)
  assert.equal((await search("Comparison drink", { budget: "0" })).total, 2)
  assert.equal(data.stale_after_days, 30)
  assert.equal(JSON.stringify(data).includes("evidence_asset_id"), false)
  assert.equal(JSON.stringify(data).includes("source_note"), false)
})

test("current-first prevents an older cheap verified price from resurfacing under a budget", async () => {
  const id = await offering(await item("Current first tea"))
  const old = await record(id, 10); await verify(old.id)
  assert.equal((await search("Current first tea", { budget: "20" })).total, 1)
  const latest = await record(id, 40, old.id)
  assert.equal((await search("Current first tea", { budget: "20" })).total, 0)
  let result = await search("Current first tea")
  assert.equal(result.items[0].status, "unverified")
  assert.equal(result.items[0].amount, null)
  await verify(latest.id)
  assert.equal((await search("Current first tea", { budget: "20" })).total, 0)
  result = await search("Current first tea", { budget: "40" })
  assert.equal(result.items[0].amount, 40)
  const withdrawn = await record(id, null, latest.id)
  assert.equal((await search("Current first tea")).items[0].status, "withdrawn")
  await assert.rejects(verify(latest.id), /Only the current/)
  await assert.rejects(verify(withdrawn.id), /Only the current/)
})

test("latest verification governs eligibility; revocation, stale observations and future times cannot backfill", async () => {
  const id = await offering(await item("Verification tea"))
  const price = await record(id, 15)
  const first = await verify(price.id)
  const revoke = await verify(price.id, { p_decision: "revoked", p_observed_at: null, p_source_method: null, p_evidence_asset_id: null, p_expected_verification_id: first.id })
  assert.equal((await search("Verification tea")).items[0].status, "revoked")
  const stale = await verify(price.id, { p_expected_verification_id: revoke.id, p_observed_at: new Date(Date.now() - 31 * 86400000).toISOString() })
  assert.equal((await search("Verification tea")).items[0].status, "stale")
  await assert.rejects(verify(price.id, { p_expected_verification_id: stale.id, p_observed_at: new Date(Date.now() + 86400000).toISOString() }), /non-future/)
  await assert.rejects(verify(price.id, { p_expected_verification_id: stale.id, p_source_method: "simulated" }), /genuine verification/)
  await verify(price.id, { p_expected_verification_id: stale.id })
  assert.equal((await search("Verification tea")).items[0].status, "eligible")
  const history = await rpc(db, admin, "admin_price_history", { p_offering_id: id })
  assert.equal(history.items[0].verifications.length, 4)
})

test("different variants and serving sizes never share a minimum; missing and unavailable offerings are excluded", async () => {
  const menu = await item("Portion fries", { serving_quantity: 100, unit_code: "g" })
  const large = await item("Portion fries", { serving_quantity: 200, unit_code: "g" })
  const variant = await item("Portion fries", { serving_quantity: 100, unit_code: "g", variant: "seasoned" })
  for (const [id, amount] of [[menu, 20], [large, 5], [variant, 1]]) await verify((await record(await offering(id), amount)).id)
  await offering(menu, 1)
  await verify((await record(await offering(menu, 2, { is_available: false }), 0)).id)
  const data = await search("Portion fries")
  assert.equal(data.total, 5)
  const small = data.items.find(row => row.menu_item_id === menu && row.status === "eligible")
  assert.equal(small.lowest_price, 20)
  assert.equal(small.eligible_count, 1)
  assert.equal(data.items.find(row => row.status === "missing").amount, null)
  assert.equal(data.items.find(row => row.status === "unavailable").amount, null)
  assert.equal((await search("Portion fries", { budget: "100" })).total, 3)
})

test("unknown portions, retired catalogues, stale availability and lost evidence never qualify", async () => {
  const unknown = await item("Unknown portion", { serving_quantity: null, unit_code: null, is_comparable: false })
  await verify((await record(await offering(unknown), 9)).id)
  assert.equal((await search("Unknown portion")).items[0].status, "incomparable")
  const freshMenu = await item("Availability check")
  const id = await offering(freshMenu)
  await verify((await record(id, 10)).id)
  await db.query("update public.canteen_offerings set availability_checked_at=now()-interval '31 days' where id=$1", [id])
  assert.equal((await search("Availability check")).items[0].status, "availability_stale")
  const refs = await rpc(db, admin, "get_reference_data", { p_include_inactive: true })
  await saveReference(db, admin, "canteen_offerings", { is_available: true }, refs.canteen_offerings.find(row => row.id === id))
  assert.equal((await search("Availability check")).items[0].status, "eligible")
  await saveReference(db, admin, "menu_items", { is_active: false }, refs.menu_items.find(row => row.id === freshMenu))
  assert.equal((await search("Availability check")).total, 0)
  const localEvidence = await readyAsset(db, admin, "price_evidence")
  const price = await record(await offering(await item("Lost evidence")), 3)
  await verify(price.id, { p_evidence_asset_id: localEvidence.id })
  await db.query("update private.assets set state='delete_pending' where id=$1", [localEvidence.id])
  assert.equal((await search("Lost evidence")).items[0].status, "evidence_missing")
})

test("version conflicts, idempotency, exact decimal validation and immutable comparison identities", async () => {
  const menu = await item("Immutable item")
  const id = await offering(menu)
  await assert.rejects(record(id, "1.234"), /at most two/)
  await assert.rejects(record(id, "NaN"), /non-negative/)
  await assert.rejects(record(id, "-1"), /non-negative/)
  const request = token()
  const first = await record(id, 12, null, { p_request_id: request })
  assert.deepEqual(await record(id, 12, null, { p_request_id: request }), first)
  await assert.rejects(record(id, 20), /changed/)
  const correction = await record(id, 20, first.id, { p_corrects_price_id: first.id })
  await verify(correction.id)
  const refs = await rpc(db, admin, "get_reference_data", { p_include_inactive: true })
  await assert.rejects(saveReference(db, admin, "menu_items", { serving_quantity: 999 }, refs.menu_items.find(row => row.id === menu)), /immutable comparison identity/)
  await assert.rejects(saveReference(db, admin, "canteen_offerings", { canteen_id: canteens[1] }, refs.canteen_offerings.find(row => row.id === id)), /identity is immutable/)
  for (const table of ["price_records", "price_verifications", "admin_audit_log"]) {
    await assert.rejects(db.exec(`update private.${table} set reason='tampered'`.replace(table === "price_records" ? "reason" : "never-match", "source_note")), /append-only/)
    await assert.rejects(db.exec(`delete from private.${table}`), /append-only/)
  }
})

test("anonymous and ordinary clients cannot access histories, evidence or price-writing RPCs", async () => {
  const id = await offering(await item("Protected price"))
  await assert.rejects(record(id, 4, null, {}, ordinary), /Administrator/)
  await assert.rejects(rpc(db, ordinary, "admin_price_history", { p_offering_id: id }), /Administrator/)
  await assert.rejects(rpc(db, null, "admin_price_history", { p_offering_id: id }), /permission denied/)
  for (const table of ["price_records", "price_verifications", "assets"]) await assert.rejects(asRole(db, "authenticated", ordinary, `select * from private.${table}`), /permission denied/)
  await assert.rejects(search("", { budget: "1e2" }), /non-negative/)
  await assert.rejects(search("", { sort: "random" }), /sort order/)
  await assert.rejects(search("", { page_size: 1000 }), /search parameters/)
})
