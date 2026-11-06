import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useReducedMotion } from "framer-motion"
import { ArrowRight, ArrowUpRight, Code2, Palette, Trophy, CookingPot, Lightbulb } from "lucide-react"
import Hero from "../components/Hero"
import FeaturedProfileCard from "../components/FeaturedProfileCard"
import DiscoverSection from "../components/DiscoverSection"
import { ErrorState, LoadingState } from "../components/AsyncState"
import { useRpc } from "../hooks/useRpc"
import { setupError } from "../lib/supabase"
import { toPerson } from "../utils/profiles"

export default function HomePage() {
  const location = useLocation()
  const reduce = useReducedMotion()
  const [filters, setFilters] = useState({ query: "", page: 1 })
  const spotlight = useRpc("discover_profiles", { p_filters: { featured: true, page_size: 3 } })
  const featured = (spotlight.data?.items || []).map(toPerson)
  function scrollToDiscover() { document.getElementById("discover")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" }) }
  useEffect(() => { if (location.hash === "#discover") document.getElementById("discover")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" }) }, [location.hash, reduce])
  return <>
    <Hero search={filters.query} onSearchChange={query => setFilters(current => ({ ...current, query, page: 1 }))} onSearchSubmit={scrollToDiscover} people={featured} />
    <div className="container"><div className="community-strip"><p className="eyebrow">A campus of possibilities</p><div className="community-values"><span><Code2 size={15} /> Technology</span><span><Palette size={15} /> Arts & crafts</span><span><Trophy size={15} /> Sports</span><span><CookingPot size={15} /> Food & baking</span><span><Lightbulb size={15} /> Ideas & enterprise</span></div></div></div>
    <section className="container section-block" aria-labelledby="featured-heading"><div className="section-heading"><div><p className="eyebrow">People worth knowing</p><h2 id="featured-heading" className="section-title serif-title">In the spotlight.</h2></div><Link to="/discover" className="text-link">Explore the community <ArrowRight size={16} /></Link></div>
      {featured.length ? <div className="feature-grid">{featured.map((person, index) => <FeaturedProfileCard key={person.id} person={person} index={index} />)}</div> : spotlight.loading ? <LoadingState label="Finding the community spotlight…" /> : spotlight.error && !setupError ? <ErrorState message={spotlight.error} onRetry={spotlight.refresh} /> : <p className="muted text-sm">There’s room here for your talent. Shared, approved profiles can be selected for the community spotlight.</p>}
    </section>
    <DiscoverSection filters={filters} onFiltersChange={setFilters} />
    <section className="container canteen-banner"><div><p className="eyebrow">Your between-lectures guide</p><h2 className="serif-title section-title">Know your next bite.</h2><p className="section-description">Browse campus café menus, find your favourite dishes, and pick a bite that fits your budget.</p></div><Link to="/canteen-prices" className="btn btn-secondary">Explore campus cafés <ArrowUpRight size={17} /></Link></section>
    <section className="container join-banner"><div><p className="eyebrow">There’s a place for your perspective</p><h2 className="serif-title section-title">Let your work introduce you.</h2><p className="section-description">Your campus. Your skills. Your services.</p></div><Link to="/my-profile" className="btn btn-primary">Create your profile <ArrowUpRight size={17} /></Link></section>
  </>
}
