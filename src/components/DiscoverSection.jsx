import { useSearchParams } from "react-router-dom"
import { useApp } from "../context/app"
import { useDebounced, useRpc } from "../hooks/useRpc"
import { setupError } from "../lib/supabase"
import { toPerson } from "../utils/profiles"
import FilterBar from "./FilterBar"
import SearchBar from "./SearchBar"
import ProfileCard from "./ProfileCard"
import Pagination from "./Pagination"
import { ErrorState, LoadingState, SetupNotice } from "./AsyncState"

const empty = { query: "", category: "", skill: "", department: "", programme: "", member_type: "", stage: "", page: 1 }
export default function DiscoverSection({ filters: sharedFilters, onFiltersChange, standalone = false }) {
  const { references, config } = useApp()
  const [params, setParams] = useSearchParams()
  const filters = standalone ? { ...empty, ...Object.fromEntries([...params].filter(([key]) => Object.hasOwn(empty, key))) } : { ...empty, ...sharedFilters }
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page, 10) || 1))
  const settledQuery = useDebounced(filters.query)
  const results = useRpc("discover_profiles", { p_filters: { ...filters, query: settledQuery, page, page_size: 12 } })
  function change(next, keepPage = false) {
    const value = { ...filters, ...next, ...(!keepPage ? { page: 1 } : {}) }
    if (standalone) setParams(Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "")), { replace: true })
    else onFiltersChange(value)
  }
  function clear() {
    if (standalone) setParams({})
    else onFiltersChange(empty)
  }
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "page" && Boolean(value))
  const items = results.data?.items || []
  const Heading = standalone ? "h1" : "h2"
  return <section id="discover" className="discover-section" aria-labelledby="discover-heading"><div className="container">
    <div className="section-heading"><div><p className="eyebrow">Find your next collaborator</p><Heading id="discover-heading" className="section-title serif-title">A skill. A spark. A connection.</Heading><p className="section-description">From football and handmade crafts to code and cooking. Explore what interests you.</p></div><span className="eyebrow">Campus directory</span></div>
    {setupError ? <SetupNotice /> : <>
      <div className="discover-tools"><SearchBar value={filters.query} onChange={query => change({ query })} placeholder="Search names, skills, or categories" /><FilterBar filters={filters} references={references.data} onChange={change} /></div>
      {references.error && <p className="form-error text-sm mt-4" role="alert">Filters: {references.error} <button className="reset-link" onClick={references.refresh}>Retry filters</button></p>}
      <div className="results-meta"><span role="status" aria-live="polite">{results.loading ? "Searching the directory…" : results.data ? `${results.data.total} ${results.data.total === 1 ? "profile" : "profiles"} to explore` : ""}</span>{hasFilters ? <button type="button" className="reset-link" onClick={clear}>Clear filters</button> : <span>{config.data?.samples_enabled ? "Development samples labelled" : "Approved, shared profiles"}</span>}</div>
      {results.error ? <ErrorState message={results.error} onRetry={results.refresh} /> : results.loading && !results.data ? <LoadingState label="Loading campus talents…" /> : items.length ? <div className="profile-grid" aria-busy={results.loading}>{items.map((profile, index) => <ProfileCard key={profile.id} person={toPerson(profile)} index={index} />)}</div>
        : <div className="empty-state"><h3 className="serif-title text-2xl">No matches just yet.</h3><p className="muted text-sm mt-3 mb-5">{hasFilters ? "Try a different search or give another skill a go." : "Approved profiles will appear here when people choose to share them."}</p>{hasFilters && <button type="button" className="btn btn-secondary" onClick={clear}>Clear filters</button>}</div>}
      {results.data && <Pagination page={page} total={results.data.total} pageSize={12} loading={results.loading} onChange={page => change({ page }, true)} />}
    </>}
  </div></section>
}
