import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { lazy, Suspense, useEffect } from "react"
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion"
import { AppProvider } from "./context/AppContext"
import { useApp } from "./context/app"
import AuthProvider from "./context/AuthProvider"
import Navbar from "./components/Navbar"
import Brand from "./components/Brand"
import Toast from "./components/Toast"
import HomePage from "./pages/HomePage"
import StudentPage from "./pages/StudentPage"
import MyProfilePage from "./pages/MyProfilePage"
import DiscoverPage from "./pages/DiscoverPage"
import CanteenPage from "./pages/CanteenPage"
import AuthPage from "./pages/AuthPage"
import AuthCallbackPage from "./pages/AuthCallbackPage"
import ProtectedRoute from "./components/ProtectedRoute"
import { LoadingState } from "./components/AsyncState"
const AdminPage = lazy(() => import("./pages/AdminPage"))
function AnimatedRoutes() {
  const location = useLocation()
  const reduce = useReducedMotion()
  useEffect(() => { if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" }) }, [location.pathname, location.hash])
  return <AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }}><Routes location={location}>
    <Route path="/" element={<HomePage />} /><Route path="/discover" element={<DiscoverPage />} /><Route path="/student/:id" element={<StudentPage />} />
    <Route path="/canteen-prices" element={<CanteenPage />} /><Route path="/my-profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
    <Route path="/sign-in" element={<AuthPage mode="signin" />} /><Route path="/sign-up" element={<AuthPage mode="signup" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} /><Route path="/recover-account" element={<AuthPage mode="recovery" />} /><Route path="/auth/callback" element={<AuthCallbackPage />} />
    <Route path="/admin" element={<ProtectedRoute admin><Suspense fallback={<LoadingState label="Opening administration…" />}><AdminPage /></Suspense></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></motion.div></AnimatePresence>
}
function Layout() {
  const { toast, config } = useApp()
  return <div className="site-shell"><a href="#main-content" className="skip-link">Skip to content</a><Navbar />{config.data?.samples_enabled && <div className="development-banner">Development environment · Sample identities and illustrative prices are labelled. They are not verified campus records.</div>}<main id="main-content" tabIndex={-1}><AnimatedRoutes /></main><footer className="site-footer"><div className="container footer-inner"><Brand /><p className="footer-note">Your campus. Your skills. Your services.<br />An independent platform for the IUST community.</p></div></footer><Toast message={toast} /></div>
}
export default function App() { return <MotionConfig reducedMotion="user"><AuthProvider><AppProvider><BrowserRouter><Layout /></BrowserRouter></AppProvider></AuthProvider></MotionConfig> }
