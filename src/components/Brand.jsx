import { Link } from "react-router-dom"
import { Sprout } from "lucide-react"
export default function Brand() {
  return <Link to="/" className="brand" aria-label="IUST Connect home"><span className="brand-mark"><Sprout size={21} strokeWidth={1.6} /></span><span>IUST <em>Connect</em></span></Link>
}
