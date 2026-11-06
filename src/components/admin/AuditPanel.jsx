import useAdminList from "../../hooks/useAdminList"
import { observedAt } from "../../utils/prices"
import { AdminFilters, AdminResults } from "./AdminShared"

export default function AuditPanel() {
  const list = useAdminList("audit")
  return <section><h2 className="form-heading">Administrator audit history</h2><p className="muted text-sm mt-2 mb-5">An append-only record of privileged changes, their actors and reasons.</p><AdminFilters query={list.query} onQueryChange={list.setQuery} onRefresh={list.result.refresh} />
    <AdminResults result={list.result} page={list.page} onPageChange={list.setPage}><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">When / action</th><th scope="col">Actor / target</th><th scope="col">Reason</th></tr></thead><tbody>{list.result.data?.items.map(item => <tr key={item.id}><td>{item.action}<p className="muted text-xs mt-2">{observedAt(item.occurred_at)}</p></td><td><p className="text-xs">{item.actor_label || item.actor_user_id}</p><p className="muted text-xs mt-2">{item.target_table} · {item.target_key}</p></td><td>{item.reason}{Object.keys(item.details).length > 0 && <details className="mt-2"><summary className="text-link">Change details</summary><pre className="audit-details">{JSON.stringify(item.details, null, 2)}</pre></details>}</td></tr>)}</tbody></table></div></AdminResults>
  </section>
}
