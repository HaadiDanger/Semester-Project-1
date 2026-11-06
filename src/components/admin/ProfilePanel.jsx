import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../../context/auth"
import { useApp } from "../../context/app"
import { useMutation } from "../../hooks/useRpc"
import useAdminList from "../../hooks/useAdminList"
import { observedAt } from "../../utils/prices"
import Avatar from "../Avatar"
import PortfolioCard from "../PortfolioCard"
import Field from "../Field"
import Modal from "../Modal"
import { AdminFilters, AdminResults, MutationError } from "./AdminShared"

const statuses = ["all", "pending", "eligibility", "approved", "draft", "rejected", "suspended", "removed", "deletion"].map(value => ({ value, label: value === "all" ? "All accounts" : value === "eligibility" ? "Eligibility pending" : value === "deletion" ? "Deletion requested" : value[0].toUpperCase() + value.slice(1) }))
function ReviewProfile({ record, onClose, onSaved }) {
  const { user } = useAuth()
  const p = record.profile
  const [action, setAction] = useState("eligibility")
  const [eligibility, setEligibility] = useState(record.eligibility_status)
  const [rank, setRank] = useState(p?.featured_rank || "")
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const mutation = useMutation()
  const self = record.user_id === user.id
  async function submit(event) {
    event.preventDefault()
    const data = { reason, staff_note: note || null, ...(action === "eligibility" ? { eligibility_status: eligibility } : {}), ...(action === "feature" ? { featured_rank: rank ? Number(rank) : null } : {}) }
    try { await mutation.run("admin_moderate_profile", { p_user_id: record.user_id, p_action: action, p_expected_version: p?.write_version || record.account_version, p_data: data }); onSaved(); onClose() }
    catch { /* Keep the captured review version; a conflict requires reopening fresh data. */ }
  }
  return <Modal title={p?.display_name || "Review account"} onClose={() => !mutation.busy && onClose()}>
    <div className="admin-profile-intro"><Avatar name={p?.display_name || "Account"} assetId={record.is_sample ? null : p?.photo_asset_id} /><div><p>{record.email}</p><p className="muted text-xs mt-1">{record.account_status} · Eligibility {record.eligibility_status} · {p?.moderation_status || "No profile"}</p>{record.is_sample && <span className="sample-badge mt-2">Development sample</span>}</div></div>
    {record.eligibility_basis && <p className="muted text-sm mt-4">Eligibility basis: {record.eligibility_basis}</p>}
    {record.deletion_requested_at && <p className="draft-notice mt-4">Deletion requested {observedAt(record.deletion_requested_at)}. Completion deletes profile content and queues its media; the sign-in account remains separate.</p>}
    {p && <details className="review-content mt-5" open><summary>Submitted content · version {p.content_version}</summary><p className="muted text-sm mt-4">{p.programme?.name || "No programme"} · {p.member_type}{p.stage_number ? ` · ${p.programme?.stage_unit} ${p.stage_number}` : ""}</p><p className="mt-3 text-sm">{p.bio}</p><p className="muted text-sm mt-3">{p.about}</p>{p.services && <p className="muted text-sm mt-3">Services: {p.services}</p>}<p className="muted text-sm mt-3">Skills: {p.skills.map(item => item.name).join(", ") || "None"}</p><p className="muted text-xs mt-3">Discovery: {p.discovery_opt_in ? "Requested" : "Hidden"} · Audience: {p.visibility}</p>
      <div className="mt-4">{p.projects.map(project => <PortfolioCard key={project.id} project={project} />)}</div><Link className="text-link mt-4" to={`/student/${p.id}`} onClick={onClose}>Open profile preview</Link>
    </details>}
    {(record.staff_note || record.moderation_note) && <p className="staff-note mt-4">Previous staff note: {record.moderation_note || record.staff_note}</p>}
    {self ? <p className="draft-notice mt-5">Another administrator must review your account.</p> : <form className="space-y-5 mt-6" onSubmit={submit}><fieldset className="space-y-5" disabled={mutation.busy}>
      <Field label="Administrator action"><select className="field-input" value={action} onChange={event => { setAction(event.target.value); mutation.clearError() }}>
        <option value="eligibility">Update campus eligibility</option>
        {p?.moderation_status === "pending" && <><option value="approve">Approve current submission</option><option value="reject">Reject with feedback</option></>}
        {record.account_status === "active" && <option value="suspend">Suspend account</option>}
        {(record.account_status === "suspended" || p?.moderation_status === "removed") && <option value="restore">Restore to a hidden draft</option>}
        {p && p.moderation_status !== "removed" && <option value="remove">Remove profile from the platform</option>}
        {p?.moderation_status === "approved" && <option value="feature">Manage community spotlight</option>}
        {p && record.deletion_requested_at && <option value="delete">Complete requested profile deletion</option>}
      </select></Field>
      {action === "eligibility" && <Field label="Eligibility decision"><select className="field-input" value={eligibility} onChange={event => setEligibility(event.target.value)}><option value="pending">Pending</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option></select></Field>}
      {action === "feature" && <Field label="Spotlight position"><select className="field-input" value={rank} onChange={event => setRank(event.target.value)}><option value="">Remove from spotlight</option>{[1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>}
      <Field label="Reason / feedback" help="Account and content decisions are shown to the owner. Record the actual basis for eligibility; content approval does not establish campus identity."><textarea className="field-input" required rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <Field label="Private staff note (optional)"><textarea className="field-input" rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></Field>
      <MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy}>{mutation.busy ? "Saving decision…" : action === "delete" ? "Delete requested profile content" : "Record decision"}</button>
    </fieldset></form>}
  </Modal>
}
export default function ProfilePanel() {
  const list = useAdminList("profiles", "pending")
  const { showToast } = useApp()
  const [selected, setSelected] = useState(null)
  return <section><h2 className="form-heading">Accounts & profile moderation</h2><p className="muted text-sm mt-2 mb-5">Review eligibility, submissions, reports and deletion requests. Each decision is version-checked and audited.</p>
    <AdminFilters query={list.query} onQueryChange={list.setQuery} status={list.status} statuses={statuses} onStatusChange={list.setStatus} onRefresh={list.result.refresh} />
    <AdminResults result={list.result} page={list.page} onPageChange={list.setPage}><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">Account</th><th scope="col">Profile</th><th scope="col">Eligibility</th><th scope="col">Review</th></tr></thead><tbody>{list.result.data?.items.map(record => <tr key={record.user_id}><td><strong className="font-medium">{record.profile?.display_name || "Profile not created"}</strong><p className="muted text-xs mt-1">{record.email}</p>{record.is_sample && <span className="sample-badge mt-2">Sample</span>}</td><td>{record.account_status !== "active" ? record.account_status : record.profile?.moderation_status || "Not created"}{record.deletion_requested_at && <p className="form-error text-xs">Deletion requested</p>}</td><td>{record.eligibility_status}</td><td><button className="text-link" onClick={() => setSelected(record)}>Review account</button></td></tr>)}</tbody></table></div></AdminResults>
    {selected && <ReviewProfile record={selected} onClose={() => setSelected(null)} onSaved={() => { list.result.refresh(); showToast("Administrator decision recorded.") }} />}
  </section>
}
