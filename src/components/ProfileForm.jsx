import { useState } from "react"
import { Plus, X } from "lucide-react"
import Avatar from "./Avatar"
import Field from "./Field"
import AssetUpload from "./AssetUpload"
import { safeLink } from "../utils/profiles"

const newProject = () => ({ id: crypto.randomUUID(), title: "", description: "", external_url: "", asset_id: null, audience: "public" })
const audienceOptions = <><option value="owner">Only me</option><option value="campus">Eligible campus members</option><option value="public">Public visitors</option></>
export default function ProfileForm({ initialProfile, references, onSaveDraft, onSubmit, busy, locked, isSample }) {
  const [form, setForm] = useState(() => ({ display_name: initialProfile?.display_name || "", programme_id: initialProfile?.programme_id || "",
    department_id: initialProfile?.programme?.department_id || "", member_type: initialProfile?.member_type || "student", stage_number: initialProfile?.stage_number || "",
    graduation_year: initialProfile?.graduation_year || "", bio: initialProfile?.bio || "", about: initialProfile?.about || "", services: initialProfile?.services || "",
    interests: initialProfile?.interests?.join(", ") || "", skills: initialProfile?.skills?.map(skill => skill.id) || [],
    photo_asset_id: initialProfile?.photo_asset_id || null, photo_audience: initialProfile?.photo_audience || "owner", visibility: initialProfile?.visibility || "public",
    projects: initialProfile?.projects?.length ? initialProfile.projects : [newProject()], contacts: initialProfile?.contacts || [] }))
  const [errors, setErrors] = useState({})
  const [currentYear] = useState(() => new Date().getFullYear())
  const [skillCategory, setSkillCategory] = useState("")
  const [uploads, setUploads] = useState({})
  const uploading = Object.values(uploads).some(Boolean)
  const available = list => (list || []).filter(item => !item.is_sample || isSample)
  const programmes = available(references.programmes)
  const programme = programmes.find(item => item.id === form.programme_id)
  const skills = available(references.skills)
  function update(key, value) { setForm(current => ({ ...current, [key]: value })) }
  function updateProject(id, key, value) { setForm(current => ({ ...current, projects: current.projects.map(project => project.id === id ? { ...project, [key]: value } : project) })) }
  function updateContact(id, key, value) { setForm(current => ({ ...current, contacts: current.contacts.map(contact => contact.id === id ? { ...contact, [key]: value } : contact) })) }
  function markUpload(key, value) { setUploads(current => ({ ...current, [key]: value })) }
  function payload() {
    return { display_name: form.display_name.trim(), programme_id: form.programme_id || null, member_type: form.member_type,
      stage_number: form.member_type === "student" && programme?.stage_unit !== "none" ? Number(form.stage_number) || null : null,
      graduation_year: form.member_type === "graduate" ? Number(form.graduation_year) || null : null, bio: form.bio.trim(), about: form.about.trim(), services: form.services.trim(),
      interests: form.interests.split(",").map(item => item.trim()).filter(Boolean), skills: form.skills, photo_asset_id: form.photo_asset_id,
      photo_audience: form.photo_audience, visibility: form.visibility,
      projects: form.projects.filter(project => project.title || project.description || project.external_url || project.asset_id).map((project, index) => ({ id: project.id,
        title: project.title.trim(), description: project.description.trim(), external_url: project.external_url || null, asset_id: project.asset_id || null, audience: project.audience, sort_order: index })),
      contacts: form.contacts.map(contact => ({ id: contact.id, kind: contact.kind, label: contact.label || "", value: contact.value.trim(), audience: contact.audience })) }
  }
  function validate(value, submitting) {
    const next = {}
    if (submitting) {
      if (value.display_name.length < 2) next.display_name = "Please enter your full name."
      if (!value.programme_id) next.programme_id = "Choose a programme."
      if (value.member_type === "student" && programme?.stage_unit !== "none" && !value.stage_number) next.stage_number = "Choose a semester or year."
      if (value.bio.length < 10) next.bio = "Write a short introduction of at least 10 characters."
      if (!value.skills.length) next.skills = "Select at least one skill."
    }
    if (value.projects.some(project => !project.title || (!project.description && !project.external_url && !project.asset_id))) next.projects = "Each project needs a title and a description, image, or link. Remove unused entries."
    if (value.projects.some(project => project.external_url && !safeLink(project.external_url))) next.projects = "Portfolio links must use https:// and must not contain login credentials."
    if (value.contacts.some(contact => !safeLink(contact.value, contact.kind))) next.contacts = "Check each contact value. Website and social links must use https://."
    if (value.interests.length > 10 || value.interests.some(item => item.length > 80)) next.interests = "Use up to ten interests, at most 80 characters each."
    setErrors(next)
    return Object.keys(next).length === 0
  }
  async function submit(event) {
    event.preventDefault()
    const submitting = event.nativeEvent.submitter?.value !== "draft"
    const value = payload()
    if (!validate(value, submitting) || uploading) return
    if (submitting) await onSubmit(value)
    else await onSaveDraft(value)
  }
  return <form onSubmit={submit} className="mt-8"><fieldset className="profile-form space-y-8" disabled={busy || locked}>
    <section className="form-photo glass-card rounded-2xl p-5 sm:p-7"><h2 className="form-heading">Photo</h2><div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center"><Avatar name={form.display_name || "You"} assetId={isSample ? null : form.photo_asset_id} size="lg" /><div className="min-w-0">
      {isSample ? <p className="editor-help text-sm">Development profiles use initials. Genuine members can upload their own photograph.</p> : <AssetUpload purpose="photo" label="Upload your photo" assetId={form.photo_asset_id} onChange={value => update("photo_asset_id", value)} onBusyChange={value => markUpload("photo", value)} preview={false} disabled={busy || locked} />}
    </div></div><div className="mt-5"><Field label="Who can see your photo?" help="Moderators can preview uploaded images during review. Audience changes apply when saved."><select className="field-input" value={form.photo_audience} onChange={event => update("photo_audience", event.target.value)}>{audienceOptions}</select></Field></div></section>
    <section className="form-about glass-card space-y-4 rounded-2xl p-5 sm:p-7"><h2 className="form-heading">About you</h2>
      <Field label="Full name" error={errors.display_name}><input className="field-input" autoComplete="name" value={form.display_name} maxLength={80} onChange={event => update("display_name", event.target.value)} placeholder="Your name" /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Department"><select className="field-input" value={form.department_id} onChange={event => setForm(current => ({ ...current, department_id: event.target.value, programme_id: "", stage_number: "" }))}><option value="">Select department</option>{available(references.departments).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Programme" error={errors.programme_id}><select className="field-input" value={form.programme_id} onChange={event => setForm(current => ({ ...current, programme_id: event.target.value, department_id: programmes.find(item => item.id === event.target.value)?.department_id || current.department_id, stage_number: "" }))}><option value="">Select programme</option>{programmes.filter(item => !form.department_id || item.department_id === form.department_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Student or graduate"><select className="field-input" value={form.member_type} onChange={event => setForm(current => ({ ...current, member_type: event.target.value, stage_number: "", graduation_year: "" }))}><option value="student">Student</option><option value="graduate">Graduate</option></select></Field>
        {form.member_type === "graduate" ? <Field label="Graduation year (optional)"><input className="field-input" type="number" min={1900} max={currentYear} value={form.graduation_year} onChange={event => update("graduation_year", event.target.value)} /></Field> : <Field label="Semester / year" error={errors.stage_number}><select className="field-input" disabled={!programme?.stage_count} value={form.stage_number} onChange={event => update("stage_number", event.target.value)}><option value="">{programme?.stage_unit === "none" ? "Not applicable" : "Select stage"}</option>{Array.from({ length: programme?.stage_count || 0 }, (_, index) => <option key={index + 1} value={index + 1}>{programme.stage_unit === "year" ? "Year" : "Semester"} {index + 1}</option>)}</select></Field>}</div>
      <Field label="Short bio" error={errors.bio}><textarea className="field-input resize-y" rows={3} maxLength={280} value={form.bio} onChange={event => update("bio", event.target.value)} placeholder="A little about what you enjoy doing." /></Field>
      <Field label="About me"><textarea className="field-input resize-y" rows={5} maxLength={2000} value={form.about} onChange={event => update("about", event.target.value)} placeholder="Tell us about your interests and what you like making or sharing." /></Field>
      <Field label="How I can help (optional)"><textarea className="field-input resize-y" rows={3} maxLength={500} value={form.services} onChange={event => update("services", event.target.value)} placeholder="Tutoring, a friendly game, handmade work, a collaboration…" /></Field>
      <Field label="Other interests (comma separated)" error={errors.interests}><input className="field-input" value={form.interests} maxLength={800} onChange={event => update("interests", event.target.value)} /></Field>
    </section>
    <section className="form-skills glass-card rounded-2xl p-5 sm:p-7"><h2 className="form-heading">Skills</h2><p className="editor-help text-xs mt-2">Select up to 20. Creative, culinary, sporting and practical skills all belong here.</p>
      <div className="mt-4 flex flex-wrap gap-2">{form.skills.map(id => <button key={id} aria-label={`Remove ${skills.find(item => item.id === id)?.name || "inactive skill"}`} type="button" onClick={() => update("skills", form.skills.filter(value => value !== id))} className="skill-tag items-center gap-1.5">{skills.find(item => item.id === id)?.name || initialProfile?.skills?.find(item => item.id === id)?.name || "Inactive skill"}<X size={12} /></button>)}</div>
      <div className="mt-4 space-y-4"><Field label="Browse skill categories"><select className="field-input" value={skillCategory} onChange={event => setSkillCategory(event.target.value)}><option value="">All categories</option>{available(references.skill_categories).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Add a skill" error={errors.skills}><select className="field-input" value="" disabled={form.skills.length >= 20} onChange={event => { if (event.target.value) update("skills", [...form.skills, event.target.value]) }}><option value="">Choose a skill</option>{skills.filter(item => !form.skills.includes(item.id) && (!skillCategory || item.category_id === skillCategory)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      </div><p className="editor-help text-xs mt-4">Missing a skill? Use “Suggest a skill” below this editor.</p>
    </section>
    <section className="form-portfolio glass-card space-y-4 rounded-2xl p-5 sm:p-7"><h2 className="form-heading">Portfolio</h2><p className="editor-help text-xs">Add up to 12 projects, performances, practice ideas or handmade pieces. Moderators can preview these during review.</p>
      {form.projects.map((project, index) => <div key={project.id} className="project-editor space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm">Project {index + 1}</h3><button type="button" className="icon-button" aria-label={`Remove project ${index + 1}`} disabled={uploads[project.id]} onClick={() => update("projects", form.projects.filter(item => item.id !== project.id))}><X size={16} /></button></div>
        <Field label={`Project ${index + 1} title`}><input className="field-input" value={project.title} maxLength={100} onChange={event => updateProject(project.id, "title", event.target.value)} placeholder="Something you would like to share" /></Field>
        <Field label={`Project ${index + 1} description`}><textarea className="field-input resize-y" rows={3} maxLength={1000} value={project.description} onChange={event => updateProject(project.id, "description", event.target.value)} /></Field>
        <Field label={`Project ${index + 1} link (optional)`}><input className="field-input" type="url" placeholder="https://" maxLength={2048} value={project.external_url || ""} onChange={event => updateProject(project.id, "external_url", event.target.value)} /></Field>
        <Field label={`Project ${index + 1} audience`}><select className="field-input" value={project.audience} onChange={event => updateProject(project.id, "audience", event.target.value)}>{audienceOptions}</select></Field>
        <AssetUpload purpose="portfolio" label={`Upload project ${index + 1} image`} assetId={project.asset_id} onChange={value => updateProject(project.id, "asset_id", value)} onBusyChange={value => markUpload(project.id, value)} disabled={busy || locked} />
      </div>)}{errors.projects && <p className="form-error text-sm" role="alert">{errors.projects}</p>}
      <button type="button" className="btn btn-secondary" disabled={form.projects.length >= 12} onClick={() => update("projects", [...form.projects, newProject()])}><Plus size={15} />Add project</button>
    </section>
    <section className="form-privacy glass-card rounded-2xl p-5 sm:p-7 space-y-4"><h2 className="form-heading">Your visibility</h2>
      <Field label="Who can discover your approved profile?"><select className="field-input" value={form.visibility} onChange={event => update("visibility", event.target.value)}><option value="public">Public visitors</option><option value="campus">Eligible campus members</option></select></Field>
      <p className="editor-help text-sm leading-6">Drafts stay private to you and moderators. Submitting opts your profile into discovery once it is approved and your campus eligibility is confirmed. You can unpublish at any time.</p>
    </section>
    <section className="form-contacts glass-card rounded-2xl p-5 sm:p-7 space-y-4"><h2 className="form-heading">Contact & social links</h2><p className="editor-help text-xs">Optional. Each link has its own audience; your login email is never added automatically.</p>
      {isSample ? <p className="muted text-sm">Sample profiles do not contain contact details.</p> : <>{form.contacts.map((contact, index) => <div key={contact.id} className="project-editor space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm">Contact {index + 1}</h3><button type="button" className="icon-button" aria-label={`Remove contact ${index + 1}`} onClick={() => update("contacts", form.contacts.filter(item => item.id !== contact.id))}><X size={16} /></button></div>
        <Field label={`Contact ${index + 1} type`}><select className="field-input" value={contact.kind} onChange={event => updateContact(contact.id, "kind", event.target.value)}><option value="website">Website</option><option value="social">Social link</option><option value="email">Email</option><option value="phone">Phone</option></select></Field>
        <Field label={`Contact ${index + 1} label`}><input className="field-input" value={contact.label} maxLength={60} onChange={event => updateContact(contact.id, "label", event.target.value)} /></Field>
        <Field label={`Contact ${index + 1} value`}><input className="field-input" value={contact.value} maxLength={2048} onChange={event => updateContact(contact.id, "value", event.target.value)} /></Field>
        <Field label={`Contact ${index + 1} audience`}><select className="field-input" value={contact.audience} onChange={event => updateContact(contact.id, "audience", event.target.value)}>{audienceOptions}</select></Field>
      </div>)}{errors.contacts && <p className="form-error text-sm" role="alert">{errors.contacts}</p>}<button type="button" className="btn btn-secondary" disabled={form.contacts.length >= 8} onClick={() => update("contacts", [...form.contacts, { id: crypto.randomUUID(), kind: "website", label: "", value: "", audience: "owner" }])}><Plus size={15} />Add contact link</button></>}
    </section>
    <div className="form-actions flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="submit" value="draft" formNoValidate className="btn btn-secondary" disabled={uploading}>Save draft</button><button type="submit" value="submit" className="btn btn-primary" disabled={uploading}>{busy ? "Saving…" : uploading ? "Finishing upload…" : "Save & submit for review"}</button></div>
  </fieldset></form>
}
