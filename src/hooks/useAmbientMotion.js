import { useEffect, useRef, useState } from "react"

// Observe visibility, not scroll frames. No animation timer or polling loop.
export default function useAmbientMotion() {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(true)
  useEffect(() => {
    let inView = true
    const update = () => setPlaying(inView && document.visibilityState === "visible")
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update() })
    if (ref.current) observer.observe(ref.current)
    document.addEventListener("visibilitychange", update)
    update()
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update) }
  }, [])
  return { ref, playing }
}
