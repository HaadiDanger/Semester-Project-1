import { useState } from "react"
import { useAuth } from "../../context/auth"
import { useApp } from "../../context/app"
import { useDebounced, useMutation, useRpc } from "../../hooks/useRpc"
import Field from "../Field"
import Modal from "../Modal"
import SearchBar from "../SearchBar"
import { ErrorState, LoadingState } from "../AsyncState"
import { MutationError } from "./AdminShared"

function ChangeRole({ record, onClose, onSaved }) {
  const [role, setRole] = useState("admin")
  const [reason, setReason] = useState("")
  const mutation = useMutation()
  const granted = record.roles.includes(role)
  async function submit(event) {
    event.preventDefault()
    try { await mutation.run("manage_role", { p_user_id: record.id, p_role: role, p_grant: !granted, p_reason: reason }); onSaved(); onClose() } catch { /* Inline error. */ }
  }
  return <Modal title="Manage account roles" onClose={() => !mutation.busy && onClose()}><form className="space-y-5" onSubmit={submit}><p className="muted text-sm">{record.email}</p><Field label="Role"><select className="field-input" value={role} onChange={event => setRole(event.target.value)}><option value="admin">Content administrator</option><option value="role_manager">Role manager</option></select></Field><p className="muted text-sm">{granted ? "This role is currently granted. This action will revoke it." : "This action will grant the selected role."} The last active administrator or role manager is protected.</p>
    <Field label="Reason"><textarea className="field-input" required rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy}>{granted ? "Revoke role" : "Grant role"}</button>
  </form></Modal>
}
export default function RolePanel() {
  const { user } = useAuth()
  const { showToast } = useApp()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const settled = useDebounced(query)
  const result = useRpc("get_role_directory", { p_query: settled })
  return <section><h2 className="form-heading">Roles & privileged access</h2><p className="muted text-sm mt-2 mb-5">Roles come from protected database grants. Role managers do not automatically become content administrators. You cannot change your own roles.</p>
    <div className="admin-filters"><SearchBar label="Search account emails" value={query} onChange={setQuery} placeholder="Find an account by email" /><button className="btn btn-secondary" onClick={result.refresh}>Refresh accounts</button></div>
    {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : result.loading && !result.data ? <LoadingState /> : <><p className="muted text-xs mt-4 mb-4">Showing up to 50 matching accounts. Refine the email search to find another account.</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">Email</th><th scope="col">Account state</th><th scope="col">Current roles</th><th scope="col">Manage</th></tr></thead><tbody>{result.data?.map(item => <tr key={item.id}><td>{item.email}</td><td>{item.account_status}</td><td>{item.roles.join(", ") || "Member"}</td><td>{item.id === user.id ? <span className="muted text-xs">Your account</span> : <button className="text-link" onClick={() => setSelected(item)}>Manage roles</button>}</td></tr>)}</tbody></table></div></>}
    {selected && <ChangeRole record={selected} onClose={() => setSelected(null)} onSaved={() => { result.refresh(); showToast("Role change recorded.") }} />}
  </section>
}
