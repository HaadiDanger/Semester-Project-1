import { motion } from "framer-motion"
import { ArrowLeft, ArrowUpRight, GraduationCap, Pencil } from "lucide-react"
import { Link } from "react-router-dom"
import SkillTag from "./SkillTag"
import PortfolioCard from "./PortfolioCard"
import Avatar from "./Avatar"
import ReportProfile from "./ReportProfile"
import { safeLink } from "../utils/profiles"
export default function ProfileView({ person }) {
  const projects = (person.projects || []).filter(project => project.title)
  return <motion.article className="page-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }}>
    <Link to="/discover" className="text-link"><ArrowLeft size={16} /> Back to discover</Link>
    <div className="profile-surface"><div className="profile-cover"><span className="eyebrow">{person.isSample ? "Development sample · Not a verified student" : person.isUser ? "Your community profile" : "Meet the community"}</span></div>
      <div className="profile-details"><div className="profile-avatar"><Avatar name={person.name} assetId={person.photoAssetId} size="lg" /></div><div className="profile-title-row"><div><h1 className="serif-title text-4xl sm:text-5xl">{person.name}</h1><p className="mt-3 text-sm flex items-center gap-2"><GraduationCap size={17} />{person.program}</p><p className="muted text-xs mt-2">{person.department}{person.year ? ` · ${person.year}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">{person.isUser && <Link to="/my-profile" className="btn btn-secondary"><Pencil size={14} /> Edit profile</Link>}{person.contacts.length > 0 && <a href="#contact-links" className="btn btn-primary">Contact links <ArrowUpRight size={16} /></a>}</div></div>
        <p className="muted mt-6 text-sm leading-7 max-w-2xl">{person.bio}</p><div className="skill-list mt-5">{person.skills.map(skill => <SkillTag key={skill} label={skill} />)}</div>
      </div></div>
    {person.status && <p className="draft-notice mt-5">Owner / moderation preview · {person.status}{!person.discovery_opt_in ? " · Hidden from discovery" : ""}</p>}
    <div className="profile-sections"><section><p className="eyebrow">A little introduction</p><h2 className="serif-title text-3xl mt-2">About {person.name.split(" ")[0]}.</h2><p className="muted mt-4 text-sm leading-7">{person.about || person.bio}</p>
      {person.services && <><h3 className="form-heading mt-6">How I can help</h3><p className="muted mt-3 text-sm leading-7">{person.services}</p></>}
      {person.interests?.length > 0 && <p className="muted text-sm mt-5">Also interested in {person.interests.join(", ")}.</p>}
      <section id="contact-links" className="mt-8"><h3 className="form-heading">Get in touch</h3>{person.contacts.length ? <ul className="contact-list">{person.contacts.map(contact => {
        const href = safeLink(contact.value, contact.kind)
        return href ? <li key={contact.id}><a className="text-link" href={href} target={contact.kind === "social" || contact.kind === "website" ? "_blank" : undefined} rel="noopener noreferrer">{contact.label || contact.value}<ArrowUpRight size={14} /></a></li> : null
      })}</ul> : <p className="muted mt-3 text-sm">No contact links are shared with your audience.</p>}</section><ReportProfile person={person} />
    </section><section><div className="flex items-center justify-between mb-4"><h2 className="serif-title text-3xl">Selected work.</h2><span className="eyebrow">{projects.length} {projects.length === 1 ? "project" : "projects"}</span></div>{projects.length ? projects.map(project => <PortfolioCard key={project.id} project={project} />) : <div className="portfolio-card muted text-sm">A little room for what’s next. No shared projects yet.</div>}</section></div>
  </motion.article>
}
