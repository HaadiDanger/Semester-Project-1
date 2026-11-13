import { useEffect, useState } from "react"

// Opt-in diagnostics only. Normal production/phone browsing has no rAF meter.
export default function PhonePerformancePanel({ onClose }) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    let id, start, last, frames = 0, gaps = 0
    const reset = () => { start = last = undefined; frames = gaps = 0 }
    const frame = now => {
      if (start === undefined) start = now
      if (last !== undefined && now - last > 50) gaps++
      last = now; frames++
      if (now - start >= 1000) {
        setStats({ fps: Math.round((frames - 1) * 1000 / (now - start)), gaps, heap: performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null })
        start = now; frames = 1; gaps = 0
      }
      id = requestAnimationFrame(frame)
    }
    const visibility = () => {
      cancelAnimationFrame(id); reset()
      if (document.visibilityState === "visible") id = requestAnimationFrame(frame)
    }
    visibility()
    document.addEventListener("visibilitychange", visibility)
    return () => { cancelAnimationFrame(id); document.removeEventListener("visibilitychange", visibility) }
  }, [])
  return <aside className="phone-performance-panel" aria-label="Phone performance meter">
    <div className="phone-performance-heading"><strong>On-device performance</strong><button type="button" onClick={onClose} aria-label="Close performance meter">×</button></div>
    <div className="phone-performance-values"><span><b>{stats?.fps ?? "—"}</b> rAF fps</span><span><b>{stats?.heap ?? "Unavailable"}</b>{stats?.heap ? " MB JS heap" : " memory"}</span></div>
    <p>Frame gaps &gt;50ms / second: {stats?.gaps ?? "—"}</p><small>FPS is an estimate. JS heap excludes images, GPU and total browser RAM; memory is unavailable in some browsers. Close this meter for a clean usage test.</small>
  </aside>
}
