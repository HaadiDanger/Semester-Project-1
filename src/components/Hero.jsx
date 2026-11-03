import { motion } from "framer-motion"
import { ArrowUpRight, Sparkles, Users } from "lucide-react"
import { Link } from "react-router-dom"
import SearchBar from "./SearchBar"

export default function Hero({ search, onSearchChange, onSearchSubmit, people }) {
  const portraits = [people.find(p => p.id === "zoya-farooq"), people.find(p => p.id === "ayaan-malik")].filter(Boolean)
  return <section className="hero"><div className="container hero-grid">
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, ease: [.22, 1, .36, 1] }}>
      <p className="hero-kicker"><span className="status-dot" /> A little closer. A lot more possible.</p>
      <h1 className="hero-title serif-title">Good things start<br />with <em>your people.</em></h1>
      <p className="hero-copy">Meet the makers, thinkers, and doers at IUST. Discover a skill, find a collaborator, or share what you’re building.</p>
      <div className="hero-search"><SearchBar value={search} onChange={onSearchChange} onSubmit={onSearchSubmit} placeholder="Find a person, skill, or department" label="Search the campus directory" /></div>
      <p className="hero-footnote"><Users size={14} /> Different disciplines. One campus community.</p>
    </motion.div>
    <motion.div className="hero-art" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8, delay: .1 }}>
      <div className="hero-orbit" aria-hidden="true" /><p className="art-label">Made of people. Full of possibility.</p>
      {portraits.map((person, i) => <Link key={person.id} to={`/student/${person.id}`} className={`hero-mini ${i === 0 ? "mini-one" : "mini-two"}`} aria-label={`Meet ${person.name}`}>
        <img src={person.image} alt={person.name} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = "/images/profile-fallback.svg" }} />
        <strong>{person.name} <ArrowUpRight size={12} className="inline" /></strong><small>{person.skills[0]}</small>
      </Link>)}
      <div className="art-sticker" aria-hidden="true"><Sparkles size={28} strokeWidth={1.2} /></div><div className="art-note">Your next idea starts with a hello.</div>
    </motion.div>
  </div></section>
}
