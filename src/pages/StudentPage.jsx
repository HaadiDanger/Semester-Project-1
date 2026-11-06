import { useParams, Link } from "react-router-dom"
import ProfileView from "../components/ProfileView"
import { useRpc } from "../hooks/useRpc"
import { setupError } from "../lib/supabase"
import { toPerson } from "../utils/profiles"
import { ErrorState, LoadingState, SetupNotice } from "../components/AsyncState"
export default function StudentPage() {
  const { id } = useParams()
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const result = useRpc("get_profile", { p_id: id }, { enabled: valid })
  if (setupError) return <div className="page-wrap"><SetupNotice /></div>
  if (result.loading) return <div className="page-wrap"><LoadingState label="Loading this profile…" /></div>
  if (result.error) return <div className="page-wrap"><ErrorState message={result.error} onRetry={result.refresh} /></div>
  const person = toPerson(result.data)
  if (!person) return <div className="page-wrap text-center py-24"><p className="eyebrow">A missing connection</p><h1 className="serif-title text-4xl mt-3">Profile not available.</h1><p className="muted mt-4 mb-7 text-sm">This profile may be private, awaiting review, removed, or the link may be incorrect.</p><Link to="/discover" className="btn btn-primary">Discover talent</Link></div>
  return <ProfileView person={person} />
}
