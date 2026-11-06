import { useSearchParams } from "react-router-dom"
import { useDebounced, useRpc } from "./useRpc"

export default function useAdminList(section, initialStatus = "all") {
  const [params, setParams] = useSearchParams()
  const query = params.get("query") || ""
  const status = params.get("status") || initialStatus
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page"), 10) || 1))
  const settled = useDebounced(query)
  const result = useRpc("get_admin_snapshot", { p_section: section, p_filters: { query: settled, status, page } })
  function change(next) { setParams({ section, query, status, page: 1, ...next }, { replace: true }) }
  return { query, status, page, result, setQuery: query => change({ query }), setStatus: status => change({ status }), setPage: page => change({ page }) }
}
