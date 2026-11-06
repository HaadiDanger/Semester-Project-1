import { Link, useLocation } from "react-router-dom"
import { useAuth } from "../context/auth"
import { LoadingState, SetupNotice } from "../components/AsyncState"
import { authLinkError, setupError } from "../lib/supabase"

export default function AuthCallbackPage() {
  const { loading, user, authError } = useAuth()
  const location = useLocation()
  const error = authLinkError(location) || authError
  return <div className="page-wrap auth-page">{setupError ? <SetupNotice /> : loading ? <LoadingState label="Completing your sign in…" /> : <>
    <h1 className="serif-title text-4xl">{error || !user ? "Let’s check that link." : "You’re signed in."}</h1>
    <p className="muted mt-5 mb-7">{error || (!user ? "The link did not establish a session. Try signing in, or request a fresh link in this browser." : "Your account is ready for you to prepare a profile. Publication and campus eligibility are reviewed separately.")}</p>
    <Link className="btn btn-primary" to={user && !error ? "/my-profile" : "/sign-in"}>{user && !error ? "Complete my profile" : "Go to sign in"}</Link>
  </>}</div>
}
