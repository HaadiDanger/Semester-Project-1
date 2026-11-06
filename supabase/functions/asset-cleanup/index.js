import { createClient } from "@supabase/supabase-js"
import { createCleanupHandler } from "../_shared/cleanup-handler.mjs"

const service = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
})
Deno.serve(createCleanupHandler({ service, cleanupSecret: Deno.env.get("ASSET_CLEANUP_SECRET") }))
