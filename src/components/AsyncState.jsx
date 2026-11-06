import { Database, LoaderCircle } from "lucide-react"
import { setupError } from "../lib/supabase"

export function SetupNotice() {
  return <div className="empty-state setup-notice" role="status"><Database size={28} className="mx-auto mb-4" /><h2 className="serif-title text-2xl">Connect your campus database.</h2><p className="muted mt-3">{setupError}</p><p className="muted text-sm mt-3">Apply the migrations and follow <code>docs/setup.md</code>, then restart Vite. Your directory will load from Supabase.</p></div>
}
export function LoadingState({ label = "Loading…" }) {
  return <div className="loading-state" role="status"><LoaderCircle size={18} className="loading-spinner" /><span>{label}</span></div>
}
export function ErrorState({ message, onRetry }) {
  return <div className="empty-state" role="alert"><h2 className="serif-title text-2xl">We couldn’t load this yet.</h2><p className="muted mt-3 mb-5">{message}</p>{onRetry && <button className="btn btn-secondary" onClick={onRetry}>Try again</button>}</div>
}
