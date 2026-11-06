import { useEffect, useState } from "react"
import { useAuth } from "../context/auth"
import { assetRequest } from "../lib/supabase"

export default function useAssetUrl(assetId) {
  const { session, epoch } = useAuth()
  const token = session?.access_token
  const key = `${assetId || ""}:${token || "anonymous"}:${epoch}`
  const [state, setState] = useState({ key: null, url: null, error: null })
  useEffect(() => {
    if (!assetId) return
    const controller = new AbortController()
    let url
    assetRequest({ action: "read", asset_id: assetId }, token, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(blob); setState({ key, url, error: null })
    }).catch(error => { if (!controller.signal.aborted) setState({ key, url: null, error: error.message }) })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [assetId, token, key])
  return state.key === key ? state : { url: null, error: null }
}
