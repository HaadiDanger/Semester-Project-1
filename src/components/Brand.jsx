import { Link } from "react-router-dom"
import { Orbit } from "lucide-react"
export default function Brand() {
  return <Link to="/" className="brand" aria-label="IUST Orbit home"><span className="brand-mark"><Orbit size={21} strokeWidth={1.6} aria-hidden="true" /></span><span>IUST <em>Orbit</em></span></Link>
}
