import { createClient } from "@supabase/supabase-js"
import { lookup } from "node:dns/promises"

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function keyRole(key) {
  if (key?.startsWith("sb_publishable_")) return "anon"
  if (key?.startsWith("sb_secret_")) return "service_role"
  try { return JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role } catch { return null }
}

export function validateDevEnvironment(env = process.env) {
  const url = new URL(env.DEV_SUPABASE_URL || "http://missing.invalid")
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "54321" || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
    throw new Error("Fixture tooling only accepts the local Supabase API at http://127.0.0.1:54321 (or localhost). Cloud targets are refused.")
  }
  if (env.DEV_SEED_CONFIRM !== "IUST_CONNECT_LOCAL_DEVELOPMENT") throw new Error("Set DEV_SEED_CONFIRM=IUST_CONNECT_LOCAL_DEVELOPMENT after identifying the local target.")
  if (!UUID.test(env.DEV_EXPECTED_INSTANCE_ID || "")) throw new Error("Set DEV_EXPECTED_INSTANCE_ID to the exact UUID from private.instance_config.")
  if (!env.DEV_SUPABASE_SERVICE_ROLE_KEY || !env.DEV_SUPABASE_PUBLISHABLE_KEY) throw new Error("Both server-only fixture credentials and the local public key are required.")
  if (keyRole(env.DEV_SUPABASE_SERVICE_ROLE_KEY) !== "service_role" || keyRole(env.DEV_SUPABASE_PUBLISHABLE_KEY) !== "anon") throw new Error("Use a server key for the fixture operator and a separate publishable/anon key for ordinary fixture sessions.")
  return { url: url.origin, instanceId: env.DEV_EXPECTED_INSTANCE_ID }
}
export function localFetch(origin, fetchImplementation = fetch) {
  return (input, init = {}) => {
    if (new URL(input instanceof Request ? input.url : input).origin !== origin) throw new Error("Fixture requests cannot leave the explicitly selected local origin.")
    return fetchImplementation(input, { ...init, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(init.signal ? [init.signal] : [])]) })
  }
}
export async function connectDevTarget(env = process.env) {
  const target = validateDevEnvironment(env)
  if (new URL(target.url).hostname === "localhost") {
    const addresses = await lookup("localhost", { all: true })
    if (!addresses.length || addresses.some(({ address }) => !["127.0.0.1", "::1"].includes(address))) throw new Error("localhost must resolve exclusively to loopback addresses.")
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch(target.url) } }
  const service = createClient(target.url, env.DEV_SUPABASE_SERVICE_ROLE_KEY, options)
  const { data, error } = await service.rpc("dev_fixture_target")
  if (error) throw new Error(`Cannot inspect local fixture target: ${error.message}`)
  if (data?.application !== "iust-connect" || data.instance_id !== target.instanceId || data.environment !== "development" || data.seed_enabled !== true) {
    throw new Error("The database identity, environment or seed permission does not match the explicitly selected development target.")
  }
  const client = () => createClient(target.url, env.DEV_SUPABASE_PUBLISHABLE_KEY, options)
  return { ...target, service, client }
}
export async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}
