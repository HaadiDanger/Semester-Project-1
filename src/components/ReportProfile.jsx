import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/auth"
import { useApp } from "../context/app"
import { useMutation } from "../hooks/useRpc"
import Field from "./Field"
import Modal from "./Modal"

export default function ReportProfile({ person }) {
  const { user } = useAuth()
  const { showToast } = useApp()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState("spam")
  const [description, setDescription] = useState("")
  const mutation = useMutation()
  if (person.isUser) return null
  if (!user) return <Link to={`/sign-in?next=/student/${person.id}`} className="text-link mt-6">Sign in to report a concern</Link>
  async function submit(event) {
    event.preventDefault()
    try {
      await mutation.run("report_profile", { p_profile_id: person.id, p_category: category, p_description: description })
      setOpen(false); setDescription(""); showToast("Your report was sent to the moderation queue.")
    } catch { /* The form displays the actual RPC error. */ }
  }
  return <><button className="text-link mt-6" onClick={() => { mutation.clearError(); setOpen(true) }}>Report a concern</button>{open && <Modal title="Report this profile" onClose={() => !mutation.busy && setOpen(false)}>
    <form className="space-y-5" onSubmit={submit}><p className="muted text-sm">Your report is private to the moderation team. Explain what needs their attention.</p>
      <Field label="Concern"><select className="field-input" value={category} onChange={event => setCategory(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="impersonation">Impersonation</option><option value="other">Other</option></select></Field>
      <Field label="Description"><textarea className="field-input" rows={4} required maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></Field>
      {mutation.error && <p className="form-error text-sm" role="alert">{mutation.error}</p>}<button className="btn btn-primary" disabled={mutation.busy}>Send report</button>
    </form></Modal>}</>
}
