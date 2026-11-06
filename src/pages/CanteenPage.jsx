import { Link, useSearchParams } from "react-router-dom"
import { ArrowDownUp, Coffee } from "lucide-react"
import CafeMenu from "../components/canteen/CafeMenu"
import CanteenComparisons from "../components/canteen/CanteenComparisons"

export default function CanteenPage() {
  const [params] = useSearchParams()
  const compare = params.get("view") === "compare"
  return <div className="page-wrap canteen-page">
    <header className="cafe-page-heading"><div><p className="eyebrow">Between lectures</p><h1 className="serif-title">A good break starts here.</h1><p className="section-description">Explore your campus cafés. Find your next coffee, quick bite, or lunch break.</p></div><span className="cafe-heading-icon" aria-hidden="true"><Coffee size={30} /></span></header>
    <nav className="canteen-view-switch" aria-label="Canteen views">
      <Link to="/canteen-prices" aria-current={!compare ? "page" : undefined}><Coffee size={16} aria-hidden="true" />Café menus</Link>
      <Link to="/canteen-prices?view=compare" aria-current={compare ? "page" : undefined}><ArrowDownUp size={16} aria-hidden="true" />Compare prices</Link>
    </nav>
    {compare ? <CanteenComparisons /> : <CafeMenu />}
  </div>
}
