export function filterProfiles(profiles, { query, skill, department, program }) {
  const text = query.trim().toLowerCase()

  return profiles.filter((person) => {
    const matchesSkill = skill === "All" || person.skills.includes(skill)
    const matchesDepartment = department === "All" || person.department === department
    const matchesProgram = program === "All" || person.program === program

    if (!text) {
      return matchesSkill && matchesDepartment && matchesProgram
    }

    const haystack = [
      person.name,
      person.program,
      person.department,
      person.bio,
      person.about,
      person.year,
      ...person.skills,
    ]
      .join(" ")
      .toLowerCase()

    return (
      haystack.includes(text) &&
      matchesSkill &&
      matchesDepartment &&
      matchesProgram
    )
  })
}

export function uniqueValues(profiles, key) {
  return [...new Set(profiles.map((person) => person[key]).filter(Boolean))].sort()
}

export function uniqueSkills(profiles) {
  const all = profiles.flatMap((person) => person.skills)
  return [...new Set(all)].sort()
}
