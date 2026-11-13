import { useRef, useState } from "react"
import { useInView } from "framer-motion"
import useAssetUrl from "../hooks/useAssetUrl"
export default function Avatar({ name, image, assetId, size = "md" }) {
  const [failedImage, setFailedImage] = useState(null)
  const ref = useRef(null)
  const nearViewport = useInView(ref, { once: true, margin: "200px", initial: !assetId })
  const { url } = useAssetUrl(assetId, { enabled: nearViewport })
  const source = url || image
  const initials = (name || "IUST").split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase()
  if (!source || failedImage === source) return <div ref={ref} className={`avatar avatar-${size}`} role="img" aria-label={`${name || "Profile"} initials`}>{initials}</div>
  return <img ref={ref} className={`avatar avatar-${size}`} src={source} alt={name} loading="lazy" decoding="async" onError={() => setFailedImage(source)} />
}
