// Only the separate, anonymous LAN preview build enables this mode.
export const phonePreview = import.meta.env.MODE === "phone-preview" && import.meta.env.VITE_PHONE_PREVIEW === "true"
