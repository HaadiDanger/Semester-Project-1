import { useState } from "react"
import { useMutation, useRpc } from "../../hooks/useRpc"
import { money } from "../../utils/prices"
import Field from "../Field"
import { ErrorState, LoadingState } from "../AsyncState"
import { MutationError } from "./AdminShared"

function PublicationForm({ offeringId, currentPrice, data, disabled, onSaved, onBusyChange }) {
  const entry = data.entry
  const publishable = currentPrice?.event_kind === "set" && currentPrice.verifications[0]?.decision !== "revoked"
  const [form, setForm] = useState({ source_label: entry?.source_label || "", source_observed_on: entry?.source_observed_on || "", photo_key: entry?.photo_key || "", display_order: entry?.display_order ?? 0, is_published: Boolean(data.is_visible) })
  const mutation = useMutation()
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const [reason, setReason] = useState("")
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const photo = data.photos.find(row => row.key === form.photo_key)
  async function submit(event) {
    event.preventDefault(); onBusyChange(true)
    try {
      await mutation.run("admin_save_menu_entry", { p_offering_id: offeringId,
        p_price_record_id: form.is_published ? currentPrice?.id : entry?.price_record_id || currentPrice?.id,
        p_data: { ...form, display_order: Number(form.display_order) }, p_expected_version: entry?.version ?? null, p_reason: reason })
      setReason(""); onSaved()
    } catch { /* MutationError displays server validation and retry-safe conflicts. */ }
    finally { onBusyChange(false) }
  }
  if (!entry && currentPrice?.event_kind !== "set") return <p className="muted text-sm mt-3">Record a price before adding this item to the café menu.</p>
  return <form onSubmit={submit} className="mt-5"><fieldset className="space-y-5" disabled={mutation.busy || disabled}>
    <p className="text-sm">{data.is_visible ? "This item is on the public café menu." : "This item is currently hidden from the café menu."} {publishable && `Latest recorded price: ${money(currentPrice.amount)}.`}</p>
    {entry?.is_published && !data.is_visible && <p className="muted text-xs">The linked price may have changed, been withdrawn or revoked, or the catalogue entry may be retired. Review the current record before republishing.</p>}
    <Field label="Public source label" help="Describe the actual menu source. Do not include private contact details."><input className="field-input" required maxLength={240} value={form.source_label} onChange={event => change("source_label", event.target.value)} /></Field>
    <Field label="Menu photograph date (if known)" help="Leave blank if the photograph’s capture date was not supplied."><input type="date" className="field-input" max={today} value={form.source_observed_on} onChange={event => change("source_observed_on", event.target.value)} /></Field>
    <Field label="Illustrative food photograph"><select className="field-input" value={form.photo_key} onChange={event => change("photo_key", event.target.value)}><option value="">No photograph</option>{data.photos.map(photo => <option key={photo.key} value={photo.key}>{photo.key} · {photo.author}</option>)}</select></Field>
    {photo && <img className="menu-photo-preview" src={photo.path} alt={photo.alt} width={photo.width} height={photo.height} />}
    <Field label="Menu display order"><input type="number" className="field-input" min={0} max={1000} required value={form.display_order} onChange={event => change("display_order", event.target.value)} /></Field>
    <label className="checkbox-label"><input type="checkbox" checked={form.is_published} disabled={!publishable || disabled || mutation.busy} onChange={event => change("is_published", event.target.checked)} />Publish the current menu-board price</label>
    <Field label="Publication change reason"><textarea className="field-input" rows={2} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
    <MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy || disabled}>{mutation.busy ? "Saving listing…" : "Save menu listing"}</button>
  </fieldset></form>
}

export default function MenuPublication({ offeringId, currentPrice, disabled, onSaved, onBusyChange }) {
  const result = useRpc("admin_get_menu_entry", { p_offering_id: offeringId })
  return <section className="menu-publish-panel" aria-label="Café menu publication"><h3 className="form-heading">Café menu publication</h3><p className="muted text-xs mt-2">Publish the menu-board listing with its source and photograph. Exact-portion comparison verification is maintained separately above. A new price hides the old listing until republished.</p>
    {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : !result.data ? <LoadingState label="Loading menu publication…" /> : <PublicationForm key={`${result.data.entry?.version || 0}:${currentPrice?.id || "none"}`} offeringId={offeringId} currentPrice={currentPrice} data={result.data} disabled={disabled || result.loading} onBusyChange={onBusyChange} onSaved={() => { result.refresh(); onSaved() }} />}
    {result.data && <button className="reset-link text-xs mt-3" disabled={disabled || result.loading} onClick={result.refresh}>Reload menu listing</button>}
  </section>
}
