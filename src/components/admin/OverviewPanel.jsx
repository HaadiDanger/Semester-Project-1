import { Link } from "react-router-dom"
import { useRpc } from "../../hooks/useRpc"
import { ErrorState, LoadingState } from "../AsyncState"

const tiles = [
  ["registered_users", "Registered accounts", "profiles&status=all"], ["published_profiles", "Published profiles", "profiles&status=approved"],
  ["pending_profiles", "Awaiting review", "profiles&status=pending"], ["deletion_requests", "Deletion requests", "profiles&status=deletion"],
  ["active_canteens", "Active canteens", "references"], ["food_items", "Food items", "references"],
  ["prices_requiring_verification", "Prices needing attention", "prices"], ["open_reports", "Open reports", "reports"],
]
export default function OverviewPanel() {
  const result = useRpc("get_admin_snapshot")
  if (result.error) return <ErrorState message={result.error} onRetry={result.refresh} />
  if (!result.data) return <LoadingState label="Loading platform overview…" />
  return <section><div className="section-heading"><h2 className="form-heading">Platform overview</h2><button className="btn btn-secondary" onClick={result.refresh}>Refresh overview</button></div><div className="admin-stat-grid">{tiles.map(([key, label, section]) => <Link key={key} className="admin-stat" to={`/admin?section=${section}`}><span className="muted text-sm">{label}</span><strong>{result.data[key]}</strong></Link>)}</div><p className="muted text-sm mt-5">Counts include permitted development samples when that environment is explicitly enabled.</p></section>
}
