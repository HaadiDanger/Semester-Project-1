import SearchBar from "../SearchBar"
import Pagination from "../Pagination"
import { ErrorState, LoadingState } from "../AsyncState"

export function AdminFilters({ query, onQueryChange, status, statuses, onStatusChange, onRefresh }) {
  return <div className="admin-filters">
    {onQueryChange && <SearchBar label="Search administration records" value={query} onChange={onQueryChange} placeholder="Search records…" />}
    {statuses && <label className="filter-label"><span>Status</span><select className="filter-select" value={status} onChange={event => onStatusChange(event.target.value)}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
    <button className="btn btn-secondary" onClick={onRefresh}>Refresh records</button>
  </div>
}
export function AdminResults({ result, page = 1, onPageChange, children, empty = "No records match these filters." }) {
  if (result.error) return <ErrorState message={result.error} onRetry={result.refresh} />
  if (result.loading && !result.data) return <LoadingState label="Loading administration records…" />
  return <><p className="muted text-xs mt-4 mb-4" role="status">{result.loading ? "Refreshing…" : `${result.data?.total || 0} records`}</p>
    {result.data?.items?.length ? <div aria-busy={result.loading}>{children}</div> : <p className="empty-state muted text-sm">{empty}</p>}
    {onPageChange && <Pagination page={page} total={result.data?.total || 0} pageSize={20} loading={result.loading} onChange={onPageChange} />}
  </>
}
export function MutationError({ mutation }) { return mutation.error ? <p className="form-error text-sm" role="alert">{mutation.error}</p> : null }
