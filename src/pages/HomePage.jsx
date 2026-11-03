import { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useReducedMotion } from "framer-motion"
import { ArrowRight, ArrowUpRight, Code2, Palette, Microscope, Lightbulb } from "lucide-react"
import Hero from "../components/Hero"
import FeaturedProfileCard from "../components/FeaturedProfileCard"
import SearchBar from "../components/SearchBar"
import FilterBar from "../components/FilterBar"
import ProfileCard from "../components/ProfileCard"
import { useApp } from "../context/AppContext"
import { filterProfiles, uniqueSkills, uniqueValues } from "../utils/filterProfiles"
export default function HomePage() {
  const { profiles } = useApp()
  const location = useLocation()
  const reduce = useReducedMotion()
  const [query, setQuery] = useState("")
  const [skill, setSkill] = useState("All")
  const [department, setDepartment] = useState("All")
  const [program, setProgram] = useState("All")
  const featured = profiles.filter(person => person.featured).slice(0, 3)
  const results = useMemo(() => filterProfiles(profiles, { query, skill, department, program }), [profiles, query, skill, department, program])
  const skillOptions = ["All", ...uniqueSkills(profiles)]
  const departmentOptions = ["All", ...uniqueValues(profiles, "department")]
  const programOptions = ["All", ...uniqueValues(profiles, "program")]
  const hasFilters = query || skill !== "All" || department !== "All" || program !== "All"
  function clearFilters() { setQuery(""); setSkill("All"); setDepartment("All"); setProgram("All") }
  function scrollToDiscover() { document.getElementById("discover")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" }) }
  useEffect(() => { if (location.hash === "#discover") document.getElementById("discover")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" }) }, [location.hash, reduce])
  return <>
    <Hero search={query} onSearchChange={setQuery} onSearchSubmit={scrollToDiscover} people={profiles} />
    <div className="container"><div className="community-strip"><p className="eyebrow">A campus of possibilities</p><div className="community-values"><span><Code2 size={15} /> Technology</span><span><Palette size={15} /> Design & creativity</span><span><Microscope size={15} /> Science & research</span><span><Lightbulb size={15} /> Ideas & enterprise</span></div></div></div>
    <section className="container section-block" aria-labelledby="featured-heading"><div className="section-heading"><div><p className="eyebrow">People worth knowing</p><h2 id="featured-heading" className="section-title serif-title">In the spotlight.</h2></div><a href="#discover" className="text-link">Explore the community <ArrowRight size={16} /></a></div><div className="feature-grid">{featured.map((person, index) => <FeaturedProfileCard key={person.id} person={person} index={index} />)}</div></section>
    <section id="discover" className="discover-section" aria-labelledby="discover-heading"><div className="container"><div className="section-heading"><div><p className="eyebrow">Find your next collaborator</p><h2 id="discover-heading" className="section-title serif-title">A skill. A spark. A connection.</h2><p className="section-description">Explore the people behind the possibilities. Start with what interests you.</p></div><span className="eyebrow">Campus directory</span></div>
      <div className="discover-tools"><SearchBar value={query} onChange={setQuery} placeholder="Search by name, skill, or department" /><FilterBar skill={skill} department={department} program={program} skillOptions={skillOptions} departmentOptions={departmentOptions} programOptions={programOptions} onSkillChange={setSkill} onDepartmentChange={setDepartment} onProgramChange={setProgram} /></div>
      <div className="results-meta"><span role="status" aria-live="polite">{results.length} {results.length === 1 ? "profile" : "profiles"} to explore</span>{hasFilters ? <button type="button" className="reset-link" onClick={clearFilters}>Clear filters</button> : <span>Demo community</span>}</div>
      {results.length === 0 ? <div className="empty-state"><h3 className="serif-title text-2xl">No matches just yet.</h3><p className="muted text-sm mt-3 mb-5">Try a different search or give another skill a go.</p><button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear filters</button></div> : <div className="profile-grid">{results.map((person, index) => <ProfileCard key={person.id} person={person} index={index} />)}</div>}
    </div></section>
    <section className="container join-banner"><div><p className="eyebrow">There’s a place for your perspective</p><h2 className="serif-title section-title">Let your work introduce you.</h2><p className="section-description">Your skills, your projects, your corner of the community.</p></div><Link to="/my-profile" className="btn btn-primary">Create your profile <ArrowUpRight size={17} /></Link></section>
  </>
}
