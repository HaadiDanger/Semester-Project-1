import { useState } from "react"
import useAssetUrl from "../hooks/useAssetUrl"
export default function Avatar({ name, image, assetId, size = "md" }) {
  const [failedImage, setFailedImage] = useState(null)
  const { url } = useAssetUrl(assetId)
  const source = url || image
  const initials = (name || "IUST").split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase()
  if (!source || failedImage === source) return <div className={`avatar avatar-${size}`} role="img" aria-label={`${name || "Profile"} initials`}>{initials}</div>
  return <img className={`avatar avatar-${size}`} src={source} alt={name} loading="lazy" onError={() => setFailedImage(source)} />
}
