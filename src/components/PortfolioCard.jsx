import { ArrowUpRight, Folder } from "lucide-react"
import { safeLink } from "../utils/profiles"
import AssetImage from "./AssetImage"
export default function PortfolioCard({ project }) {
  if (!project?.title) return null
  const link = safeLink(project.external_url)
  return <article className="portfolio-card"><Folder size={21} strokeWidth={1.4} className="muted mb-4" /><h3 className="text-base font-medium">{project.title}</h3>{project.description && <p className="muted mt-2 text-sm leading-6">{project.description}</p>}<AssetImage assetId={project.asset_id} alt={project.title} />{link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-link mt-5">View project <ArrowUpRight size={15} /></a>}</article>
}
