import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowUpRight, Sparkles } from "lucide-react"
import SkillTag from "./SkillTag"
export default function FeaturedProfileCard({ person, index = 0 }) {
  return <motion.article className="feature-card" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .5, delay: index * .06, ease: [.22, 1, .36, 1] }}>
    <Link to={`/student/${person.id}`} className="feature-photo block" aria-label={`View ${person.name}'s profile`}>
      <img src={person.image || "/images/profile-fallback.svg"} alt={person.name} loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = "/images/profile-fallback.svg" }} />
      <span className="feature-label"><Sparkles size={12} /> Community spotlight</span>
    </Link><div className="feature-body"><h3 className="feature-name">{person.name}</h3><p className="feature-program">{person.program}</p><p className="feature-bio">{person.bio}</p>
      <div className="skill-list mt-4">{person.skills.slice(0, 3).map(skill => <SkillTag key={skill} label={skill} />)}</div>
      <div className="feature-bottom"><span>{person.projects.length} projects to explore</span><Link to={`/student/${person.id}`} className="text-link" aria-label={`View profile: ${person.name}`}>View profile <ArrowUpRight size={15} /></Link></div>
    </div>
  </motion.article>
}
