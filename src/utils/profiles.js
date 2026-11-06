export function toPerson(profile) {
  if (!profile) return null
  return { ...profile, name: profile.display_name, program: profile.programme?.name || "Programme not added",
    department: profile.department?.name || "", year: profile.member_type === "graduate" ? `Graduate${profile.graduation_year ? ` · ${profile.graduation_year}` : ""}`
      : profile.stage_number ? `${profile.programme?.stage_unit === "year" ? "Year" : "Semester"} ${profile.stage_number}` : "",
    skills: (profile.skills || []).map(skill => skill.name), skillRecords: profile.skills || [],
    photoAssetId: profile.is_sample ? null : profile.photo_asset_id, isSample: profile.is_sample, isUser: profile.is_owner,
    projects: profile.projects || [], contacts: profile.contacts || [] }
}
export function safeLink(value, kind = "website") {
  if (!value) return null
  if (kind === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? `mailto:${encodeURIComponent(value)}` : null
  if (kind === "phone") return /^\+?[0-9 ()-]{7,24}$/.test(value) ? `tel:${value.replace(/[ ()-]/g, "")}` : null
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null }
  catch { return null }
}
