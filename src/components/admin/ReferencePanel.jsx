import { useState } from "react"
import { useApp } from "../../context/app"
import { useAuth } from "../../context/auth"
import { useMutation, useRpc } from "../../hooks/useRpc"
import { portion } from "../../utils/prices"
import Field from "../Field"
import Modal from "../Modal"
import { ErrorState, LoadingState } from "../AsyncState"
import { MutationError } from "./AdminShared"
import { referenceSchema } from "./referenceSchema"

function labelFor(item, table, refs) {
  if (table === "canteen_offerings") return `${refs.canteens?.find(row => row.id === item.canteen_id)?.name || "Canteen"} · ${refs.menu_items?.find(row => row.id === item.menu_item_id)?.name || "Item"}`
  if (table === "menu_items") return `${item.name} · ${item.variant || "standard"} · ${portion(item)}`
  return item.name
}
function ReferenceEditor({ table, row, refs, onSaved, onClose }) {
  const schema = referenceSchema[table]
  const [form, setForm] = useState(() => Object.fromEntries(schema.fields.map(field => [field.key, row?.[field.key] ?? field.initial ?? ""])))
  const [reason, setReason] = useState("")
  const mutation = useMutation()
  async function save(event) {
    event.preventDefault()
    const data = Object.fromEntries(schema.fields.map(field => [field.key, field.type === "number" ? form[field.key] === "" ? null : Number(form[field.key]) : field.nullable && !form[field.key] ? null : form[field.key]]))
    if (table === "programmes" && data.stage_unit === "none") data.stage_count = null
    try { await mutation.run("admin_save_reference", { p_table: table, p_id: row?.id || null, p_data: data, p_expected_updated_at: row?.updated_at || null, p_reason: reason }); onSaved(); onClose() }
    catch { /* The database returns validation or version errors below. */ }
  }
  return <Modal title={`${row ? "Edit" : "Add"} ${schema.label.toLowerCase()}`} onClose={() => !mutation.busy && onClose()}><form className="space-y-5" onSubmit={save}>
    <p className="muted text-sm">{table === "menu_items" ? "Once an item has price history, its comparison identity is fixed. Create another item for a different variant or portion." : "Use owner-supplied, accurate references. Retiring an entry preserves its history."}</p>
    <fieldset disabled={mutation.busy} className="space-y-5">{schema.fields.map(field => {
      const value = form[field.key]
      const update = value => setForm(current => ({ ...current, [field.key]: value }))
      if (field.type === "checkbox") return <div key={field.key}><label className="checkbox-label"><input type="checkbox" checked={Boolean(value)} onChange={event => update(event.target.checked)} />{field.label}</label>{field.help && <p className="muted text-xs mt-2">{field.help}</p>}</div>
      return <Field key={field.key} label={field.label} help={field.help}>{field.collection || field.options ? <select className="field-input" value={value} required={field.required || field.key === "stage_unit"} onChange={event => update(event.target.value)}>
        <option value="">Select…</option>{field.collection ? refs[field.collection]?.map(item => <option key={item.id} value={item.id}>{labelFor(item, field.collection, refs)}{!item.is_active ? " (retired)" : ""}</option>) : field.options.map(item => <option key={item} value={item}>{item}</option>)}
      </select> : field.type === "textarea" ? <textarea className="field-input" rows={3} value={value} maxLength={field.max} onChange={event => update(event.target.value)} /> : <input className="field-input" type={field.type || "text"} value={value} required={field.required || field.key === "stage_count" && form.stage_unit !== "none"} disabled={field.key === "stage_count" && form.stage_unit === "none"} min={field.min} max={field.type === "number" ? field.max : undefined} maxLength={field.type === "number" ? undefined : field.max} step={field.step || 1} onChange={event => update(event.target.value)} />}</Field>
    })}
      <Field label="Source / reason for this change"><textarea className="field-input" rows={2} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy}>{mutation.busy ? "Saving…" : "Save reference"}</button>
    </fieldset>
  </form></Modal>
}
function MergeEditor({ table, source, refs, onClose, onSaved }) {
  const [target, setTarget] = useState("")
  const [reason, setReason] = useState("")
  const mutation = useMutation()
  async function submit(event) {
    event.preventDefault()
    try { await mutation.run("admin_merge_taxonomy", { p_table: table, p_source: source.id, p_target: target, p_reason: reason }); onSaved(); onClose() } catch { /* Inline error. */ }
  }
  return <Modal title={`Merge ${source.name}`} onClose={() => !mutation.busy && onClose()}><form className="space-y-5" onSubmit={submit}><p className="muted text-sm">Move existing associations to the selected active entry and retire this duplicate. Skill names are retained as searchable aliases.</p>
    <Field label="Merge into"><select className="field-input" required value={target} onChange={event => setTarget(event.target.value)}><option value="">Select target</option>{refs[table]?.filter(item => item.id !== source.id && item.is_active && item.is_sample === source.is_sample).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Merge reason"><textarea className="field-input" rows={3} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><MutationError mutation={mutation} /><button className="btn btn-primary" disabled={mutation.busy}>Merge & retire duplicate</button>
  </form></Modal>
}
export default function ReferencePanel() {
  const { account } = useAuth()
  const { references, showToast } = useApp()
  const result = useRpc("get_reference_data", { p_include_inactive: true })
  const [table, setTable] = useState("departments")
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState(null)
  const [merging, setMerging] = useState(null)
  function changed() { result.refresh(); references.refresh(); showToast("Reference changes saved.") }
  const refs = result.data || {}
  const items = (refs[table] || []).filter(item => (!account.is_sample || item.is_sample) && labelFor(item, table, refs).toLowerCase().includes(query.toLowerCase()))
  return <section><h2 className="form-heading">Reference data & availability</h2><p className="muted text-sm mt-2">Maintain academic choices, inclusive skills, and the canteen catalogue. Production starts without assumed university references or prices.</p>
    <div className="admin-filters mt-5"><Field label="Collection"><select className="field-input" value={table} onChange={event => { setTable(event.target.value); setQuery("") }}>{Object.entries(referenceSchema).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></Field><Field label="Filter this collection"><input type="search" className="field-input" value={query} maxLength={160} onChange={event => setQuery(event.target.value)} /></Field><button className="btn btn-primary" onClick={() => setEditing({ row: null, table })}>Add entry</button><button className="btn btn-secondary" onClick={result.refresh}>Refresh</button></div>
    {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : result.loading && !result.data ? <LoadingState /> : <div className="admin-table-wrap mt-5"><table className="admin-table"><caption>{items.length} {referenceSchema[table].label.toLowerCase()}</caption><thead><tr><th scope="col">Reference</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{labelFor(item, table, refs)}{item.is_sample && <span className="sample-badge ml-2">Sample</span>}{table === "canteen_offerings" && <p className="muted text-xs mt-1">{item.is_available ? "Available" : "Unavailable"}</p>}</td><td>{item.is_active ? "Active" : "Retired"}</td><td><div className="table-actions"><button className="text-link" onClick={() => setEditing({ row: item, table })}>Edit</button>{["skills", "skill_categories"].includes(table) && item.is_active && <button className="text-link" onClick={() => setMerging({ source: item, table })}>Merge</button>}</div></td></tr>)}</tbody></table>{!items.length && <p className="muted p-5 text-sm">No entries yet.</p>}</div>}
    {editing && <ReferenceEditor table={editing.table} row={editing.row} refs={refs} onSaved={changed} onClose={() => setEditing(null)} />}
    {merging && <MergeEditor table={merging.table} source={merging.source} refs={refs} onSaved={changed} onClose={() => setMerging(null)} />}
  </section>
}
