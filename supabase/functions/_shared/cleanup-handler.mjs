import { callRpc, json } from "./http.mjs"

export function createCleanupHandler({ service, cleanupSecret }) {
  return async request => {
    if (request.method !== "POST") return json({ error: "Use POST" }, 405)
    const authorization = request.headers.get("authorization") || ""
    const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
    if (!cleanupSecret || cleanupSecret.length < 32 || provided.length !== cleanupSecret.length) return json({ error: "Unauthorized" }, 401)
    let mismatch = 0
    for (let i = 0; i < cleanupSecret.length; i++) mismatch |= cleanupSecret.charCodeAt(i) ^ provided.charCodeAt(i)
    if (mismatch) return json({ error: "Unauthorized" }, 401)
    try {
      const jobs = await callRpc(service, "worker_claim_cleanup", { p_limit: 10 })
      const queue = [...jobs]
      let completed = 0
      // Bounded concurrency keeps each invocation within the Edge wall-clock budget.
      await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
        while (queue.length) {
          const job = queue.shift()
          let success = false
          try {
            const outcomes = await Promise.allSettled([
              service.storage.from("upload-quarantine").remove([job.quarantine_path]),
              job.delete_final && job.bucket && job.path ? service.storage.from(job.bucket).remove([job.path]) : Promise.resolve({ error: null }),
            ])
            success = outcomes.every(result => result.status === "fulfilled" && !result.value.error)
          } catch { /* Persist failure so this job receives the database retry backoff. */ }
          try {
            await callRpc(service, "worker_finish_cleanup", { p_id: job.id, p_token: job.token, p_success: success })
            if (success) completed++
          } catch { /* A lost acknowledgement or expired lease is safe to retry later. */ }
        }
      }))
      return json({ attempted: jobs.length, completed })
    } catch { return json({ error: "Cleanup failed; expired claims are retried on the next invocation" }, 500) }
  }
}
