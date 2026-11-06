import { useEffect, useId, useRef } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  const heading = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  function wrapFocus(event) {
    if (event.key !== "Tab") return
    const dialog = ref.current
    const controls = [...dialog.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex],[contenteditable='true']")]
      .filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest("[inert]") && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden")
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); dialog.focus(); return }
    const active = document.activeElement
    if (active === dialog || !dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target.focus()
    }
  }
  return <motion.dialog ref={ref} className="app-modal" tabIndex={-1} aria-labelledby={heading} onKeyDown={wrapFocus} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === ref.current) onClose() }}>
    <div className="modal-content"><div className="modal-heading"><h2 id={heading} className="serif-title text-2xl">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</div>
  </motion.dialog>
}
