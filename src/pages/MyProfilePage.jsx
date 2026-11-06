import { useState } from "react"
import { Link } from "react-router-dom"
import { Info } from "lucide-react"
import { useAuth } from "../context/auth"
import { useApp } from "../context/app"
import { useMutation, useRpc } from "../hooks/useRpc"
import ProfileForm from "../components/ProfileForm"
import Field from "../components/Field"
import Modal from "../components/Modal"
import { ErrorState, LoadingState } from "../components/AsyncState"

function SkillSuggestion({ references }) {
  const { showToast } = useApp()
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const mutation = useMutation()
  const requests = useRpc("get_my_skill_requests")
  async function submit(event) {
    event.preventDefault()
    try { await mutation.run("suggest_skill", { p_name: name, p_category_id: category || null }); setName(""); requests.refresh(); showToast("Skill suggestion sent for review.") }
    catch { /* Inline error below. */ }
  }
  return <section className="glass-card rounded-2xl p-5 sm:p-7 mt-8"><h2 className="form-heading">Suggest a skill</h2><form className="suggestion-form mt-5" onSubmit={submit}>
    <Field label="Suggested skill"><input className="field-input" required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></Field>
    <Field label="Suggested category"><select className="field-input" value={category} onChange={event => setCategory(event.target.value)}><option value="">Let a moderator choose</option>{references.skill_categories?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <button className="btn btn-secondary" disabled={mutation.busy}>Send suggestion</button></form>{mutation.error && <p role="alert" className="form-error text-sm mt-3">{mutation.error}</p>}
    {requests.data?.length > 0 && <ul className="muted text-sm mt-5 space-y-2">{requests.data.map(item => <li key={item.id}>{item.name} · {item.status}{item.reason ? ` · ${item.reason}` : ""}</li>)}</ul>}
  </section>
}
function UploadLibrary() {
  const assets = useRpc("get_my_assets")
  const mutation = useMutation()
  async function remove(id) { try { await mutation.run("delete_my_asset", { p_id: id }); assets.refresh() } catch { /* Inline error. */ } }
  const unused = assets.data?.filter(asset => !asset.is_attached) || []
  if (!unused.length && !assets.error) return null
  return <section className="glass-card rounded-2xl p-5 sm:p-7 mt-8"><h2 className="form-heading">Unused uploads</h2><p className="muted text-sm mt-2">Attached images follow the privacy settings of your profile. Unused uploads can be queued for removal here.</p>
    {assets.error && <p className="form-error text-sm mt-3">{assets.error}</p>}{mutation.error && <p role="alert" className="form-error text-sm mt-3">{mutation.error}</p>}
    <ul className="mt-4 space-y-3">{unused.map(asset => <li key={asset.id} className="upload-row"><span className="text-sm muted">{asset.purpose.replace("_", " ")} · {asset.state.replace("_", " ")} · {new Date(asset.created_at).toLocaleDateString()}</span><button className="text-link" disabled={mutation.busy || asset.state === "processing" || asset.state === "delete_pending"} onClick={() => remove(asset.id)}>Delete unused upload</button></li>)}</ul>
  </section>
}
export default function MyProfilePage() {
  const { user, account, invalidate } = useAuth()
  const { references, config, showToast } = useApp()
  const profile = useRpc("get_my_profile")
  const mutation = useMutation()
  const [deleting, setDeleting] = useState(false)
  const [operationError, setOperationError] = useState(null)
  async function save(value, submit = false) {
    setOperationError(null)
    let saved = false
    try {
      const result = await mutation.run("save_my_profile", { p_profile: value, p_expected_version: profile.data?.write_version || 0 })
      saved = true
      if (submit) await mutation.run("profile_action", { p_action: "submit", p_expected_version: result.write_version })
      showToast(submit ? "Profile submitted for review." : "Draft saved in Supabase.")
      invalidate()
    } catch (error) { setOperationError(`${saved ? "Your draft was saved, but submission failed. " : ""}${error.message}`); if (saved) profile.refresh() }
  }
  async function act(action) {
    setOperationError(null)
    try {
      await mutation.run("profile_action", { p_action: action, p_expected_version: profile.data.write_version })
      setDeleting(false); invalidate()
      showToast(action === "request_deletion" ? "Your profile is hidden and the deletion request is awaiting an administrator." : action === "unpublish" ? "Your profile is hidden from discovery." : action === "publish" ? "Your approved profile is published." : "Deletion request cancelled; your profile remains hidden.")
    } catch (error) { setOperationError(error.message) }
  }
  if (profile.loading && !profile.data || references.loading && !references.data) return <div className="page-wrap"><LoadingState label="Loading your saved profile…" /></div>
  if (profile.error || references.error) return <div className="page-wrap"><ErrorState message={profile.error || references.error} onRetry={() => { profile.refresh(); references.refresh() }} /></div>
  const data = profile.data
  const locked = data?.moderation_status === "pending" || data?.moderation_status === "removed" || account.account_status !== "active" || Boolean(data?.deletion_requested_at)
  return <div className="page-wrap editor-page"><p className="eyebrow">Your place in the community</p><h1 className="serif-title text-4xl sm:text-5xl mt-3">A little about you.</h1><p className="muted mt-4 text-sm leading-7">Introduce yourself, share your skills, and show us what you’re making.</p>
    <div className="draft-notice mt-6"><Info size={18} className="shrink-0 mt-1" /><div><p>{config.data?.eligibility_instructions || "Campus eligibility and profile publication are reviewed separately."}</p><p className="mt-1">Account eligibility: <strong>{account.eligibility_status}</strong> · Profile: <strong>{data?.status || "Not created"}</strong>{data?.discovery_opt_in ? " · Discovery requested" : " · Hidden from discovery"}</p>{account.is_sample && <p className="mt-1">Development sample — not a verified IUST identity.</p>}{data?.owner_reason && <p className="mt-2">Review feedback: {data.owner_reason}</p>}{account.owner_reason && <p className="mt-2">Account note: {account.owner_reason}</p>}</div></div>
    {!references.data?.programmes?.some(item => account.is_sample || !item.is_sample) && <p className="muted text-sm mt-4">Academic choices are not configured yet. You can save your draft, photo and portfolio while an administrator adds genuine programmes and skills.</p>}
    {data?.moderation_status === "approved" && <p className="muted text-sm mt-4">Saving content changes returns your profile to a hidden draft until it is reviewed again.</p>}
    {operationError && <div className="draft-notice mt-5" role="alert"><p className="form-error">{operationError} <button className="reset-link" onClick={() => { setOperationError(null); profile.refresh() }}>Reload stored profile</button></p></div>}
    {data && <div className="profile-controls mt-5"><Link to={`/student/${data.id}`} className="btn btn-secondary">Preview saved profile</Link>
      {(data.discovery_opt_in || data.moderation_status === "pending") && <button className="btn btn-secondary" disabled={mutation.busy} onClick={() => act("unpublish")}>{data.moderation_status === "pending" ? "Withdraw submission to edit" : "Unpublish"}</button>}
      {data.moderation_status === "approved" && !data.discovery_opt_in && !locked && <button className="btn btn-primary" disabled={mutation.busy} onClick={() => act("publish")}>Publish approved profile</button>}
      {data.deletion_requested_at ? <button className="btn btn-secondary" disabled={mutation.busy} onClick={() => act("cancel_deletion")}>Cancel deletion request</button> : <button className="text-link danger-link" disabled={mutation.busy} onClick={() => setDeleting(true)}>Request profile deletion</button>}
    </div>}
    <ProfileForm key={`${user.id}:${data?.write_version || 0}`} initialProfile={data} references={references.data || {}} isSample={account.is_sample} locked={locked} busy={mutation.busy}
      onSaveDraft={value => save(value)} onSubmit={value => save(value, true)} />
    {account.account_status === "active" && <SkillSuggestion references={references.data || {}} />}<UploadLibrary />
    {deleting && <Modal title="Request profile deletion?" onClose={() => !mutation.busy && setDeleting(false)}><p className="muted text-sm leading-7 mb-5">Your profile will be hidden immediately. An administrator will remove its personal content and queue profile uploads for deletion. Your sign-in account is separate. You can cancel while the request is pending.</p><button className="btn btn-primary" disabled={mutation.busy} onClick={() => act("request_deletion")}>Hide profile & request deletion</button>{operationError && <p className="form-error mt-4" role="alert">{operationError}</p>}</Modal>}
  </div>
}
