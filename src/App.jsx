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
import ProtectedRoute from "./components/ProtectedRoute"
import { LoadingState } from "./components/AsyncState"
import { phonePreview } from "./lib/preview"
import PhonePreviewTools from "./components/PhonePreviewTools"
import PhonePreviewNotice from "./components/PhonePreviewNotice"
const StudentPage = lazy(() => import("./pages/StudentPage"))
const MyProfilePage = lazy(() => import("./pages/MyProfilePage"))
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"))
const CanteenPage = lazy(() => import("./pages/CanteenPage"))
const AuthPage = lazy(() => import("./pages/AuthPage"))
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"))
const AdminPage = lazy(() => import("./pages/AdminPage"))
function AnimatedRoutes() {
  const location = useLocation()
  const reduce = useReducedMotion()
  useEffect(() => { if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" }) }, [location.pathname, location.hash])
  return <AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }}><Suspense fallback={<LoadingState label="Opening page…" />}><Routes location={location}>
    <Route path="/" element={<HomePage />} /><Route path="/discover" element={<DiscoverPage />} /><Route path="/student/:id" element={<StudentPage />} />
    <Route path="/canteen-prices" element={<CanteenPage />} /><Route path="/my-profile" element={phonePreview ? <PhonePreviewNotice /> : <ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
    <Route path="/sign-in" element={phonePreview ? <PhonePreviewNotice /> : <AuthPage mode="signin" />} /><Route path="/sign-up" element={phonePreview ? <PhonePreviewNotice /> : <AuthPage mode="signup" />} />
    <Route path="/forgot-password" element={phonePreview ? <PhonePreviewNotice /> : <AuthPage mode="forgot" />} /><Route path="/recover-account" element={phonePreview ? <PhonePreviewNotice /> : <AuthPage mode="recovery" />} /><Route path="/auth/callback" element={phonePreview ? <PhonePreviewNotice /> : <AuthCallbackPage />} />
    <Route path="/admin" element={phonePreview ? <PhonePreviewNotice /> : <ProtectedRoute admin><AdminPage /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></motion.div></AnimatePresence>
}
function Layout() {
  const { toast, config } = useApp()
  return <div className="site-shell"><a href="#main-content" className="skip-link">Skip to content</a><Navbar />{phonePreview && <PhonePreviewTools />}{config.data?.samples_enabled && <div className="development-banner">Development environment · Sample identities and illustrative prices are labelled. They are not verified campus records.</div>}<main id="main-content" tabIndex={-1}><AnimatedRoutes /></main><footer className="site-footer"><div className="container footer-inner"><Brand /><p className="footer-note">Your campus. Your skills. Your services.<br />An independent platform for the IUST community.</p></div></footer><Toast message={toast} /></div>
}
export default function App() { return <MotionConfig reducedMotion="user"><AuthProvider><AppProvider><BrowserRouter><Layout /></BrowserRouter></AppProvider></AuthProvider></MotionConfig> }
