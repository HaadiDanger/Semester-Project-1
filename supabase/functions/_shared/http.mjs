export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.get("origin")
  if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, "Origin is not allowed")
  return { ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" }
}
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", ...headers, "Content-Type": "application/json" } })
}
export async function readJson(request) {
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, "Request body is required")
  const chunks = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 4096) { await reader.cancel(); throw new HttpError(413, "Request is too large") }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new HttpError(400, "Invalid JSON") }
}
export async function callRpc(service, name, args) {
  const { data, error } = await service.rpc(name, args)
  if (error) throw new HttpError(error.code === "42501" ? 403 : error.code === "PT409" ? 409 : 400, error.message)
  return data
}
export async function viewer(request, service, anonKey) {
  const authorization = request.headers.get("authorization") || ""
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  if (!authorization || token === anonKey || token.startsWith("sb_publishable_")) return null
  if (!token) throw new HttpError(401, "Invalid authorization")
  const { data, error } = await service.auth.getUser(token)
  if (error || !data?.user) throw new HttpError(401, "Your session expired. Sign in again.")
  return data.user
}
