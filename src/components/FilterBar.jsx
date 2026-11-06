function Select({ label, value, onChange, options = [], disabled }) {
  return <label className="filter-label"><span>{label}</span><select aria-label={label} className="filter-select" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="">All</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
}
export default function FilterBar({ filters, references, onChange }) {
  const refs = references || {}
  const programme = refs.programmes?.find(item => item.id === filters.programme)
  const stages = Array.from({ length: programme?.stage_count || 0 }, (_, index) => ({ id: index + 1, name: `${programme.stage_unit === "year" ? "Year" : "Semester"} ${index + 1}` }))
  return <div className="filter-grid discovery-filters">
    <Select label="Category" value={filters.category} options={refs.skill_categories} onChange={category => onChange({ category, skill: "" })} />
    <Select label="Skill" value={filters.skill} options={refs.skills?.filter(item => !filters.category || item.category_id === filters.category)} onChange={skill => onChange({ skill })} />
    <Select label="Department" value={filters.department} options={refs.departments} onChange={department => onChange({ department, programme: "", stage: "" })} />
    <Select label="Programme" value={filters.programme} options={refs.programmes?.filter(item => !filters.department || item.department_id === filters.department)} onChange={programme => onChange({ programme, stage: "" })} />
    <Select label="Member" value={filters.member_type} options={[{ id: "student", name: "Students" }, { id: "graduate", name: "Graduates" }]} onChange={member_type => onChange({ member_type, stage: "" })} />
    <Select label="Stage" value={filters.stage} options={stages} disabled={!stages.length || filters.member_type === "graduate"} onChange={stage => onChange({ stage })} />
  </div>
}
