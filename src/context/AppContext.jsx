import { createContext, useContext, useMemo, useRef, useState } from "react"
import { demoProfiles } from "../data/profiles"
import { loadPublished, saveDraft, savePublished } from "../utils/storage"

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [publishedProfile, setPublishedProfile] = useState(() => loadPublished())
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  function showToast(message) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }

  function persistDraft(profile) {
    const ok = saveDraft(profile)
    if (!ok) {
      showToast("Could not save draft. Storage may be full.")
      return false
    }
    showToast("Draft saved on this device.")
    return true
  }

  function persistPublished(profile) {
    const next = {
      ...profile,
      id: "my-profile",
      isUser: true,
      isPublished: true,
    }
    const ok = savePublished(next)
    if (!ok) {
      showToast("Could not publish. Try a smaller profile photo.")
      return false
    }
    saveDraft(profile)
    setPublishedProfile(next)
    showToast("Your IUST Connect profile has been published.")
    return true
  }

  const profiles = useMemo(() => {
    if (!publishedProfile) return demoProfiles
    const others = demoProfiles.filter((person) => person.id !== publishedProfile.id)
    return [publishedProfile, ...others]
  }, [publishedProfile])

  const value = {
    profiles,
    publishedProfile,
    toast,
    showToast,
    persistDraft,
    persistPublished,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used inside AppProvider")
  }
  return context
}
