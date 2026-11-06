import { readFile, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { createSupabaseDouble } from "../helpers/supabase-double.mjs"
import { temporaryDirectory } from "../helpers/temp.mjs"
import { profileReferences, publishProfile, saveProfile } from "../helpers/records.mjs"
import { rpc } from "../helpers/database.mjs"
import { seedDevelopment } from "../../scripts/seed-dev.mjs"
import { createAssetHandler } from "../../supabase/functions/_shared/asset-handler.mjs"
import { sampleEvidence } from "../../scripts/fixtures/sample-evidence.mjs"

// Browser UI + actual Supabase JS client + real application SQL and image code.
// HTTP/Auth/Storage infrastructure below is deliberately doubled, never a real Supabase server.
export async function createBrowserBackend() {
  const target = await createSupabaseDouble(), db = target.db
  const directory = await temporaryDirectory("iust-browser-")
  await db.exec("update private.instance_config set environment='development',seed_enabled=true")
  await seedDevelopment({ connect: async () => target, directory: directory.url, log: () => {} })
  const manifest = JSON.parse(await readFile(new URL("accounts.json", directory.url), "utf8"))
  const sessions = new Map()
  const backend = { target, db, manifest, calls: [], authCalls: [], errors: [], failNext: new Map(), beforeReply: null }
  backend.account = async (name, role) => {
    const email = `${name}-${randomUUID()}@browser.example.invalid`, password = "Browser-test-only-LongPassword!"
    const { data, error } = await target.service.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    if (role) await db.query("insert into private.user_roles(user_id,role) values($1,$2)", [data.user.id, role])
    return { id: data.user.id, email, password }
  }
  backend.admin = await backend.account("administrator", "admin")
  backend.manager = await backend.account("role-manager", "role_manager")
  backend.refs = await profileReferences(db, backend.admin.id)
  backend.publicMember = await backend.account("privacy-member")
  const asset = await rpc(db, backend.publicMember.id, "reserve_asset", { p_purpose: "photo", p_request_id: randomUUID() })
  await target.uploadFor(backend.publicMember.id, asset.bucket, asset.path, sampleEvidence())
  await target.handler(new Request(`${target.url}/functions/v1/asset-gateway`, { method: "POST", headers: { authorization: `Bearer test-user.${backend.publicMember.id}` },
    body: JSON.stringify({ action: "process", asset_id: asset.id }) }))
  const saved = await saveProfile(db, backend.publicMember.id, backend.refs, { display_name: "Browser Privacy Member", photo_asset_id: asset.id, photo_audience: "campus",
    contacts: [
      { kind: "email", value: "owner-only@browser.example.invalid", audience: "owner" },
      { kind: "email", value: "campus-only@browser.example.invalid", audience: "campus" },
      { kind: "website", value: "https://example.invalid/public-test", label: "Public test link", audience: "public" },
    ], projects: [
      { title: "Owner-only test project", description: "Private test material", audience: "owner" },
      { title: "Campus-only test project", description: "Campus test material", audience: "campus" },
      { title: "Public test project", description: "<script>window.INJECTED=true</script> Plaintext safety example.", audience: "public" },
    ] })
  await publishProfile(db, backend.publicMember.id, backend.admin.id, saved.write_version)
  const handler = createAssetHandler({ service: target.service, anonKey: "sb_publishable_browser_test_only",
    allowedOrigins: ["http://127.0.0.1:4173"], loadWasm: () => readFile(new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm"))) })
  const authUser = user => ({ aud: "authenticated", role: "authenticated", user_metadata: {}, identities: [], created_at: new Date().toISOString(), ...user })
  function session(user) {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url")
    const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, role: "authenticated", aud: "authenticated", exp })}.browser-test-signature`
    sessions.set(access_token, user.id)
    return { access_token, refresh_token: randomUUID(), expires_in: 3600, expires_at: exp, token_type: "bearer", user: authUser(user) }
  }
  backend.attach = async context => {
    await context.route("**/*", async route => {
      const url = new URL(route.request().url())
      if (!["http://127.0.0.1:4173", "http://127.0.0.1:4174", target.url].includes(url.origin)) {
        backend.errors.push(`Unexpected external request: ${url.origin}${url.pathname}`)
        return route.abort("blockedbyclient")
      }
      return route.continue()
    })
    await context.route(`${target.url}/**`, async route => {
      const request = route.request(), url = new URL(request.url()), headers = request.headers()
      const bearer = headers.authorization?.replace(/^Bearer /, ""), userId = sessions.get(bearer) || null
      const send = (data, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) })
      try {
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS" } })
        if (url.pathname.startsWith("/auth/v1/")) {
          const body = request.postDataJSON() || {}
          backend.authCalls.push({ path: url.pathname, grant: url.searchParams.get("grant_type"), redirectTo: url.searchParams.get("redirect_to"), body: { ...body, password: body.password ? "[test password redacted]" : undefined } })
          if (url.pathname.endsWith("/token")) {
            const client = target.client()
            const { data, error } = await client.auth.signInWithPassword(body)
            if (error) return send({ code: "invalid_credentials", msg: "Invalid login credentials", error_code: "invalid_credentials" }, 400)
            if (!data.user.email_confirmed_at) return send({ code: "email_not_confirmed", msg: "Email not confirmed", error_code: "email_not_confirmed" }, 400)
            return send(session(data.user))
          }
          if (url.pathname.endsWith("/signup")) {
            const { data, error } = await target.service.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: false })
            if (error) return send({ msg: error.message }, 400)
            return send(authUser(data.user))
          }
          if (url.pathname.endsWith("/logout")) { sessions.delete(bearer); return send({}) }
          if (url.pathname.endsWith("/recover") || url.pathname.endsWith("/resend")) return send({})
          if (url.pathname.endsWith("/user") && userId) {
            const { data } = await target.service.auth.getUser(`test-user.${userId}`)
            return send(authUser(data.user))
          }
          return send({ msg: "Session not found", code: "session_not_found" }, 401)
        }
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          const name = url.pathname.split("/").at(-1), args = request.postDataJSON() || {}
          backend.calls.push({ name, args, userId })
          if (backend.failNext.get(name)) {
            backend.failNext.set(name, backend.failNext.get(name) - 1)
            return send({ code: "TEST_OUTAGE", message: "Browser test: simulated database outage" }, 503)
          }
          const data = await rpc(db, userId, name, args)
          await backend.beforeReply?.({ name, args, userId, data })
          return await send(data)
        }
        if (url.pathname.startsWith("/storage/v1/object/upload-quarantine/")) {
          if (!userId) return send({ message: "Unauthorized" }, 401)
          const raw = new Request(url, { method: "POST", headers, body: request.postDataBuffer() })
          let bytes
          if (headers["content-type"]?.startsWith("multipart/form-data")) {
            const form = await raw.formData()
            const file = [...form.values()].find(value => value instanceof Blob)
            bytes = new Uint8Array(await file.arrayBuffer())
          } else bytes = new Uint8Array(await raw.arrayBuffer())
          const path = decodeURIComponent(url.pathname.slice("/storage/v1/object/upload-quarantine/".length))
          const { data, error } = await target.uploadFor(userId, "upload-quarantine", path, bytes)
          return send(error ? { message: error.message } : { Key: `upload-quarantine/${data.path}`, Id: randomUUID() }, error ? 403 : 200)
        }
        if (url.pathname === "/functions/v1/asset-gateway") {
          const response = await handler(new Request(url, { method: "POST", headers: { ...headers, authorization: userId ? `Bearer test-user.${userId}` : "Bearer sb_publishable_browser_test_only" }, body: request.postDataBuffer() }))
          return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
        }
        backend.errors.push(`Unhandled test API: ${request.method()} ${url.pathname}`)
        return send({ message: "Unhandled browser-test API" }, 501)
      } catch (error) {
        if (error.message.includes("Target closed") || error.message.includes("already handled") || error.message.includes("Request context disposed")) return
        return send({ code: error.code || "TEST_FAILURE", message: error.message }, error.code === "42501" ? 403 : error.code === "PT409" ? 409 : 400).catch(() => {})
      }
    })
  }
  backend.close = async () => { await db.close(); await rm(directory.path, { recursive: true, force: true }) }
  return backend
}
