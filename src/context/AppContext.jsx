import { useCallback, useEffect, useRef, useState } from "react"
import { AppContext } from "./app"
import { useRpc } from "../hooks/useRpc"

export function AppProvider({ children }) {
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const references = useRpc("get_reference_data")
  const config = useRpc("get_app_config")
  const showToast = useCallback(message => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  return <AppContext.Provider value={{ toast, showToast, references, config }}>{children}</AppContext.Provider>
}
