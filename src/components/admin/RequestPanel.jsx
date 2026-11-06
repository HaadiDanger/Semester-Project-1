import { useState } from "react"
import { Link } from "react-router-dom"
import { useApp } from "../../context/app"
import { useMutation } from "../../hooks/useRpc"
import useAdminList from "../../hooks/useAdminList"
import { observedAt } from "../../utils/prices"
import Field from "../Field"
import Modal from "../Modal"
import { AdminFilters, AdminResults, MutationError } from "./AdminShared"

function ResolveRequest({ item, kind, onClose, onSaved }) {
  const { references } = useApp()
  const [decision, setDecision] = useState(kind === "skill" ? "accepted" : "resolved")
  const [reason, setReason] = useState("")
  const [skill, setSkill] = useState("")
  const mutation = useMutation()
  async function submit(event) {
    event.preventDefault()
    try { await mutation.run("admin_resolve_request", { p_kind: kind, p_id: item.id, p_decision: decision, p_reason: reason, p_skill_id: kind === "skill" && decision !== "rejected" ? skill : null }); onSaved(); onClose() } catch { /* Inline error. */ }
  }
  return <Modal title={kind === "skill" ? `Review skill: ${item.proposed_name}` : "Resolve profile report"} onClose={() => !mutation.busy && onClose()}><form className="space-y-5" onSubmit={submit}>
    <p className="muted text-sm">{kind === "skill" ? "Select an existing skill, or add a new one in Reference data before accepting. The requester can see your decision and reason." : item.description}</p>
    {kind === "report" && <Link className="text-link" to={`/admin?section=profiles&status=all&query=${item.target_subject}`} onClick={onClose}>Review the reported account</Link>}
    <Field label="Resolution"><select className="field-input" value={decision} onChange={event => setDecision(event.target.value)}>{(kind === "skill" ? ["accepted", "merged", "rejected"] : ["resolved", "dismissed"]).map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
    {kind === "skill" && decision !== "rejected" && <Field label="Approved skill"><select className="field-input" required value={skill} onChange={event => setSkill(event.target.value)}><option value="">Select skill</option>{references.data?.skills?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
    <Field label="Resolution reason"><textarea className="field-input" required rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy}>Save resolution</button>
  </form></Modal>
}
export default function RequestPanel({ kind }) {
  const section = kind === "skill" ? "skill_requests" : "reports"
  const list = useAdminList(section, kind === "skill" ? "pending" : "open")
  const [selected, setSelected] = useState(null)
  const { showToast } = useApp()
  const statuses = kind === "skill" ? ["all", "pending", "accepted", "merged", "rejected"] : ["all", "open", "resolved", "dismissed"]
  return <section><h2 className="form-heading">{kind === "skill" ? "Skill suggestions" : "Moderation reports"}</h2><p className="muted text-sm mt-2 mb-5">{kind === "skill" ? "Expand the directory’s skills thoughtfully, and merge duplicates into existing choices." : "Investigate concerns, review the account when needed, and record a private resolution. Reporter identity is not exposed in this queue."}</p>
    <AdminFilters status={list.status} statuses={statuses.map(value => ({ value, label: value }))} onStatusChange={list.setStatus} onRefresh={list.result.refresh} />
    <AdminResults result={list.result} page={list.page} onPageChange={list.setPage}><div className="admin-records">{list.result.data?.items.map(item => <article key={item.id} className="admin-record"><div><h3 className="font-medium">{kind === "skill" ? item.proposed_name : item.category}</h3><p className="muted text-xs mt-2">{item.status} · {observedAt(item.created_at)}</p>{item.description && <p className="muted text-sm mt-3">{item.description}</p>}{(item.resolution_reason || item.resolution_summary) && <p className="muted text-sm mt-3">{item.resolution_reason || item.resolution_summary}</p>}</div>{["pending", "open"].includes(item.status) && <button className="btn btn-secondary" onClick={() => setSelected(item)}>Review</button>}</article>)}</div></AdminResults>
    {selected && <ResolveRequest item={selected} kind={kind} onClose={() => setSelected(null)} onSaved={() => { list.result.refresh(); showToast("Resolution recorded.") }} />}
  </section>
}
