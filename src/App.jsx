import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useEffect } from "react"
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion"
import { AppProvider, useApp } from "./context/AppContext"
import Navbar from "./components/Navbar"
import Brand from "./components/Brand"
import Toast from "./components/Toast"
import HomePage from "./pages/HomePage"
import StudentPage from "./pages/StudentPage"
import MyProfilePage from "./pages/MyProfilePage"
function AnimatedRoutes() {
  const location = useLocation()
  const reduce = useReducedMotion()
  useEffect(() => { if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" }) }, [location.pathname, location.hash])
  return <AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }}><Routes location={location}><Route path="/" element={<HomePage />} /><Route path="/student/:id" element={<StudentPage />} /><Route path="/my-profile" element={<MyProfilePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></motion.div></AnimatePresence>
}
function Layout() {
  const { toast } = useApp()
  return <div className="site-shell"><a href="#main-content" className="skip-link">Skip to content</a><Navbar /><main id="main-content" tabIndex={-1}><AnimatedRoutes /></main><footer className="site-footer"><div className="container footer-inner"><Brand /><p className="footer-note">An independent campus networking prototype.<br />Islamic University of Science and Technology · Sample profiles for demonstration.</p></div></footer><Toast message={toast} /></div>
}
export default function App() { return <MotionConfig reducedMotion="user"><AppProvider><BrowserRouter><Layout /></BrowserRouter></AppProvider></MotionConfig> }
