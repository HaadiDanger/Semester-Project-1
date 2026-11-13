import test from "node:test"
import assert from "node:assert/strict"
import { createServer, request as httpRequest } from "node:http"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createPhonePreviewServer, privateIPv4, selectLanAddress, validatePreviewBackend } from "../scripts/lib/phone-preview.mjs"

const key = "sb_publishable_phone_test_only"
const origin = "http://localhost:5173"
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)))
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
async function fixture(t) {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true })
  const directory = await mkdtemp(join(tmpdir(), "opencode", "phone-preview-test-"))
  await mkdir(join(directory, "assets"))
  await writeFile(join(directory, "index.html"), "<!doctype html><title>Public phone preview</title>")
  await writeFile(join(directory, ".env"), "PRIVATE_FIXTURE_NOT_SERVED")
  const javascript = `console.log("public");${"/* gzip fixture */".repeat(200)}`
  await writeFile(join(directory, "assets", "fixture.js"), javascript)
  const requests = []
  const upstream = createServer(async (request, response) => {
    let data = ""
    for await (const chunk of request) data += chunk
    requests.push({ path: request.url, headers: request.headers, body: JSON.parse(data || "{}") })
    if (request.url.endsWith("get_reference_data")) { response.writeHead(302, { Location: "http://outside.example.invalid/" }); return response.end() }
    response.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "must-not-forward=1" })
    response.end(JSON.stringify({ public: true }))
  })
  const target = await listen(upstream)
  const server = createPhonePreviewServer({ directory, host: "127.0.0.1", target, key, origin })
  const url = await listen(server)
  t.after(async () => { await close(server); await close(upstream); await rm(directory, { recursive: true, force: true }) })
  const post = (path, body = {}, headers = {}) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
  return { url, post, requests, javascript }
}

test("phone preview selects an assigned private LAN address and rejects virtual, public and privileged targets", () => {
  for (const value of ["192.168.29.174", "10.0.0.5", "172.16.2.3", "172.31.1.1"]) assert.equal(privateIPv4(value), true)
  for (const value of ["127.0.0.1", "8.8.8.8", "169.254.1.2", "172.32.1.1", "192.168.1.", "192.168.999.1"]) assert.equal(privateIPv4(value), false)
  const interfaces = { "vEthernet (WSL)": [{ family: "IPv4", address: "172.24.80.1", internal: false }], Ethernet: [{ family: "IPv4", address: "192.168.29.174", internal: false }] }
  assert.equal(selectLanAddress(interfaces), "192.168.29.174")
  assert.throws(() => selectLanAddress(interfaces, "0.0.0.0"))
  assert.throws(() => selectLanAddress(interfaces, "172.24.80.1"))
  validatePreviewBackend("http://127.0.0.1:54321", key, origin)
  for (const target of ["https://project.supabase.co", "http://127.0.0.1:54321/private", "http://user:password@localhost:54321"]) assert.throws(() => validatePreviewBackend(target, key, origin))
  for (const badKey of ["sb_secret_never_allowed", "invalid", `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`]) assert.throws(() => validatePreviewBackend("http://127.0.0.1:54321", badKey, origin))
})

test("phone preview serves gzip/cacheable production files and SPA routes, not private files or arbitrary origins", async t => {
  const { url, javascript } = await fixture(t)
  const asset = await fetch(url + "/assets/fixture.js", { headers: { "Accept-Encoding": "gzip" } })
  assert.equal(asset.headers.get("content-encoding"), "gzip")
  assert.match(asset.headers.get("cache-control"), /immutable/)
  assert.equal(await asset.text(), javascript)
  const page = await fetch(url + "/student/a-public-profile")
  assert.match(await page.text(), /Public phone preview/)
  assert.equal(page.headers.get("cache-control"), "no-store")
  for (const path of ["/.env", "/%2eenv", "/assets/missing.js", "/images/missing.webp", "/supabase/.env"]) assert.equal((await fetch(url + path)).status, 404)
  assert.equal((await fetch(url, { headers: { Origin: "https://outside.example.invalid" } })).status, 403)
  // Node fetch owns the Host header; send it over HTTP explicitly to test rebinding.
  const forgedHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers: { Host: "outside.example.invalid" } }, response => { response.resume(); resolve(response.statusCode) })
    request.on("error", reject); request.end()
  })
  assert.equal(forgedHostStatus, 421)
  assert.equal((await fetch(url, { method: "POST" })).status, 405)
})

test("phone preview public RPCs always use anonymous credentials and never forward browser tokens or cookies", async t => {
  const { post, requests } = await fixture(t)
  const response = await post("/supabase/rest/v1/rpc/discover_profiles", { p_filters: { page_size: 12 } }, { Authorization: "Bearer caller-privileged-token", Cookie: "private-session=ignored" })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { public: true })
  assert.equal(response.headers.get("set-cookie"), null)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal(requests[0].headers.authorization, `Bearer ${key}`)
  assert.equal(requests[0].headers.apikey, key)
  assert.equal(requests[0].headers.origin, origin)
  assert.equal(requests[0].headers.cookie, undefined)
  assert.deepEqual(requests[0].body, { p_filters: { page_size: 12 } })
})

test("phone preview blocks Auth, Storage, mutations and asset processing before contacting the backend", async t => {
  const { post, requests } = await fixture(t)
  for (const path of ["/supabase/auth/v1/token", "/supabase/storage/v1/object/private", "/supabase/rest/v1/rpc/save_my_profile", "/supabase/rest/v1/rpc/get_my_profile", "/supabase/rest/v1/profiles"]) assert.equal((await post(path)).status, 403)
  const assetId = "11111111-1111-4111-8111-111111111111"
  for (const body of [{ action: "process", asset_id: assetId }, { action: "read", asset_id: "bad-id" }, { action: "read", asset_id: assetId, actor: "admin" }]) assert.equal((await post("/supabase/functions/v1/asset-gateway", body)).status, 403)
  assert.equal(requests.length, 0)
  assert.equal((await post("/supabase/functions/v1/asset-gateway", { action: "read", asset_id: assetId })).status, 200)
  assert.equal(requests[0].headers.authorization, `Bearer ${key}`)
})

test("phone preview bounds JSON bodies and refuses upstream redirects", async t => {
  const { url, post, requests } = await fixture(t)
  assert.equal((await post("/supabase/rest/v1/rpc/discover_profiles", { huge: "x".repeat(33000) })).status, 413)
  assert.equal((await post("/supabase/rest/v1/rpc/discover_profiles", null)).status, 400)
  assert.equal((await fetch(url + "/supabase/rest/v1/rpc/discover_profiles", { method: "POST", body: "not JSON" })).status, 400)
  assert.equal(requests.length, 0)
  assert.equal((await post("/supabase/rest/v1/rpc/get_reference_data")).status, 502)
  assert.equal(requests.length, 1)
})
