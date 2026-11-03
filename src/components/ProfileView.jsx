import { motion } from "framer-motion"
import { ArrowLeft, ArrowUpRight, GraduationCap, Pencil } from "lucide-react"
import { Link } from "react-router-dom"
import SkillTag from "./SkillTag"
import PortfolioCard from "./PortfolioCard"
import Avatar from "./Avatar"
import { useApp } from "../context/AppContext"
export default function ProfileView({ person }) {
  const { showToast } = useApp()
  const projects = (person.projects || []).filter(project => project.title)
  return <motion.article className="page-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }}>
    <Link to="/#discover" className="text-link"><ArrowLeft size={16} /> Back to discover</Link>
    <div className="profile-surface"><div className="profile-cover"><span className="eyebrow">{person.isUser ? "Your community profile" : "Meet the community · Demo profile"}</span></div>
      <div className="profile-details"><div className="profile-avatar"><Avatar name={person.name} image={person.image} size="lg" /></div><div className="profile-title-row"><div><h1 className="serif-title text-4xl sm:text-5xl">{person.name}</h1><p className="mt-3 text-sm flex items-center gap-2"><GraduationCap size={17} />{person.program}</p><p className="muted text-xs mt-2">{person.department}{person.year ? ` · ${person.year}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">{person.isUser && <Link to="/my-profile" className="btn btn-secondary"><Pencil size={14} /> Edit profile</Link>}<button type="button" className="btn btn-primary" onClick={() => showToast("Connection feature coming soon.")}>Connect <ArrowUpRight size={16} /></button></div></div>
        <p className="muted mt-6 text-sm leading-7 max-w-2xl">{person.bio}</p><div className="skill-list mt-5">{person.skills.map(skill => <SkillTag key={skill} label={skill} />)}</div>
      </div></div>
    <div className="profile-sections"><section><p className="eyebrow">A little introduction</p><h2 className="serif-title text-3xl mt-2">About {person.name.split(" ")[0]}.</h2><p className="muted mt-4 text-sm leading-7">{person.about}</p></section><section><div className="flex items-center justify-between mb-4"><h2 className="serif-title text-3xl">Selected work.</h2><span className="eyebrow">{projects.length} {projects.length === 1 ? "project" : "projects"}</span></div>{projects.length ? projects.map((project, i) => <PortfolioCard key={`${project.title}-${i}`} project={project} />) : <div className="portfolio-card muted text-sm">A little room for what’s next. No projects added yet.</div>}</section></div>
  </motion.article>
}
