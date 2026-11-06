import { Link, Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/auth"
import { setupError } from "../lib/supabase"
import { ErrorState, LoadingState, SetupNotice } from "./AsyncState"

export default function ProtectedRoute({ children, admin = false }) {
  const { user, account, loading, accountLoading, accountError, authError, invalidate } = useAuth()
  const location = useLocation()
  if (setupError) return <div className="page-wrap"><SetupNotice /></div>
  if (loading || (user && accountLoading)) return <div className="page-wrap"><LoadingState label="Checking your session…" /></div>
  if (authError || accountError) return <div className="page-wrap"><ErrorState message={authError || accountError} onRetry={invalidate} /></div>
  if (!user) return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (!account?.email_confirmed) return <div className="page-wrap"><h1 className="serif-title text-3xl">Confirm your email first.</h1><p className="muted mt-4">Open the confirmation link from your registration email, then return here.</p><button className="btn btn-secondary mt-5" onClick={invalidate}>I’ve confirmed my email</button></div>
  if (account.account_status === "closed") return <div className="page-wrap"><h1 className="serif-title text-3xl">This account is closed.</h1><p className="muted mt-4">{account.owner_reason || "Contact your platform administrator for account questions."}</p></div>
  if (admin && !account.is_admin && !account.is_role_manager) return <div className="page-wrap"><h1 className="serif-title text-3xl">Administrator access required.</h1><p className="muted mt-4 mb-6">Your account has not been granted this permission.</p><Link to="/discover" className="btn btn-secondary">Discover talent</Link></div>
  return children
}
