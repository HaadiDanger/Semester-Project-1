import { normalizeImage, ImageInputError, MAX_BYTES } from "./image-validator.mjs"
import { UUID, HttpError, corsHeaders, json, readJson, callRpc, viewer } from "./http.mjs"

export function createAssetHandler({ service, anonKey, allowedOrigins, loadWasm }) {
  return async request => {
    let headers = {}
    let claim, user
    try {
      headers = corsHeaders(request, allowedOrigins)
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
      if (request.method !== "POST") throw new HttpError(405, "Use POST")
      const body = await readJson(request)
      if (!body || Array.isArray(body) || Object.keys(body).some(key => !["action", "asset_id"].includes(key)) || !UUID.test(body.asset_id)) throw new HttpError(400, "Invalid image request")
      user = await viewer(request, service, anonKey)
      if (body.action === "read") {
        const asset = await callRpc(service, "worker_asset_access", { p_id: body.asset_id, p_viewer_id: user?.id ?? null })
        const { data, error } = await service.storage.from(asset.bucket).download(asset.path)
        if (error || !data) throw new HttpError(404, "Image is not available")
        return new Response(data, { headers: { ...headers, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'; sandbox" } })
      }
      if (body.action !== "process") throw new HttpError(400, "Unknown image action")
      if (!user) throw new HttpError(401, "Sign in before uploading")
      claim = await callRpc(service, "worker_claim_asset", { p_id: body.asset_id, p_user_id: user.id })
      if (claim.state === "ready") return json({ id: claim.id, state: "ready" }, 200, headers)
      const { data, error } = await service.storage.from("upload-quarantine").download(claim.quarantine_path)
      if (error || !data) throw new HttpError(400, "Upload was not found. Select the image again.")
      if (data.size > MAX_BYTES) throw new ImageInputError("Image exceeds the 5 MiB limit")
      const image = await normalizeImage(new Uint8Array(await data.arrayBuffer()), loadWasm)
      const upload = await service.storage.from(claim.bucket).upload(claim.path, image.bytes, { contentType: "image/webp", cacheControl: "0", upsert: true })
      if (upload.error) throw new HttpError(502, "Image storage failed. Please retry.")
      const result = await callRpc(service, "worker_complete_asset", { p_id: claim.id, p_user_id: user.id, p_token: claim.token,
        p_metadata: { byte_size: image.bytes.length, width: image.width, height: image.height, sha256: image.sha256 } })
      // The cleanup worker independently retries quarantine deletion and orphan recovery.
      try { await service.storage.from("upload-quarantine").remove([claim.quarantine_path]) }
      catch { /* A lost cleanup response cannot undo an already committed image. */ }
      return json(result, 200, headers)
    } catch (error) {
      if (claim?.token && user) {
        try { await callRpc(service, "worker_complete_asset", { p_id: claim.id, p_user_id: user.id, p_token: claim.token,
          p_metadata: null, p_failure: error instanceof ImageInputError ? "invalid_image" : "processing_failed" }) }
        catch { /* A completed or expired claim is handled by the cleanup worker. */ }
        try {
          const state = await callRpc(service, "worker_reconcile_asset", { p_id: claim.id, p_user_id: user.id, p_token: claim.token })
          if (state.state === "ready") return json(state, 200, headers)
        } catch { /* A later invocation retries reconciliation if the database is unavailable. */ }
      }
      return json({ error: error instanceof HttpError || error instanceof ImageInputError ? error.message : "Image service could not complete the request" },
        error instanceof ImageInputError ? 422 : error.status || 500, headers)
    }
  }
}
