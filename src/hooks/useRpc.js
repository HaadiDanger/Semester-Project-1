import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "../context/auth"
import { callRpc, readableError, setupError, supabase } from "../lib/supabase"

export function useRpc(name, args = {}, { enabled = true } = {}) {
  const { session, epoch } = useAuth()
  const scope = session?.access_token || "anonymous"
  const serialized = JSON.stringify(args)
  const [revision, setRevision] = useState(0)
  const key = `${name}:${serialized}:${revision}:${epoch}`
  const [state, setState] = useState({ key: null, scope: null, data: null, error: null, loading: true })
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!enabled || !supabase) return
    const controller = new AbortController()
    callRpc(name, JSON.parse(serialized), controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, scope, data, error: null, loading: false })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, scope, data: null, error: readableError(error), loading: false })
    })
    return () => controller.abort()
  }, [name, serialized, scope, key, enabled])
  const sameScope = scope === state.scope
  return { data: enabled && sameScope ? state.data : null,
    error: !supabase ? setupError : enabled && sameScope && state.key === key ? state.error : null,
    loading: Boolean(supabase && enabled && (state.key !== key || !sameScope || state.loading)), refresh }
}
export function useMutation() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(null)
  const inFlight = useRef(false)
  async function run(name, args) {
    if (inFlight.current) throw new Error("A request is already in progress")
    const signature = JSON.stringify([name, args])
    if (pending.current?.signature !== signature) pending.current = { signature, token: crypto.randomUUID() }
    inFlight.current = true; setBusy(true); setError(null)
    try { const result = await callRpc(name, { ...args, p_request_id: pending.current.token }); pending.current = null; return result }
    catch (failure) { setError(readableError(failure)); throw failure }
    finally { inFlight.current = false; setBusy(false) }
  }
  return { run, busy, error, clearError: () => setError(null) }
}
export function useDebounced(value, delay = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => { const timeout = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timeout) }, [value, delay])
  return settled
}
