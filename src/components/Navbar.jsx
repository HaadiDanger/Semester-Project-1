import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, X, ArrowUpRight } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import Brand from "./Brand"
export default function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const reduce = useReducedMotion()
  const links = [{ to: "/", label: "Home" }, { to: "/#discover", label: "Discover" }, { to: "/my-profile", label: "My profile" }]
  function handleClick(event, link) {
    setOpen(false)
    if (link.to === "/#discover" && location.pathname === "/") {
      document.getElementById("discover")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" })
    }
  }
  const active = link => link.to === "/" ? location.pathname === "/" && !location.hash : link.to === "/#discover" ? location.pathname === "/" && location.hash === "#discover" : location.pathname === link.to
  return <header className="site-header"><div className="container header-inner">
    <Brand /><nav className="desktop-nav" aria-label="Main navigation">{links.map(link => <Link key={link.to} to={link.to} onClick={e => handleClick(e, link)} className={`nav-link ${active(link) ? "active" : ""}`} aria-current={active(link) ? "page" : undefined}>{link.label}</Link>)}</nav>
    <Link to="/my-profile" className="btn btn-primary header-cta">Create your profile <ArrowUpRight size={16} /></Link>
    <button type="button" className="mobile-toggle" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation">{open ? <X size={21} /> : <Menu size={21} />}</button>
  </div><AnimatePresence>{open && <motion.nav id="mobile-navigation" aria-label="Mobile navigation" className="mobile-nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }} onKeyDown={e => { if (e.key === "Escape") setOpen(false) }}>
    {links.map(link => <Link key={link.to} to={link.to} onClick={e => handleClick(e, link)}>{link.label}</Link>)}
    <Link to="/my-profile" className="btn btn-primary" onClick={() => setOpen(false)}>Create your profile <ArrowUpRight size={16} /></Link>
  </motion.nav>}</AnimatePresence></header>
}
