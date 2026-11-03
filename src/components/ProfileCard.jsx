import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import SkillTag from "./SkillTag"
import Avatar from "./Avatar"
export default function ProfileCard({ person, index = 0 }) {
  return <motion.article className="profile-card" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .45, delay: Math.min(index * .035, .18), ease: [.22, 1, .36, 1] }}>
    <div className="profile-card-top"><Avatar name={person.name} image={person.image} /><div className="min-w-0"><div className="flex items-center flex-wrap gap-2"><h3 className="profile-card-name">{person.name}</h3>{person.isUser && <span className="you-badge">You</span>}</div><p className="profile-card-program">{person.program}</p></div></div>
    <p className="profile-card-bio line-clamp-2">{person.bio}</p><div className="skill-list">{person.skills.slice(0, 4).map(skill => <SkillTag key={skill} label={skill} />)}</div>
    <div className="profile-card-footer"><Link to={`/student/${person.id}`} className="text-link" aria-label={`View profile: ${person.name}`}>Meet {person.name.split(" ")[0]} <ArrowUpRight size={14} /></Link></div>
  </motion.article>
}
