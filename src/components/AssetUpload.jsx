import { useEffect, useRef, useState } from "react"
import { useAuth } from "../context/auth"
import { assetRequest, callRpc, readableError, supabase } from "../lib/supabase"
import AssetImage from "./AssetImage"

export default function AssetUpload({ purpose, assetId, onChange, onBusyChange, label = "Upload image", preview = true, disabled = false }) {
  const { session } = useAuth()
  const [stage, setStage] = useState(null)
  const [error, setError] = useState(null)
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError(null)
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPEG, PNG or WebP image up to 5 MiB."); return }
    controller.current = new AbortController()
    setStage("Uploading privately…"); onBusyChange?.(true)
    try {
      const reservation = await callRpc("reserve_asset", { p_purpose: purpose, p_request_id: crypto.randomUUID() }, controller.current.signal)
      const { error } = await supabase.storage.from(reservation.bucket).upload(reservation.path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      setStage("Validating and preparing image…")
      const result = await assetRequest({ action: "process", asset_id: reservation.id }, session?.access_token, controller.current.signal)
      if (result.state !== "ready") throw new Error("Image validation was not completed")
      onChange(result.id)
    } catch (failure) { if (!controller.current.signal.aborted) setError(readableError(failure)) }
    finally { setStage(null); onBusyChange?.(false) }
  }
  return <div className="asset-control">
    <div className="flex flex-wrap items-center gap-3"><label className={`upload-label inline-flex rounded-lg px-3.5 py-2 text-sm ${disabled || stage ? "disabled-control" : "cursor-pointer"}`}>
      {label}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={upload} disabled={disabled || Boolean(stage)} aria-label={label} /></label>
      {assetId && <button type="button" className="text-link" disabled={disabled || Boolean(stage)} onClick={() => onChange(null)}>Remove image</button>}
    </div>
    <p className="editor-help text-xs mt-2">JPEG, PNG or WebP · up to 5 MiB · 4096 px per side. Images are checked and metadata is removed before use.</p>
    {stage && <p className="text-sm muted mt-2" role="status">{stage}</p>}{error && <p role="alert" className="form-error text-sm mt-2">{error}</p>}
    {assetId && preview && <AssetImage assetId={assetId} alt="Your uploaded image preview" />}
  </div>
}
