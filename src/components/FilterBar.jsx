function Select({ label, value, onChange, options }) {
  return <label className="filter-label"><span>{label}</span><select aria-label={label} className="filter-select" value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option} value={option}>{option === "All" ? `All ${label === "Programme" ? "programmes" : label === "Department" ? "departments" : "skills"}` : option}</option>)}</select></label>
}
export default function FilterBar({ skill, department, program, skillOptions, departmentOptions, programOptions, onSkillChange, onDepartmentChange, onProgramChange }) {
  return <div className="filter-grid"><Select label="Skill" value={skill} onChange={onSkillChange} options={skillOptions} /><Select label="Department" value={department} onChange={onDepartmentChange} options={departmentOptions} /><Select label="Programme" value={program} onChange={onProgramChange} options={programOptions} /></div>
}
