import { AnimatePresence, motion } from "framer-motion"
export default function Toast({ message }) {
  return <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2" role="status" aria-live="polite"><AnimatePresence>{message && <motion.div key={message} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="toast">{message}</motion.div>}</AnimatePresence></div>
}
