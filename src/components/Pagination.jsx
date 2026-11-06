export default function Pagination({ page, total, pageSize, onChange, loading }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages === 1 && page === 1) return null
  return <nav className="pagination" aria-label="Results pages"><button className="btn btn-secondary" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>Previous page</button>
    <span className="muted text-sm">Page {page} of {pages}</span><button className="btn btn-secondary" disabled={page >= pages || loading} onClick={() => onChange(page + 1)}>Next page</button></nav>
}
