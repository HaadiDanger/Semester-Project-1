import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"
import { gzipSync } from "node:zlib"

const publicReads = new Set(["get_app_config", "get_reference_data", "discover_profiles", "get_profile", "get_canteen_menu", "get_canteen_menu_comparisons"])
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function privateIPv4(address) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return false
  const parts = address.split(".").map(Number)
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) && (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))
}
export function selectLanAddress(interfaces, requested) {
  const addresses = Object.entries(interfaces).filter(([name]) => !/virtual|vethernet|wsl|loopback|tailscale/i.test(name))
    .flatMap(([, entries]) => (entries || []).filter(entry => entry.family === "IPv4" && !entry.internal && privateIPv4(entry.address)).map(entry => entry.address))
  const address = requested || addresses[0]
  if (!address || !addresses.includes(address)) throw new Error("Choose an assigned private LAN IPv4 address with --host. Connect this computer and your phone to the same router.")
  return address
}
export function validatePreviewBackend(target, key, origin) {
  for (const value of [target, origin]) {
    const url = new URL(value)
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("The phone preview only proxies the configured local Supabase stack and local application origin.")
  }
  let anonymous = key.startsWith("sb_publishable_")
  if (key.split(".").length === 3) {
    try { anonymous = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon" } catch { anonymous = false }
  }
  if (!anonymous) throw new Error("Use a publishable or anonymous browser key for the phone preview, never a privileged key.")
}
function reply(response, status, message) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" })
  response.end(JSON.stringify({ error: message }))
}
async function readBody(request) {
  if (Number(request.headers["content-length"]) > 32768) { request.resume(); throw new Error("body-limit") }
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > 32768) throw new Error("body-limit")
    chunks.push(chunk)
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("body-format")
  return body
}

// Serves only built public files. The proxy always uses anonymous credentials,
// never forwards browser tokens/cookies, and has no Auth/Storage/write endpoint.
export function createPhonePreviewServer({ directory, host, target, key, origin }) {
  validatePreviewBackend(target, key, origin)
  const root = resolve(directory)
  const compressed = new Map()
  const server = createServer(async (request, response) => {
    try {
      const authority = `${host}:${server.address().port}`
      if (request.headers.host !== authority) return reply(response, 421, "Use the printed phone preview address.")
      if (request.headers.origin && request.headers.origin !== `http://${authority}`) return reply(response, 403, "Cross-origin preview requests are not allowed.")
      const path = decodeURIComponent((request.url || "/").split("?")[0])
      if (path.includes("\\") || path.includes("\0") || path.split("/").some(part => part.startsWith("."))) return reply(response, 404, "Not found.")
      if (path.startsWith("/supabase/")) {
        const upstreamPath = path.slice("/supabase".length)
        const rpc = upstreamPath.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1]
        const assetRead = upstreamPath === "/functions/v1/asset-gateway"
        if (request.method !== "POST" || (!publicReads.has(rpc) && !assetRead)) return reply(response, 403, "This preview permits public reads only. Sign-in, uploads and writes are disabled.")
        const body = await readBody(request)
        if (assetRead && (body.action !== "read" || !uuid.test(body.asset_id || "") || Object.keys(body).some(name => !["action", "asset_id"].includes(name)))) return reply(response, 403, "Only anonymous public image reads are allowed.")
        const result = await fetch(new URL(upstreamPath, target), { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Origin: origin }, body: JSON.stringify(body) })
        if (Number(result.headers.get("content-length")) > 6 * 1048576) return reply(response, 502, "The preview response is too large.")
        const bytes = Buffer.from(await result.arrayBuffer())
        if (bytes.length > 6 * 1048576) return reply(response, 502, "The preview response is too large.")
        response.writeHead(result.status, { "Content-Type": result.headers.get("content-type") || "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" })
        return response.end(bytes)
      }
      if (!["GET", "HEAD"].includes(request.method)) return reply(response, 405, "Only GET and HEAD are allowed for public files.")
      let file = resolve(root, `.${path === "/" ? "/index.html" : path}`)
      if (!file.startsWith(root + sep)) return reply(response, 404, "Not found.")
      const exists = await stat(file).catch(() => null)
      if (!exists?.isFile()) {
        if (extname(path) || path.startsWith("/assets/") || path.startsWith("/images/")) return reply(response, 404, "Not found.")
        file = resolve(root, "index.html")
      }
      const extension = extname(file)
      const gzip = /\bgzip\b/.test(request.headers["accept-encoding"] || "") && [".html", ".js", ".css", ".json", ".svg"].includes(extension)
      let bytes
      if (gzip) {
        if (!compressed.has(file)) compressed.set(file, gzipSync(await readFile(file)))
        bytes = compressed.get(file)
      } else bytes = await readFile(file)
      response.writeHead(200, { "Content-Type": types[extension] || "application/octet-stream", "Content-Length": bytes.length,
        "Cache-Control": extension === ".html" ? "no-store" : file.startsWith(resolve(root, "assets") + sep) ? "public, max-age=31536000, immutable" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", Vary: "Accept-Encoding", ...(gzip ? { "Content-Encoding": "gzip" } : {}) })
      response.end(request.method === "HEAD" ? undefined : bytes)
    } catch (error) {
      if (!response.headersSent) reply(response, error.message === "body-limit" ? 413 : error instanceof SyntaxError || error.message === "body-format" || error instanceof URIError ? 400 : 502, "The preview request could not be completed.")
      else response.destroy()
    }
  })
  server.requestTimeout = 20000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 5000
  server.maxConnections = 32
  return server
}
