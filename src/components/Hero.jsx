import { motion } from "framer-motion"
import { ArrowUpRight, Sparkles, Users } from "lucide-react"
import { Link } from "react-router-dom"
import SearchBar from "./SearchBar"
import Avatar from "./Avatar"

export default function Hero({ search, onSearchChange, onSearchSubmit, people }) {
  const portraits = people.slice(0, 2)
  return <section className="hero"><div className="container hero-grid">
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, ease: [.22, 1, .36, 1] }}>
      <p className="hero-kicker"><span className="status-dot" /> A little closer. A lot more possible.</p>
      <h1 className="hero-title serif-title">Good things start<br />with <em>your people.</em></h1>
      <p className="hero-copy">Meet the makers, players, cooks, and doers at IUST. Discover a skill, find a collaborator, or share what you love doing.</p>
      <div className="hero-search"><SearchBar value={search} onChange={onSearchChange} onSubmit={onSearchSubmit} placeholder="Find a person, skill, or department" label="Search the campus directory" /></div>
      <p className="hero-footnote"><Users size={14} /> Different disciplines. One campus community.</p>
    </motion.div>
    <motion.div className="hero-art" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8, delay: .1 }}>
      <div className="hero-orbit" aria-hidden="true" /><p className="art-label">Made of people. Full of possibility.</p>
      {portraits.map((person, i) => <Link key={person.id} to={`/student/${person.id}`} className={`hero-mini ${i === 0 ? "mini-one" : "mini-two"}`} aria-label={`Meet ${person.name}`}>
        <Avatar name={person.name} assetId={person.photoAssetId} size="art" />
        <strong>{person.name} <ArrowUpRight size={12} className="inline" /></strong><small>{person.isSample ? "Sample · " : ""}{person.skills[0]}</small>
      </Link>)}
      {!portraits.length && <><div className="hero-mini mini-one neutral-mini"><div className="neutral-art" aria-hidden="true">✳</div><strong>Make something.</strong><small>Code. Cook. Create.</small></div><div className="hero-mini mini-two neutral-mini"><div className="neutral-art second" aria-hidden="true">✧</div><strong>Share a skill.</strong><small>Play. Teach. Collaborate.</small></div></>}
      <div className="art-sticker" aria-hidden="true"><Sparkles size={28} strokeWidth={1.2} /></div><div className="art-note">Your next idea starts with a hello.</div>
    </motion.div>
  </div></section>
}
