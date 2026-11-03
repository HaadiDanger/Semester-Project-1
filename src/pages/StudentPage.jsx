import { useParams, Link } from "react-router-dom"
import ProfileView from "../components/ProfileView"
import { useApp } from "../context/AppContext"
export default function StudentPage() {
  const { id } = useParams()
  const { profiles } = useApp()
  const person = profiles.find(item => item.id === id)
  if (!person) return <div className="page-wrap text-center py-24"><p className="eyebrow">A missing connection</p><h1 className="serif-title text-4xl mt-3">Profile not found.</h1><p className="muted mt-4 mb-7 text-sm">This profile may have been removed, or the link is incorrect.</p><Link to="/" className="btn btn-primary">Return home</Link></div>
  return <ProfileView person={person} />
}
