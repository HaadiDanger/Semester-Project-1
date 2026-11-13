import { lazy, Suspense, useState } from "react"

const PerformancePanel = lazy(() => import("./PhonePerformancePanel"))
export default function PhonePreviewTools() {
  const [meter, setMeter] = useState(() => new URLSearchParams(window.location.search).get("perf") === "1")
  return <><div className="phone-preview-banner"><span>Local phone preview · public browsing only</span><button type="button" onClick={() => setMeter(value => !value)} aria-expanded={meter}>{meter ? "Hide" : "Show"} performance meter</button></div>{meter && <Suspense fallback={null}><PerformancePanel onClose={() => setMeter(false)} /></Suspense>}</>
}
