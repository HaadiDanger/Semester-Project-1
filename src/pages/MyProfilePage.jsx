import { useNavigate } from "react-router-dom"
import { Info } from "lucide-react"
import ProfileForm from "../components/ProfileForm"
import { useApp } from "../context/AppContext"
import { emptyProfile, loadDraft, loadPublished } from "../utils/storage"
export default function MyProfilePage() {
  const { persistDraft, persistPublished, publishedProfile } = useApp()
  const navigate = useNavigate()
  const initialProfile = loadDraft() || loadPublished() || emptyProfile
  function handlePublish(profile) { if (persistPublished(profile)) navigate("/student/my-profile") }
  return <div className="page-wrap editor-page"><p className="eyebrow">Your place in the community</p><h1 className="serif-title text-4xl sm:text-5xl mt-3">A little about you.</h1><p className="muted mt-4 text-sm leading-7">Introduce yourself, share your skills, and show us what you’re making.</p><div className="draft-notice mt-6"><Info size={18} className="shrink-0 mt-1" /><p>This is a demo. Your profile stays in this browser. Publishing adds it to your local Discover directory; it does not share it with other devices.</p></div>{publishedProfile?.isPublished && <p className="eyebrow mt-5">Your profile is published in this browser</p>}<div className="mt-8"><ProfileForm initialProfile={initialProfile} onSaveDraft={persistDraft} onPublish={handlePublish} /></div></div>
}
