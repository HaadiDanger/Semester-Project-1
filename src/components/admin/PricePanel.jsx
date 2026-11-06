import { useState } from "react"
import { Link } from "react-router-dom"
import { useApp } from "../../context/app"
import { useMutation, useRpc } from "../../hooks/useRpc"
import useAdminList from "../../hooks/useAdminList"
import { money, observedAt, portion, priceStatuses } from "../../utils/prices"
import Field from "../Field"
import Modal from "../Modal"
import AssetImage from "../AssetImage"
import AssetUpload from "../AssetUpload"
import Pagination from "../Pagination"
import { ErrorState, LoadingState } from "../AsyncState"
import { AdminFilters, AdminResults, MutationError } from "./AdminShared"
import MenuPublication from "./MenuPublication"

function Verification({ verification }) {
  const [showEvidence, setShowEvidence] = useState(false)
  return <div className="verification-record"><p className="text-sm">{verification.decision} · {observedAt(verification.recorded_at)}</p><p className="muted text-xs mt-1">{verification.source_method ? `${verification.source_method.replaceAll("_", " ")} · Observed ${observedAt(verification.observed_at)}` : "Revocation"}</p><p className="muted text-sm mt-2">{verification.reason}</p>
    {verification.evidence_asset_id && <><button className="text-link mt-2" onClick={() => setShowEvidence(value => !value)}>{showEvidence ? "Hide evidence" : "View private evidence"}</button>{showEvidence && <AssetImage assetId={verification.evidence_asset_id} alt="Private price-verification evidence" />}</>}
  </div>
}
function PriceHistoryEditor({ offering, onClose, onSaved }) {
  const [page, setPage] = useState(1)
  const history = useRpc("admin_price_history", { p_offering_id: offering.offering_id, p_page: page })
  const assets = useRpc("get_my_assets")
  const mutation = useMutation()
  const [action, setAction] = useState("set")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [correction, setCorrection] = useState(false)
  const [observed, setObserved] = useState("")
  const [method, setMethod] = useState(offering.is_sample ? "simulated" : "")
  const [evidence, setEvidence] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [formError, setFormError] = useState(null)
  const latest = page === 1 ? history.data?.items?.[0] : null
  const latestVerification = latest?.verifications?.[0]
  async function submit(event) {
    event.preventDefault(); setFormError(null)
    if (page !== 1 || history.loading) return
    if (action === "verified" && (!evidence || !observed || !method)) { setFormError("Add evidence, a source method and the actual observation time."); return }
    try {
      if (action === "set" || action === "withdraw") {
        await mutation.run("admin_record_price", { p_offering_id: offering.offering_id, p_event_kind: action, p_amount: action === "set" ? amount : null,
          p_expected_price_id: latest?.id || null, p_corrects_price_id: correction ? latest?.id || null : null, p_reason: reason })
      } else {
        await mutation.run("admin_verify_price", { p_price_id: latest?.id, p_decision: action, p_observed_at: action === "verified" ? new Date(observed).toISOString() : null,
          p_source_method: action === "verified" ? method : null, p_evidence_asset_id: action === "verified" ? evidence : null, p_expected_verification_id: latestVerification?.id || null, p_reason: reason })
      }
      history.refresh(); assets.refresh(); setReason(""); setAmount(""); setCorrection(false); onSaved("Immutable price history updated.")
    } catch (error) { if (!error.code) setFormError(error.message) }
  }
  return <Modal title={`${offering.canteen_name} · ${offering.item_name}`} onClose={() => !mutation.busy && !uploading && !publishing && onClose()}>
    <p className="muted text-sm">{offering.variant} · {portion(offering)}</p>{offering.is_sample && <p className="sample-badge mt-3">Development example · simulated prices and checks</p>}
    <p className="muted text-xs mt-3">History is append-only. Each new price needs its own verification. A withdrawal or revocation never restores an earlier price.</p>
    {history.error ? <ErrorState message={history.error} onRetry={history.refresh} /> : history.loading && !history.data ? <LoadingState /> : <>
      {page === 1 && <form className="space-y-5 mt-6" onSubmit={submit}><fieldset className="space-y-5" disabled={mutation.busy || history.loading || publishing}>
        <Field label="Price action"><select className="field-input" value={action} onChange={event => { setAction(event.target.value); mutation.clearError(); setFormError(null) }}><option value="set">Record a new price</option>{latest?.event_kind === "set" && <><option value="verified">Verify current price ({money(latest.amount)})</option><option value="revoked">Revoke current verification</option><option value="withdraw">Withdraw current price</option></>}</select></Field>
        {action === "set" && <><Field label="INR amount" help="Zero is a valid price. Use at most two decimal places."><input className="field-input" inputMode="decimal" required pattern="[0-9]{1,8}(\.[0-9]{1,2})?" maxLength={11} value={amount} onChange={event => setAmount(event.target.value)} /></Field>{latest && <label className="checkbox-label"><input type="checkbox" checked={correction} onChange={event => setCorrection(event.target.checked)} />This corrects the current price record</label>}</>}
        {action === "verified" && <>
          <Field label="Actual observation date and time" help="Enter your local time; the saved record uses an absolute timestamp."><input className="field-input" type="datetime-local" required value={observed} onChange={event => setObserved(event.target.value)} /></Field>
          <Field label="Source method"><select className="field-input" required value={method} onChange={event => setMethod(event.target.value)}><option value="">Select source</option>{offering.is_sample ? <option value="simulated">Simulated development check</option> : <><option value="displayed_menu">Displayed menu</option><option value="supplier_confirmation">Canteen / supplier confirmation</option></>}</select></Field>
          <AssetUpload purpose="price_evidence" label="Upload private evidence" assetId={evidence} onChange={setEvidence} onBusyChange={setUploading} disabled={mutation.busy} />
          <Field label="Or use your existing evidence"><select className="field-input" value={evidence || ""} onChange={event => setEvidence(event.target.value || null)}><option value="">Choose an evidence upload</option>{evidence && !assets.data?.some(asset => asset.id === evidence) && <option value={evidence}>Newly uploaded evidence</option>}{assets.data?.filter(asset => asset.purpose === "price_evidence" && asset.state === "ready").map(asset => <option key={asset.id} value={asset.id}>{observedAt(asset.created_at)} · {asset.id.slice(0, 8)}</option>)}</select></Field>
        </>}
        <Field label="Source details / reason"><textarea className="field-input" rows={3} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
        <MutationError mutation={mutation} />{formError && <p className="form-error text-sm" role="alert">{formError}</p>}
        <button className="btn btn-primary" disabled={mutation.busy || uploading}>{mutation.busy ? "Recording…" : uploading ? "Preparing evidence…" : "Append history event"}</button>
      </fieldset></form>}
      {page === 1 && !offering.is_sample && <MenuPublication key={`${latest?.id || "none"}:${latestVerification?.id || "none"}`} offeringId={offering.offering_id} currentPrice={latest} disabled={history.loading || mutation.busy || uploading || publishing} onBusyChange={setPublishing} onSaved={() => onSaved("Café menu listing updated.")} />}
      <h3 className="form-heading mt-8">Price history</h3><p className="muted text-xs mt-2">Newest event first. Availability is maintained in <Link className="text-link" to="/admin?section=references" onClick={onClose}>reference data</Link>.</p>
      <div className="mt-4 space-y-4">{history.data?.items.map(record => <article className="history-record" key={record.id}><h4 className="font-medium">{record.event_kind === "set" ? money(record.amount) : "Price withdrawn"}</h4><p className="muted text-xs mt-1">Recorded {observedAt(record.recorded_at)} · {record.id.slice(0, 8)}</p>{record.recorded_by_operator && <p className="muted text-xs mt-1">Imported by {record.recorded_by_operator}</p>}<p className="muted text-sm mt-3">{record.source_note}</p>{record.corrects_price_id && <p className="muted text-xs mt-2">Corrects record {record.corrects_price_id.slice(0, 8)}</p>}{record.verifications.length ? record.verifications.map(verification => <Verification key={verification.id} verification={verification} />) : record.event_kind === "set" && <p className="muted text-xs mt-3">No verification recorded for this price.</p>}</article>)}{!history.data?.items.length && <p className="muted text-sm">No prices recorded yet.</p>}</div>
      <Pagination page={page} total={history.data?.total || 0} pageSize={20} loading={history.loading || mutation.busy || publishing} onChange={setPage} />
    </>}
  </Modal>
}
export default function PricePanel() {
  const list = useAdminList("prices")
  const [selected, setSelected] = useState(null)
  const { showToast } = useApp()
  return <section><h2 className="form-heading">Prices, menus & history</h2><p className="muted text-sm mt-2 mb-5">Record INR prices, publish café menu listings, verify sources, and review immutable history.</p>
    <AdminFilters query={list.query} onQueryChange={list.setQuery} status={list.status} onStatusChange={list.setStatus} statuses={[{ value: "all", label: "All price states" }, ...Object.entries(priceStatuses).map(([value, status]) => ({ value, label: status.label }))]} onRefresh={list.result.refresh} />
    <AdminResults result={list.result} page={list.page} onPageChange={list.setPage} empty="No offerings yet. Add canteens, exact menu items, and offerings in Reference data."><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">Offering</th><th scope="col">Latest recorded amount</th><th scope="col">Comparison state</th><th scope="col">History</th></tr></thead><tbody>{list.result.data?.items.map(row => <tr key={row.offering_id}><td>{row.item_name}<p className="muted text-xs mt-1">{row.variant} · {portion(row)}</p><p className="muted text-xs mt-1">{row.canteen_name}</p>{row.is_sample && <span className="sample-badge mt-2">Sample</span>}</td><td>{money(row.amount)}<p className="muted text-xs mt-1">{row.verified_at ? observedAt(row.verified_at) : "No current verification"}</p></td><td>{priceStatuses[row.status]?.label || row.status}</td><td><button className="text-link" onClick={() => setSelected(row)}>Manage price</button></td></tr>)}</tbody></table></div></AdminResults>
    {selected && <PriceHistoryEditor offering={selected} onClose={() => setSelected(null)} onSaved={message => { list.result.refresh(); showToast(message) }} />}
  </section>
}
