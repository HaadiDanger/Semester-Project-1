import { createClient } from "@supabase/supabase-js"

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || ""
export const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim()
function configurationProblem() {
  if (!supabaseUrl || !supabaseKey || /YOUR_|your-project/i.test(supabaseUrl + supabaseKey)) return "Add your Supabase project URL and publishable key to .env.local."
  try {
    const url = new URL(supabaseUrl)
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return "Use an HTTPS Supabase URL, or a local Supabase URL."
  } catch { return "The Supabase project URL is invalid." }
  if (supabaseKey.startsWith("sb_secret_")) return "Use a publishable key, never a privileged server key."
  if (supabaseKey.split(".").length === 3) {
    try {
      const role = JSON.parse(atob(supabaseKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role
      if (role !== "anon") return "Only an anonymous legacy key or a publishable key belongs in the browser."
    } catch { return "The legacy Supabase key is invalid." }
  } else if (!supabaseKey.startsWith("sb_publishable_")) return "The Supabase publishable key is invalid."
  return null
}
export const setupError = configurationProblem()
export const supabase = setupError ? null : createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "iust-connect-auth" },
})
export function authRedirect(path) { return new URL(path, import.meta.env.VITE_APP_URL || window.location.origin).toString() }
export function authLinkError({ search, hash }) {
  for (const value of [search, hash?.replace(/^#/, "")]) {
    const params = new URLSearchParams(value)
    if (params.get("error_description")) return params.get("error_description")
    if (params.has("error") || params.has("error_code")) return "This email link is invalid or has expired. Request a fresh link and open it in this browser."
  }
  return null
}
export function readableError(error) {
  if (error?.code === "email_not_confirmed") return "Confirm your email address before signing in. You can request a new confirmation email below."
  if (["over_email_send_rate_limit", "over_request_rate_limit"].includes(error?.code) || (error?.name === "AuthApiError" && error.status === 429)) return "Too many email requests. Please wait a little before trying again."
  if (/error sending (?:confirmation |recovery |magic link |change of )?email/i.test(error?.message || "")) return "The email could not be sent. Please try again shortly. If this continues, ask the administrator to check email delivery."
  if (error?.code === "23505") return "That entry already exists. Reload the current records before trying again."
  if (error?.code === "23503") return "This entry is still in use. Check its related records first."
  if (error?.code === "23514") return "One of the values is outside the permitted format or range. Please check the form."
  if (error?.code === "PGRST202" || error?.code === "42P01") return "The database schema is not ready. Apply the migrations in supabase/migrations to this project."
  if (error?.message === "Failed to fetch" || error?.message?.includes("fetch failed")) return "The database could not be reached. Check your connection and project configuration."
  return error?.message || "The request could not be completed. Please try again."
}
export async function callRpc(name, args = {}, signal) {
  if (!supabase) throw new Error(setupError)
  let request = supabase.rpc(name, args)
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw Object.assign(new Error(readableError(error)), { code: error.code })
  return data
}
export async function assetRequest(body, token, signal) {
  if (!supabase) throw new Error(setupError)
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/asset-gateway`, {
    method: "POST", signal, headers: { apikey: supabaseKey, Authorization: `Bearer ${token || supabaseKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || "Image service is unavailable. Check that the Edge Functions are running.")
  }
  return body.action === "read" ? response.blob() : response.json()
}
