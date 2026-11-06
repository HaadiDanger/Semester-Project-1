import { useState } from "react"
import { useAuth } from "../../context/auth"
import { useApp } from "../../context/app"
import { useMutation } from "../../hooks/useRpc"
import Field from "../Field"
import { ErrorState, LoadingState } from "../AsyncState"
import { MutationError } from "./AdminShared"

function SettingsForm({ settings, onSaved }) {
  const [days, setDays] = useState(settings.stale_after_days)
  const [instructions, setInstructions] = useState(settings.eligibility_instructions)
  const [reason, setReason] = useState("")
  const mutation = useMutation()
  async function submit(event) {
    event.preventDefault()
    try { await mutation.run("admin_update_settings", { p_stale_after_days: Number(days), p_eligibility_instructions: instructions, p_reason: reason }); setReason(""); onSaved() } catch { /* Inline error. */ }
  }
  return <form className="admin-settings space-y-5 mt-5" onSubmit={submit}><fieldset disabled={mutation.busy} className="space-y-5"><Field label="Price freshness window (days)" help="Applies to both source observation and availability checks; default 30 days."><input type="number" className="field-input" required min={1} max={90} value={days} onChange={event => setDays(event.target.value)} /></Field><Field label="Campus eligibility instructions" help="Publish the actual process approved by the platform owner. No university email rule or identity claim is assumed."><textarea className="field-input" required rows={6} maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)} /></Field><Field label="Change reason"><textarea className="field-input" required rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy}>Save settings</button></fieldset></form>
}
export default function SettingsPanel() {
  const { account } = useAuth()
  const { config, showToast } = useApp()
  if (config.error) return <ErrorState message={config.error} onRetry={config.refresh} />
  if (!config.data) return <LoadingState />
  return <section><h2 className="form-heading">Platform settings</h2><p className="muted text-sm mt-3">Environment: {config.data.environment} · Development fixtures: {config.data.samples_enabled ? "enabled" : "disabled"}</p>
    {account.is_sample ? <p className="draft-notice mt-5">Sample administrators cannot change instance-wide settings.</p> : <SettingsForm settings={config.data} onSaved={() => { config.refresh(); showToast("Platform settings saved.") }} />}
  </section>
}
