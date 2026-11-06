import { createClient } from "@supabase/supabase-js"
import { createAssetHandler } from "../_shared/asset-handler.mjs"

const service = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
})
Deno.serve(createAssetHandler({ service, anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
  allowedOrigins: (Deno.env.get("APP_ALLOWED_ORIGINS") || "http://localhost:5173,http://127.0.0.1:5173").split(",").map(value => value.trim()),
  loadWasm: () => Deno.readFile(new URL("../_shared/magick.wasm", import.meta.url)),
}))
