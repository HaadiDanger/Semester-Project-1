import { Link, useSearchParams } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowDownUp, ArrowLeftRight, Utensils } from "lucide-react"
import { useDebounced, useRpc } from "../../hooks/useRpc"
import { setupError } from "../../lib/supabase"
import { money, portion } from "../../utils/prices"
import SearchBar from "../SearchBar"
import Pagination from "../Pagination"
import { ErrorState, LoadingState, SetupNotice } from "../AsyncState"

const defaults = { query: "", category: "", canteen: "", compare_with: "", budget: "", sort: "lowest", page: 1 }
export default function CanteenComparisons() {
  const [params, setParams] = useSearchParams()
  const filters = { ...defaults, ...Object.fromEntries([...params].filter(([key]) => Object.hasOwn(defaults, key))) }
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page, 10) || 1))
  const query = useDebounced(filters.query)
  const budget = useDebounced(filters.budget)
  const result = useRpc("get_canteen_menu_comparisons", { p_filters: { ...filters, query, budget, page, page_size: 12 } })
  const items = result.data?.items || [], cafes = result.data?.canteens || [], categories = result.data?.categories || []
  const first = result.data?.first_canteen, second = result.data?.second_canteen
  const pending = result.loading || query !== filters.query || budget !== filters.budget
  function change(next, keepPage = false) {
    const value = { ...filters, ...next, ...(!keepPage ? { page: 1 } : {}) }
    setParams({ ...Object.fromEntries(Object.entries(value).filter(([key, item]) => item !== "" && String(item) !== String(defaults[key]))), view: "compare" }, { replace: true })
  }
  function clear() { change({ ...defaults, canteen: first?.id || filters.canteen, compare_with: second?.id || filters.compare_with }) }
  const filtered = [filters.query, filters.category, filters.budget].some(Boolean) || filters.sort !== defaults.sort
  if (setupError) return <SetupNotice />
  return <section aria-label="Compare café menus"><div className="section-heading"><div><h2 className="serif-title text-3xl">Compare café prices.</h2><p className="section-description">Choose two cafés to see matching menu items and their price differences.</p></div><Utensils className="muted" size={30} aria-hidden="true" /></div>
    <p className="comparison-note">Prices come from the published menus. Items are matched by name and size label; actual portions and availability may differ.</p>
    {cafes.length > 0 && <div className="comparison-cafe-picker">
      <label className="filter-label"><span>First café</span><select className="filter-select" value={filters.canteen || first?.id || ""} disabled={result.loading} onChange={event => change({ canteen: event.target.value, compare_with: event.target.value === second?.id ? first?.id || "" : second?.id || "", category: "" })}><option value="" disabled>Choose a café</option>{cafes.map(cafe => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}</select></label>
      <button className="icon-button comparison-swap" aria-label="Swap cafés" disabled={!first || !second || result.loading} onClick={() => change({ canteen: second.id, compare_with: first.id })}><ArrowLeftRight size={19} aria-hidden="true" /></button>
      <label className="filter-label"><span>Second café</span><select className="filter-select" value={filters.compare_with || second?.id || ""} disabled={result.loading || cafes.length < 2} onChange={event => change({ canteen: first?.id || "", compare_with: event.target.value, category: "" })}><option value="" disabled>Choose another café</option>{cafes.filter(cafe => cafe.id !== first?.id).map(cafe => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}</select></label>
    </div>}
      <div className="canteen-tools mt-7"><SearchBar label="Search canteen items" value={filters.query} onChange={query => change({ query })} placeholder="Tea, fries, a food category…" />
        <div className="filter-grid canteen-filters comparison-filters">
          <label className="filter-label"><span>Category</span><select className="filter-select" value={filters.category} onChange={event => change({ category: event.target.value })}><option value="">All food categories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="filter-label"><span>Max INR</span><input className="filter-select" inputMode="decimal" placeholder="Any budget" maxLength={11} value={filters.budget} onChange={event => change({ budget: event.target.value })} /></label>
          <label className="filter-label"><span>Price order</span><select className="filter-select" value={filters.sort} onChange={event => change({ sort: event.target.value })}><option value="lowest">Lowest first</option><option value="highest">Highest first</option><option value="difference">Largest difference</option></select></label>
        </div>
      </div>
      <p className="comparison-note mt-3">A budget matches items where at least one café is within your limit. Both prices stay visible.</p>
      <div className="results-meta"><span role="status" aria-live="polite">{pending ? "Finding matching menu items…" : result.data ? `${result.data.total} matching ${result.data.total === 1 ? "item" : "items"}` : ""}</span>{filtered && <button className="reset-link" onClick={clear}>Clear filters</button>}</div>
      {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : result.loading && !result.data ? <LoadingState label="Loading café comparisons…" /> : items.length ? <div className="canteen-grid comparison-grid" aria-busy={pending}>{items.map((item, index) => <motion.article key={item.id} className="price-card menu-comparison-card" aria-labelledby={`comparison-${item.id}`} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .45, delay: Math.min(index * .035, .18), ease: [.22, 1, .36, 1] }}>
        <span className="eyebrow">{item.category}</span><h3 id={`comparison-${item.id}`} className="serif-title text-2xl mt-4">{item.name}{item.variant && <> <span className="menu-card-variant">{item.variant}</span></>}</h3><p className="portion-label">{item.serving_quantity ? portion(item) : "Serving quantity not supplied"}</p>
        <div className="comparison-offers">{item.offers.map(offer => <div key={offer.id} className={`comparison-offer ${offer.is_lowest ? "is-lowest" : ""}`}>
          <h4>{offer.canteen_name}</h4><p className="price-amount">{money(offer.amount)}</p><span className={`status-badge ${offer.is_lowest ? "status-good" : ""}`}>{item.difference === 0 ? "Same price" : offer.is_lowest ? "Lower price" : `${money(offer.difference)} more`}</span>
          <Link className="comparison-menu-link" to={`/canteen-prices?${new URLSearchParams({ canteen: offer.canteen_id, query: item.name })}`} aria-label={`View ${offer.canteen_name} menu`}>View menu</Link>
        </div>)}</div>
        <div className="price-comparison"><ArrowDownUp size={15} aria-hidden="true" /><span>{item.difference === 0 ? "Same listed price at both cafés" : `Listed price difference: ${money(item.difference)}`}</span></div>
      </motion.article>)}</div> : <div className="empty-state"><h3 className="serif-title text-2xl">{cafes.length < 2 ? "A second café is needed." : !first || !second ? "Choose two available cafés." : filtered ? "No matches for these filters." : "No matching menu items yet."}</h3><p className="muted text-sm mt-3">{cafes.length < 2 ? "Comparisons appear when two cafés have published menus with matching items." : !first || !second ? "Choose cafés with published menus using the selectors above." : filtered ? "Try another item, category or budget." : "These cafés do not currently share a published item with the same name and size."}</p>{filtered && <button className="btn btn-secondary mt-5" onClick={clear}>Reset comparison filters</button>}</div>}
      {result.data && <Pagination page={page} total={result.data.total} pageSize={12} loading={result.loading} onChange={page => change({ page }, true)} />}
  </section>
}
