import { useState } from "react"
import { Camera, Utensils } from "lucide-react"

export function PhotoCredit({ photo }) {
  if (!photo) return null
  return <details className="menu-photo-credit"><summary><Camera size={12} aria-hidden="true" />Photo credit</summary><p><a href={photo.source_url} target="_blank" rel="noreferrer">{photo.author}</a> · <a href={photo.license_url} target="_blank" rel="noreferrer">{photo.license}</a>. Resized, WebP conversion; cropped to fit.</p></details>
}

export default function MenuPhoto({ photo, priority = false }) {
  const [failedPath, setFailedPath] = useState(null)
  if (!photo || !/^\/images\/menu\/[a-z0-9-]+\.webp$/.test(photo.path) || failedPath === photo.path) {
    return <div className="menu-photo-fallback"><Utensils size={30} aria-hidden="true" /><span>Photo unavailable</span></div>
  }
  return <img src={photo.path} alt={`${photo.alt} — illustrative photo`} width={photo.width} height={photo.height} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => setFailedPath(photo.path)} />
}
