import { useSearchParams } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowDownUp, Utensils } from "lucide-react"
import { useApp } from "../../context/app"
import { useDebounced, useRpc } from "../../hooks/useRpc"
import { setupError } from "../../lib/supabase"
import { money, observedAt, portion, priceStatuses } from "../../utils/prices"
import SearchBar from "../SearchBar"
import Pagination from "../Pagination"
import { ErrorState, LoadingState, SetupNotice } from "../AsyncState"

const defaults = { query: "", category: "", canteen: "", budget: "", sort: "lowest", page: 1 }
export default function CanteenComparisons() {
  const { references, config } = useApp()
  const [params, setParams] = useSearchParams()
  const filters = { ...defaults, ...Object.fromEntries([...params].filter(([key]) => Object.hasOwn(defaults, key))) }
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page, 10) || 1))
  const query = useDebounced(filters.query)
  const budget = useDebounced(filters.budget)
  const result = useRpc("get_canteen_prices", { p_filters: { ...filters, query, budget, page, page_size: 12 } })
  const items = result.data?.items || []
  const days = result.data?.stale_after_days || config.data?.stale_after_days || 30
  function change(next, keepPage = false) {
    const value = { ...filters, ...next, ...(!keepPage ? { page: 1 } : {}) }
    setParams({ ...Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "")), view: "compare" }, { replace: true })
  }
  const filtered = [filters.query, filters.category, filters.canteen, filters.budget].some(Boolean)
  return <section><div className="section-heading"><div><h2 className="serif-title text-3xl">Compare like for like.</h2><p className="section-description">Compare the same item, variant, and exact portion in INR.</p></div><Utensils className="muted" size={30} aria-hidden="true" /></div>
    <p className="draft-notice">Only current, available offerings checked within {days} days qualify. Comparisons use identical portions within your selected canteens, before applying a budget or page limit. Source evidence stays private to administrators.</p>
    {setupError ? <SetupNotice /> : <>
      <div className="canteen-tools mt-7"><SearchBar label="Search canteen items" value={filters.query} onChange={query => change({ query })} placeholder="Tea, fries, a food category…" />
        <div className="filter-grid canteen-filters">
          <label className="filter-label"><span>Category</span><select className="filter-select" value={filters.category} onChange={event => change({ category: event.target.value })}><option value="">All food categories</option>{references.data?.food_categories?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="filter-label"><span>Canteen</span><select className="filter-select" value={filters.canteen} onChange={event => change({ canteen: event.target.value })}><option value="">All canteens</option>{references.data?.canteens?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="filter-label"><span>Max INR</span><input className="filter-select" inputMode="decimal" placeholder="Any budget" maxLength={11} value={filters.budget} onChange={event => change({ budget: event.target.value })} /></label>
          <label className="filter-label"><span>Price order</span><select className="filter-select" value={filters.sort} onChange={event => change({ sort: event.target.value })}><option value="lowest">Lowest first</option><option value="highest">Highest first</option></select></label>
        </div>
      </div>
      {references.error && <p className="form-error text-sm mt-4" role="alert">{references.error} <button className="reset-link" onClick={references.refresh}>Retry filters</button></p>}
      <div className="results-meta"><span role="status" aria-live="polite">{result.loading ? "Checking current offerings…" : result.data ? `${result.data.total} ${result.data.total === 1 ? "offering" : "offerings"}` : ""}</span>{filtered && <button className="reset-link" onClick={() => setParams({ view: "compare" })}>Clear filters</button>}</div>
      {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : result.loading && !result.data ? <LoadingState label="Loading canteen comparisons…" /> : items.length ? <div className="canteen-grid" aria-busy={result.loading}>{items.map((item, index) => {
        const eligible = item.status === "eligible"
        const state = priceStatuses[item.status] || priceStatuses.unverified
        return <motion.article key={item.id} className={`price-card ${eligible ? "" : "price-card-excluded"}`} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .45, delay: Math.min(index * .035, .18), ease: [.22, 1, .36, 1] }}>
          <div className="price-card-top"><span className="eyebrow">{item.category}</span>{item.is_sample && <span className="sample-badge">Sample · not a real price</span>}</div>
          <h2 className="serif-title text-2xl mt-4">{item.name}</h2>{item.variant && <p className="muted text-sm mt-1">{item.variant}</p>}<p className="portion-label">{portion(item)}</p>
          <p className="text-sm mt-5">{item.canteen_name}</p><p className="price-amount">{eligible ? money(item.amount) : "Check needed"}</p>
          <p className={`status-badge ${eligible ? "status-good" : ""}`}>{eligible && item.is_sample ? "Simulated verification" : state.label}</p>
          <p className="muted text-xs leading-6 mt-3">{eligible ? `${item.is_sample ? "Sample observation" : "Verified as of"} ${observedAt(item.verified_at)}` : state.detail}</p>
          <div className="price-comparison"><ArrowDownUp size={15} aria-hidden="true" /><span>{eligible ? item.eligible_count > 1 ? item.is_cheapest ? `Lowest current price · ${item.eligible_count} comparable offerings` : `${money(item.difference)} above the lowest (${money(item.lowest_price)})` : "Only one qualifying offering in this comparison" : "Excluded from cheapest-price comparisons"}</span></div>
        </motion.article>
      })}</div> : <div className="empty-state"><h2 className="serif-title text-2xl">Nothing on this menu yet.</h2><p className="muted text-sm mt-3">{filtered ? "Try another category, canteen or budget. Only qualifying current prices can match a budget." : "Administrators can add genuine canteens, exact portions and source-checked prices. No real prices have been assumed."}</p></div>}
      {result.data && <Pagination page={page} total={result.data.total} pageSize={12} loading={result.loading} onChange={page => change({ page }, true)} />}
    </>}
  </section>
}
