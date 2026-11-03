import { cloneElement, useId, useState } from "react"
import { Plus, X } from "lucide-react"
import { departments, programs } from "../data/profiles"
import Avatar from "./Avatar"

const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year", "Graduate"]

export default function ProfileForm({ initialProfile, onSaveDraft, onPublish }) {
  const [form, setForm] = useState(initialProfile)
  const [skillInput, setSkillInput] = useState("")
  const [errors, setErrors] = useState({})

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateProject(field, value) {
    setForm((current) => ({
      ...current,
      projects: [
        {
          ...current.projects[0],
          [field]: value,
        },
      ],
    }))
  }

  function addSkill() {
    const skill = skillInput.trim()
    if (!skill) return
    if (form.skills.includes(skill)) {
      setSkillInput("")
      return
    }
    update("skills", [...form.skills, skill])
    setSkillInput("")
  }

  function removeSkill(skill) {
    update(
      "skills",
      form.skills.filter((item) => item !== skill),
    )
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setErrors((current) => ({ ...current, image: "Please choose an image file." }))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      update("image", reader.result)
      setErrors((current) => ({ ...current, image: "" }))
    }
    reader.readAsDataURL(file)
  }

  function validate() {
    const nextErrors = {}
    if (!form.name.trim()) nextErrors.name = "Please enter your name."
    if (!form.program) nextErrors.program = "Please choose a programme."
    if (!form.department) nextErrors.department = "Please choose a department."
    if (!form.bio.trim()) nextErrors.bio = "Please add a short bio."
    if (form.skills.length === 0) nextErrors.skills = "Add at least one skill."
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function handlePublish(event) {
    event.preventDefault()
    if (!validate()) return
    onPublish({
      ...form,
      about: form.about.trim() || form.bio.trim(),
    })
  }

  const project = form.projects[0] || { title: "", description: "", link: "" }

  return (
    <form onSubmit={handlePublish} className="profile-form space-y-8">
      <section className="glass-card rounded-2xl p-5 sm:p-7">
        <h2 className="form-heading">Photo</h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={form.name || "You"} image={form.image} size="lg" />
          <div>
            <label className="upload-label inline-flex cursor-pointer rounded-lg px-3.5 py-2 text-sm">
              Upload photo
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhoto} />
            </label>
            <p className="mt-2 text-xs editor-help">
              Stays on this browser only. Nothing is uploaded to a server.
            </p>
            {errors.image ? <p className="mt-2 text-xs form-error">{errors.image}</p> : null}
          </div>
        </div>
      </section>

      <section className="glass-card space-y-4 rounded-2xl p-5 sm:p-7">
        <h2 className="form-heading">About you</h2>

        <Field label="Full name" error={errors.name}>
          <input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            className="field-input"
            placeholder="Your name"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Programme" error={errors.program}>
            <select
              value={form.program}
              onChange={(event) => update("program", event.target.value)}
              className="field-input"
            >
              <option value="">Select programme</option>
              {programs.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Department" error={errors.department}>
            <select
              value={form.department}
              onChange={(event) => update("department", event.target.value)}
              className="field-input"
            >
              <option value="">Select department</option>
              {departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Semester / year">
          <select
            value={form.year}
            onChange={(event) => update("year", event.target.value)}
            className="field-input"
          >
            <option value="">Select year</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Short bio" error={errors.bio}>
          <textarea
            rows={3}
            value={form.bio}
            onChange={(event) => update("bio", event.target.value)}
            className="field-input resize-y"
            placeholder="One or two sentences about your work."
          />
        </Field>

        <Field label="About me">
          <textarea
            rows={5}
            value={form.about}
            onChange={(event) => update("about", event.target.value)}
            className="field-input resize-y"
            placeholder="A longer note on what you like to build or study."
          />
        </Field>
      </section>

      <section className="glass-card rounded-2xl p-5 sm:p-7">
        <h2 className="form-heading">Skills</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {form.skills.map((skill) => (
            <button
              key={skill}
              aria-label={`Remove ${skill}`}
              type="button"
              onClick={() => removeSkill(skill)}
              className="skill-tag items-center gap-1.5"
            >
              {skill}
              <X size={12} />
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={skillInput}
            onChange={(event) => setSkillInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addSkill()
              }
            }}
            className="field-input"
            aria-label="Add a skill"
            placeholder="Add a skill, then press Enter"
          />
          <button
            type="button"
            onClick={addSkill}
            className="btn btn-secondary shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {errors.skills ? <p className="mt-2 text-xs form-error">{errors.skills}</p> : null}
      </section>

      <section className="glass-card space-y-4 rounded-2xl p-5 sm:p-7">
        <h2 className="form-heading">Portfolio</h2>
        <Field label="Project title">
          <input
            value={project.title}
            onChange={(event) => updateProject("title", event.target.value)}
            className="field-input"
            placeholder="A project you are proud of"
          />
        </Field>
        <Field label="Project description">
          <textarea
            rows={3}
            value={project.description}
            onChange={(event) => updateProject("description", event.target.value)}
            className="field-input resize-y"
            placeholder="What did you make, and for whom?"
          />
        </Field>
        <Field label="Project link">
          <input
            value={project.link}
            onChange={(event) => updateProject("link", event.target.value)}
            className="field-input"
            placeholder="https://"
          />
        </Field>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => onSaveDraft(form)}
          className="btn btn-secondary"
        >
          Save Draft
        </button>
        <button
          type="submit"
          className="btn btn-primary"
        >
          Publish Profile
        </button>
      </div>
    </form>
  )
}

function Field({ label, error, children }) {
  const id = useId()
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1.5 block text-sm editor-label">{label}</label>
      {cloneElement(children, { id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined })}
      {error ? <span id={`${id}-error`} className="mt-1.5 block text-xs form-error">{error}</span> : null}
    </div>
  )
}
