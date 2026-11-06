import { useCallback, useEffect, useState } from "react"
import { AuthContext } from "./auth"
import { callRpc, readableError, supabase } from "../lib/supabase"

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState(null)
  const [accountState, setAccountState] = useState({ token: null, data: null, error: null })
  const [epoch, setEpoch] = useState(0)
  const [recovery, setRecovery] = useState(false)
  const invalidate = useCallback(() => setEpoch(value => value + 1), [])
  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession); setLoading(false); setAuthError(null)
      if (event === "PASSWORD_RECOVERY") setRecovery(true)
      if (event === "SIGNED_OUT") setRecovery(false)
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session); setAuthError(error ? readableError(error) : null); setLoading(false)
    }).catch(error => { if (active) { setAuthError(readableError(error)); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!session?.access_token) return
    const token = session.access_token
    const controller = new AbortController()
    callRpc("get_session_context", {}, controller.signal).then(data => {
      if (!controller.signal.aborted) setAccountState({ token, data, error: data ? null : "Your account controls are missing. Ask the project administrator to check the migrations." })
    }).catch(error => {
      if (!controller.signal.aborted) setAccountState({ token, data: null, error: readableError(error) })
    })
    return () => controller.abort()
  }, [session?.access_token, epoch])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") invalidate() }
    window.addEventListener("focus", invalidate); document.addEventListener("visibilitychange", onVisible)
    return () => { window.removeEventListener("focus", invalidate); document.removeEventListener("visibilitychange", onVisible) }
  }, [invalidate])
  const matched = session && accountState.token === session.access_token
  return <AuthContext.Provider value={{ session, user: session?.user || null, loading, authError,
    account: matched ? accountState.data : null, accountLoading: Boolean(session && !matched), accountError: matched ? accountState.error : null,
    recovery, epoch, invalidate }}>{children}</AuthContext.Provider>
}
