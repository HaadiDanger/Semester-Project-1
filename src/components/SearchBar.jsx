import { Search, ArrowRight } from "lucide-react"
export default function SearchBar({ value, onChange, placeholder, onSubmit, label = "Search profiles" }) {
  return <form role="search" className="search-form" onSubmit={e => { e.preventDefault(); onSubmit?.() }}>
    <Search size={18} className="muted shrink-0" aria-hidden="true" />
    <input type="search" aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    {onSubmit && <button type="submit" className="search-submit" aria-label="Search directory"><ArrowRight size={18} /></button>}
  </form>
}
