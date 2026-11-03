const DRAFT_KEY = "iust-connect-draft"
const PUBLISHED_KEY = "iust-connect-published"

export const emptyProfile = {
  id: "my-profile",
  name: "",
  program: "",
  department: "",
  year: "",
  bio: "",
  about: "",
  skills: [],
  image: "",
  projects: [
    {
      title: "",
      description: "",
      link: "",
    },
  ],
  isUser: true,
  isPublished: false,
}

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    console.error("Could not read from localStorage:", error)
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.error("Could not save to localStorage:", error)
    return false
  }
}

export function loadDraft() {
  return read(DRAFT_KEY)
}

export function saveDraft(profile) {
  return write(DRAFT_KEY, {
    ...profile,
    id: "my-profile",
    isUser: true,
    isPublished: false,
  })
}

export function loadPublished() {
  return read(PUBLISHED_KEY)
}

export function savePublished(profile) {
  return write(PUBLISHED_KEY, {
    ...profile,
    id: "my-profile",
    isUser: true,
    isPublished: true,
  })
}
