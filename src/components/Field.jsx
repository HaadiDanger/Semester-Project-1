import { cloneElement, useId } from "react"
export default function Field({ label, error, help, children }) {
  const id = useId()
  return <div className="block min-w-0"><label htmlFor={id} className="mb-1.5 block text-sm editor-label">{label}</label>
    {cloneElement(children, { id, "aria-invalid": Boolean(error), "aria-describedby": error || help ? `${id}-help` : undefined })}
    {(error || help) && <span id={`${id}-help`} className={`mt-1.5 block text-xs ${error ? "form-error" : "editor-help"}`}>{error || help}</span>}
  </div>
}
