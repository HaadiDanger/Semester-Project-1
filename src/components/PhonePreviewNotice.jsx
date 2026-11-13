import { Link } from "react-router-dom"

export default function PhonePreviewNotice() {
  return <section className="page-wrap"><h1 className="serif-title">Browsing-only preview.</h1><p className="muted mt-5 mb-6">This local phone link is for testing the public directory and café menus. Sign-in, uploads and account changes are disabled; use the normal application for those.</p><Link to="/" className="btn btn-primary">Back to the community</Link></section>
}
