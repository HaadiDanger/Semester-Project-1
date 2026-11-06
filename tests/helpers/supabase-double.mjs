import { readFile } from "node:fs/promises"
import { createDatabase, asRole, rpc } from "./database.mjs"
import { token } from "./records.mjs"
import { createAssetHandler } from "../../supabase/functions/_shared/asset-handler.mjs"

// Real application SQL and image code; Auth/Storage SDK calls are in-process doubles.
// This cannot establish GoTrue, PostgREST, Storage-server or Edge-runtime correctness.
export async function createSupabaseDouble(database) {
  const db = database || await createDatabase()
  const passwords = new Map(), bytes = new Map(), faults = {}
  const fail = error => ({ data: null, error: { code: error.code || "TEST_FAILURE", message: error.message || String(error) } })
  const runRpc = async (id, name, args, role) => {
    try {
      const data = await rpc(db, id, name, args, role)
      if (faults.afterRpc) await faults.afterRpc(name, args, data)
      return { data, error: null }
    } catch (error) { return fail(error) }
  }
  const users = async () => (await db.query("select id,email,email_confirmed_at,raw_app_meta_data as app_metadata from auth.users order by created_at,id")).rows
  async function uploadFor(owner, bucket, path, body) {
    try {
      await asRole(db, "authenticated", owner, "insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)", [bucket, path, owner])
      bytes.set(`${bucket}/${path}`, new Uint8Array(body instanceof Blob ? await body.arrayBuffer() : body))
      return { data: { path }, error: null }
    } catch (error) { return fail(error) }
  }
  const service = {
    rpc: (name, args) => runRpc(null, name, args, "service_role"),
    auth: {
      getUser: async bearer => {
        const id = bearer.startsWith("test-user.") ? bearer.slice(10) : null
        const user = (await users()).find(user => user.id === id)
        return user ? { data: { user }, error: null } : fail(new Error("Invalid test session"))
      },
      admin: {
        listUsers: async ({ page, perPage }) => ({ data: { users: (await users()).slice((page - 1) * perPage, page * perPage) }, error: null }),
        createUser: async ({ email, password, email_confirm, app_metadata }) => {
          try {
            const id = token()
            await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,$3,$4)", [id, email, email_confirm ? new Date() : null, app_metadata || {}])
            passwords.set(id, password)
            return { data: { user: (await users()).find(user => user.id === id) }, error: null }
          } catch (error) { return fail(error) }
        },
        deleteUser: async id => {
          if (faults.deleteUser) return fail(new Error("Simulated Auth deletion outage"))
          try { await db.query("delete from auth.users where id=$1", [id]); passwords.delete(id); return { data: {}, error: null } }
          catch (error) { return fail(error) }
        },
      },
    },
    storage: { from: bucket => ({
      download: async path => bytes.has(`${bucket}/${path}`) ? { data: new Blob([bytes.get(`${bucket}/${path}`)]), error: null } : fail(new Error("Not found")),
      upload: async (path, body) => {
        if (faults.beforeUpload) await faults.beforeUpload(bucket, path)
        if (faults.upload) return fail(new Error("Simulated Storage upload outage"))
        bytes.set(`${bucket}/${path}`, new Uint8Array(body))
        await db.query("insert into storage.objects(bucket_id,name) values($1,$2) on conflict(bucket_id,name) do nothing", [bucket, path])
        return { data: { path }, error: null }
      },
      remove: async paths => {
        if (faults.remove > 0) { faults.remove--; return fail(new Error("Simulated Storage deletion outage")) }
        if (faults.beforeRemove) await faults.beforeRemove(bucket, paths)
        for (const path of paths) { bytes.delete(`${bucket}/${path}`); await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [bucket, path]) }
        return { data: [], error: null }
      },
    }) },
  }
  const handler = createAssetHandler({ service, anonKey: "sb_publishable_test", allowedOrigins: ["http://localhost:5173"],
    loadWasm: () => readFile(new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm"))) })
  const client = () => {
    let user
    return {
      rpc: (name, args) => runRpc(user?.id || null, name, args, user ? "authenticated" : "anon"),
      auth: {
        signInWithPassword: async ({ email, password }) => {
          user = (await users()).find(user => user.email === email && passwords.get(user.id) === password)
          return user ? { data: { user }, error: null } : fail(new Error("Invalid test credentials"))
        },
        signOut: async () => { user = null; return { error: null } },
      },
      storage: { from: bucket => ({ upload: (path, body) => uploadFor(user?.id, bucket, path, body) }) },
      functions: { invoke: async (name, { body }) => {
        if (name !== "asset-gateway") return fail(new Error("Unsupported test function"))
        const response = await handler(new Request("http://localhost:54321/functions/v1/asset-gateway", { method: "POST", headers: { authorization: `Bearer test-user.${user?.id}` }, body: JSON.stringify(body) }))
        const data = await response.json()
        return response.ok ? { data, error: null } : fail(new Error(data.error))
      } },
    }
  }
  const instanceId = (await db.query("select instance_id from private.instance_config")).rows[0].instance_id
  return { db, service, client, instanceId, url: "http://127.0.0.1:54321", bytes, faults, handler, uploadFor }
}
