import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../context/auth"
import { useApp } from "../context/app"
import { authLinkError, authRedirect, readableError, setupError, supabase } from "../lib/supabase"
import Field from "../components/Field"
import { LoadingState, SetupNotice } from "../components/AsyncState"

const titles = { signin: "Welcome back.", signup: "Make yourself at home.", forgot: "Find your way back.", recovery: "A fresh start." }
export default function AuthPage({ mode = "signin" }) {
  const { user, loading } = useAuth()
  const { config, showToast } = useApp()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const awaitingSignup = mode === "signup" && needsConfirmation
  const emailSubmit = mode === "signup" || mode === "forgot"
  useEffect(() => {
    if (!retryAt) return
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= retryAt) setRetryAt(0) }, 1000)
    return () => clearInterval(timer)
  }, [retryAt])
  function pauseEmails() { const time = Date.now(); setNow(time); setRetryAt(time + 60000) }
  function handleFailure(failure) {
    setError(readableError(failure))
    if (failure.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(failure.code)) pauseEmails()
  }
  const next = params.get("next")
  const destination = next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/my-profile"
  async function submit(event) {
    event.preventDefault()
    if (awaitingSignup) { await resend(); return }
    if (busy || (emailSubmit && retrySeconds > 0)) return
    setError(null); setNotice(null)
    if ((mode === "signup" || mode === "recovery") && password !== confirmation) { setError("The passwords do not match."); return }
    setBusy(true)
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) { setNeedsConfirmation(error.code === "email_not_confirmed"); throw error }
        navigate(destination, { replace: true })
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect("/auth/callback") } })
        if (error) throw error
        if (data.session) navigate("/my-profile", { replace: true })
        else { setNotice("Check your email for a confirmation link, including your spam folder. Open it in this browser to complete your account."); setNeedsConfirmation(true); pauseEmails(); setPassword(""); setConfirmation("") }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect("/recover-account") })
        if (error) throw error
        setNotice("If an account matches that email, a recovery link will arrive shortly. Open it in this browser.")
        pauseEmails()
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        showToast("Your password has been updated.")
        navigate("/my-profile", { replace: true })
      }
    } catch (failure) { handleFailure(failure) }
    finally { setBusy(false) }
  }
  async function resend() {
    if (busy || retrySeconds > 0 || !needsConfirmation) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirect("/auth/callback") } })
      if (error) throw error
      setNotice("A new confirmation email was requested. Check your inbox and spam folder, then open the link in this browser.")
      pauseEmails()
    } catch (failure) { handleFailure(failure) }
    finally { setBusy(false) }
  }
  const linkError = authLinkError(location)
  return <div className="page-wrap auth-page"><p className="eyebrow">Your campus. Your skills. Your services.</p><h1 className="serif-title text-4xl sm:text-5xl mt-3">{titles[mode]}</h1>
    <p className="muted mt-4 text-sm leading-7">{mode === "signup" ? "Create an account, share your interests, and prepare a profile for review." : mode === "forgot" ? "We’ll send a link to help you reset your password." : mode === "recovery" ? "Choose a new password of at least 12 characters." : "Sign in to look after your profile and shared work."}</p>
    {setupError ? <SetupNotice /> : loading ? <LoadingState label="Checking your session…" /> : linkError ? <div className="draft-notice mt-6" role="alert">{linkError} <Link to="/forgot-password" className="text-link">Request another link</Link></div>
      : mode === "recovery" && !user ? <div className="draft-notice mt-6"><p>This recovery link did not establish a session. Open it in the browser where you requested it, or <Link to="/forgot-password" className="text-link">request a fresh link</Link>.</p></div>
      : user && (mode === "signin" || mode === "signup") ? <div className="glass-card rounded-2xl p-6 mt-7"><p className="muted mb-5">You’re signed in as {user.email}.</p><Link className="btn btn-primary" to={destination}>Go to my profile</Link></div>
      : <form onSubmit={submit} className="glass-card rounded-2xl p-6 sm:p-8 mt-7 space-y-5">
        {mode !== "recovery" && <Field label="Email address"><input className="field-input" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setNeedsConfirmation(false); setNotice(null); setError(null) }} required maxLength={254} disabled={busy} /></Field>}
        {mode !== "forgot" && !awaitingSignup && <Field label={mode === "recovery" ? "New password" : "Password"} help={mode !== "signin" ? "At least 12 characters." : undefined}><input className="field-input" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signin" ? 1 : 12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></Field>}
        {(mode === "signup" || mode === "recovery") && !awaitingSignup && <Field label="Confirm password"><input className="field-input" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required maxLength={128} disabled={busy} /></Field>}
        {mode === "signup" && <p className="text-xs muted leading-6">{config.data?.eligibility_instructions || "Registration does not verify IUST membership. Campus eligibility and profile publication are reviewed separately by an administrator."}</p>}
        {error && <p role="alert" className="form-error text-sm">{error}</p>}{notice && <p role="status" className="draft-notice">{notice}</p>}
        {!awaitingSignup && <button type="submit" className="btn btn-primary w-full" disabled={busy || (emailSubmit && retrySeconds > 0)}>{busy ? "Please wait…" : emailSubmit && retrySeconds > 0 ? `Try again in ${retrySeconds}s` : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send recovery link" : "Update password"}</button>}
        {needsConfirmation && <button type="button" className="btn btn-secondary w-full" disabled={busy || retrySeconds > 0} onClick={resend}>Resend confirmation email{retrySeconds > 0 ? ` (${retrySeconds}s)` : ""}</button>}
        {mode === "signin" && <div className="auth-links"><Link to="/forgot-password" className="text-link">Forgot password?</Link><Link to="/sign-up" className="text-link">Create an account</Link></div>}
        {mode !== "signin" && <Link to="/sign-in" className="text-link">Back to sign in</Link>}
      </form>}
  </div>
}
