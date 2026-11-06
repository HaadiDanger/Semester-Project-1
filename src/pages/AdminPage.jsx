import { useSearchParams } from "react-router-dom"
import { useAuth } from "../context/auth"
import OverviewPanel from "../components/admin/OverviewPanel"
import ProfilePanel from "../components/admin/ProfilePanel"
import ReferencePanel from "../components/admin/ReferencePanel"
import PricePanel from "../components/admin/PricePanel"
import RequestPanel from "../components/admin/RequestPanel"
import RolePanel from "../components/admin/RolePanel"
import SettingsPanel from "../components/admin/SettingsPanel"
import AuditPanel from "../components/admin/AuditPanel"

const adminTabs = [["overview", "Overview"], ["profiles", "Accounts & profiles"], ["references", "Reference data"], ["prices", "Canteen prices"], ["skill_requests", "Skill suggestions"], ["reports", "Reports"], ["audit", "Audit history"], ["settings", "Settings"]]
export default function AdminPage() {
  const { account } = useAuth()
  const [params, setParams] = useSearchParams()
  const tabs = [...(account.is_admin ? adminTabs : []), ...(account.is_role_manager ? [["roles", "Roles"]] : [])]
  const requested = params.get("section")
  const section = tabs.some(([key]) => key === requested) ? requested : tabs[0][0]
  return <div className="page-wrap admin-page"><p className="eyebrow">Look after the community</p><h1 className="serif-title text-4xl sm:text-5xl mt-3">Administration.</h1><p className="section-description">Review shared profiles, maintain useful references, and keep canteen comparisons current.</p>
    <nav className="admin-tabs" aria-label="Administration sections">{tabs.map(([key, label]) => <button key={key} className={`admin-tab ${section === key ? "active" : ""}`} aria-current={section === key ? "page" : undefined} onClick={() => setParams({ section: key })}>{label}</button>)}</nav>
    <div className="admin-panel">
      {section === "overview" && <OverviewPanel />}{section === "profiles" && <ProfilePanel />}{section === "references" && <ReferencePanel />}{section === "prices" && <PricePanel />}
      {section === "skill_requests" && <RequestPanel key="skill" kind="skill" />}{section === "reports" && <RequestPanel key="report" kind="report" />}
      {section === "roles" && <RolePanel />}{section === "settings" && <SettingsPanel />}{section === "audit" && <AuditPanel />}
    </div>
  </div>
}
