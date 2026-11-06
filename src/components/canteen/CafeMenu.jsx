import { useSearchParams } from "react-router-dom"
import { BookOpen, Coffee, MapPin, SlidersHorizontal } from "lucide-react"
import { useDebounced, useRpc } from "../../hooks/useRpc"
import { setupError } from "../../lib/supabase"
import { money } from "../../utils/prices"
import SearchBar from "../SearchBar"
import Pagination from "../Pagination"
import { ErrorState, LoadingState, SetupNotice } from "../AsyncState"
import MenuPhoto, { PhotoCredit } from "./MenuPhoto"

const defaults = { query: "", category: "", canteen: "", budget: "", sort: "menu", page: 1 }
const pageSize = 36
const menuDate = date => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date))

export default function CafeMenu() {
  const [params, setParams] = useSearchParams()
  const filters = { ...defaults, ...Object.fromEntries([...params].filter(([key]) => Object.hasOwn(defaults, key))) }
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page, 10) || 1))
  const query = useDebounced(filters.query), budget = useDebounced(filters.budget)
  const result = useRpc("get_canteen_menu", { p_filters: { ...filters, query, budget, page, page_size: pageSize } })
  const cafe = result.data?.canteen, items = result.data?.items || [], categories = result.data?.categories || []
  const filtered = [filters.query, filters.category, filters.budget].some(Boolean) || filters.sort !== "menu"
  function change(next, keepPage = false) {
    const value = { ...filters, ...next, ...(!keepPage ? { page: 1 } : {}) }
    setParams(Object.fromEntries(Object.entries(value).filter(([key, item]) => item !== "" && String(item) !== String(defaults[key]))), { replace: true })
  }
  function clear() { setParams(filters.canteen ? { canteen: filters.canteen } : {}, { replace: true }) }
  if (setupError) return <SetupNotice />
  return <section aria-label="Campus café menus">
    {result.data?.canteens.length > 1 && <label className="filter-label cafe-selector"><span>Choose café</span><select className="filter-select" value={filters.canteen || cafe?.id || ""} onChange={event => change({ canteen: event.target.value, category: "", page: 1 })}>{result.data.canteens.map(row => <option key={row.id} value={row.id}>{row.name} · {row.item_count} items</option>)}</select></label>}
    {cafe && <>
      <div className="cafe-hero"><div className="cafe-hero-body"><span className="cafe-kicker"><Coffee size={15} aria-hidden="true" />Your campus coffee stop</span><h2 className="serif-title">{cafe.name}</h2>{cafe.location && <p className="cafe-location"><MapPin size={15} aria-hidden="true" />{cafe.location}</p>}<p className="cafe-description">{cafe.description || "Take a look at the menu and find something for your next break."}</p>
        <div className="cafe-facts"><div><strong>{cafe.item_count}</strong><span>menu items</span></div><div><strong>{money(cafe.min_price)}–{money(cafe.max_price)}</strong><span>menu-board range</span></div><a className="btn btn-primary" href="#cafe-menu">Explore menu<BookOpen size={16} aria-hidden="true" /></a></div>
      </div><figure className="cafe-cover"><MenuPhoto photo={cafe.cover_photo} priority /><figcaption>Illustrative photograph<PhotoCredit photo={cafe.cover_photo} /></figcaption></figure></div>
      <div className="menu-provenance"><BookOpen size={17} aria-hidden="true" /><p><strong>Prices from the menu board.</strong> Confirm availability and serving sizes at the counter.</p></div>
    </>}
    <div id="cafe-menu" className="cafe-menu-heading"><div><p className="eyebrow">Find your favourites</p><h2 className="serif-title">On the menu</h2></div><SlidersHorizontal size={21} className="muted" aria-hidden="true" /></div>
    <div className="menu-categories" role="group" aria-label="Menu category"><button aria-pressed={!filters.category} onClick={() => change({ category: "" })}>All items{cafe && <span>{cafe.item_count}</span>}</button>{categories.map(category => <button key={category.id} aria-pressed={filters.category === category.id} onClick={() => change({ category: category.id })}>{category.name}<span>{category.item_count}</span></button>)}</div>
    <div className="cafe-menu-tools"><SearchBar label="Search café menu" value={filters.query} onChange={query => change({ query })} placeholder="Coffee, burgers, Maggi…" /><label className="filter-label"><span>Max budget (₹)</span><input className="filter-select" inputMode="decimal" maxLength={11} placeholder="Any budget" value={filters.budget} onChange={event => change({ budget: event.target.value })} /></label><label className="filter-label"><span>Sort by</span><select className="filter-select" value={filters.sort} onChange={event => change({ sort: event.target.value })}><option value="menu">Menu order</option><option value="lowest">Price: low to high</option><option value="highest">Price: high to low</option></select></label></div>
    <div className="menu-budget-picks" role="group" aria-label="Quick budgets"><span>On a budget?</span>{[50, 100].map(amount => <button key={amount} aria-pressed={filters.budget === String(amount)} onClick={() => change({ budget: filters.budget === String(amount) ? "" : String(amount) })}>{money(amount)} & under</button>)}</div>
    <div className="results-meta"><span role="status" aria-live="polite">{result.loading || query !== filters.query || budget !== filters.budget ? "Finding your next bite…" : result.data ? `${result.data.total} ${result.data.total === 1 ? "item" : "items"}${cafe ? ` at ${cafe.name}` : ""}` : ""}</span>{filtered && <button className="reset-link" onClick={clear}>Clear filters</button>}</div>
    {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : result.loading && !result.data ? <LoadingState label="Loading café menu…" /> : items.length ? <div className="cafe-menu-grid" aria-busy={result.loading}>{items.map(item => <article className="menu-card" key={item.id} aria-labelledby={`dish-${item.id}`}>
      <div className="menu-card-media"><MenuPhoto photo={item.photo} /><span className="menu-illustration-label">Illustrative photo</span></div><div className="menu-card-body"><p className="menu-card-category">{item.category}</p><div className="menu-card-title"><h3 id={`dish-${item.id}`}>{item.name}</h3><span className="menu-card-price">{money(item.amount)}</span></div><p className="menu-price-label">Menu-board price</p><PhotoCredit photo={item.photo} /></div>
    </article>)}</div> : <div className="empty-state"><Coffee size={32} className="mx-auto mb-4 muted" aria-hidden="true" /><h3 className="serif-title text-2xl">{filtered ? "No bites found just yet." : "The next café is on its way."}</h3><p className="muted text-sm mt-3">{filtered ? "Try another search, category, or budget." : "Published campus menus will appear here."}</p>{filtered && <button className="btn btn-secondary mt-5" onClick={clear}>Reset menu filters</button>}{!filtered && filters.canteen && <button className="reset-link mt-3" onClick={() => setParams({})}>Browse available cafés</button>}</div>}
    {result.data && <Pagination page={page} total={result.data.total} pageSize={pageSize} loading={result.loading} onChange={page => { change({ page }, true); document.getElementById("cafe-menu")?.scrollIntoView({ behavior: "instant" }) }} />}
    {cafe && <details className="menu-source-details"><summary>About this menu & photography</summary><div><p>Source: {cafe.source_labels.join("; ")}. {cafe.source_observed_on ? `Menu photograph dated ${menuDate(cafe.source_observed_on)}.` : "The photograph’s capture date was not supplied."} Menu listings last updated {menuDate(cafe.updated_at)}.</p><p>Food photographs are real, credited illustrations of the named dishes or their preparation style. They do not show this café’s actual servings or confirm ingredients, portion sizes, or availability. Photo credits link to the original sources and licences.</p><p>For a like-for-like price comparison, open Compare prices. Only source-verified, available offerings with matching, known portions qualify.</p></div></details>}
  </section>
}
