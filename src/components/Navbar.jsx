import { useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Menu, X, ArrowUpRight } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import Brand from "./Brand"
import { useAuth } from "../context/auth"
import { useApp } from "../context/app"
import { readableError, supabase } from "../lib/supabase"
export default function Navbar() {
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  const location = useLocation()
  const reduce = useReducedMotion()
  const { user, account } = useAuth()
  const { showToast } = useApp()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const links = [{ to: "/", label: "Home" }, { to: "/discover", label: "Discover" }, { to: "/canteen-prices", label: "Campus cafés" }, { to: "/my-profile", label: "My profile" },
    ...(account?.is_admin || account?.is_role_manager ? [{ to: "/admin", label: "Admin" }] : []), ...(!user ? [{ to: "/sign-in", label: "Sign in" }] : [])]
  async function signOut() {
    setSigningOut(true)
    try { const { error } = await supabase.auth.signOut(); if (error) throw error; setOpen(false); navigate("/"); showToast("You’ve signed out.") }
    catch (error) { showToast(readableError(error)) }
    finally { setSigningOut(false) }
  }
  function handleClick(event, link) {
    setOpen(false)
    if (link.to === "/#discover" && location.pathname === "/") {
      document.getElementById("discover")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" })
    }
  }
  const active = link => link.to === "/" ? location.pathname === "/" && !location.hash : link.to === "/#discover" ? location.pathname === "/" && location.hash === "#discover" : location.pathname === link.to
  return <header className="site-header"><div className="container header-inner">
    <Brand /><nav className="desktop-nav" aria-label="Main navigation">{links.map(link => <Link key={link.to} to={link.to} onClick={e => handleClick(e, link)} className={`nav-link ${active(link) ? "active" : ""}`} aria-current={active(link) ? "page" : undefined}>{link.label}</Link>)}</nav>
    {user ? <button className="btn btn-secondary header-cta" disabled={signingOut} onClick={signOut}>Sign out</button> : <Link to="/sign-up" className="btn btn-primary header-cta">Join the community <ArrowUpRight size={16} /></Link>}
    <button ref={toggle} type="button" className="mobile-toggle" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation">{open ? <X size={21} /> : <Menu size={21} />}</button>
  </div><AnimatePresence>{open && <motion.nav id="mobile-navigation" aria-label="Mobile navigation" className="mobile-nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }} onKeyDown={e => { if (e.key === "Escape") { setOpen(false); toggle.current?.focus() } }}>
    {links.map(link => <Link key={link.to} to={link.to} onClick={e => handleClick(e, link)} aria-current={active(link) ? "page" : undefined}>{link.label}</Link>)}
    {user ? <button className="btn btn-secondary" disabled={signingOut} onClick={signOut}>Sign out</button> : <Link to="/sign-up" className="btn btn-primary" onClick={() => setOpen(false)}>Join the community <ArrowUpRight size={16} /></Link>}
  </motion.nav>}</AnimatePresence></header>
}
