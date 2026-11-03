import { useState } from "react"
export default function Avatar({ name, image, size = "md" }) {
  const [failedImage, setFailedImage] = useState(null)
  const initials = (name || "IUST").split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase()
  if (!image || failedImage === image) return <div className={`avatar avatar-${size}`} aria-label={name}>{initials}</div>
  return <img className={`avatar avatar-${size}`} src={image} alt={name} loading="lazy" onError={() => setFailedImage(image)} />
}
