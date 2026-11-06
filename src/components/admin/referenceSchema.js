const name = (max = 120) => ({ key: "name", label: "Name", required: true, max })
const active = { key: "is_active", label: "Active (uncheck to retire)", type: "checkbox", initial: true }
const order = { key: "display_order", label: "Display order", type: "number", initial: 0, min: 0, max: 1000 }
export const referenceSchema = {
  departments: { label: "Departments", fields: [name(), active] },
  programmes: { label: "Programmes", fields: [name(), { key: "department_id", label: "Department", collection: "departments", required: true },
    { key: "stage_unit", label: "Stage unit", options: ["semester", "year", "none"], initial: "semester" },
    { key: "stage_count", label: "Number of semesters / years", type: "number", min: 1, max: 20, help: "Required unless the stage unit is none. Use the actual programme structure." }, active] },
  skill_categories: { label: "Skill categories", fields: [name(80), order, active] },
  skills: { label: "Skills", fields: [name(80), { key: "category_id", label: "Category", collection: "skill_categories", required: true }, active] },
  food_categories: { label: "Food categories", fields: [name(80), order, active] },
  menu_items: { label: "Menu items & portions", fields: [name(), { key: "food_category_id", label: "Food category", collection: "food_categories", required: true },
    { key: "variant", label: "Variant / preparation", max: 80 }, { key: "serving_quantity", label: "Exact serving quantity", type: "number", min: .001, max: 9999999.999, step: .001 },
    { key: "unit_code", label: "Serving unit", options: ["piece", "g", "ml", "portion"], nullable: true },
    { key: "portion_spec", label: "Exact portion description", type: "textarea", max: 200, help: "Required for a portion unit; e.g. specify all included components. Do not treat unknown sizes as equivalent." },
    { key: "is_comparable", label: "This portion is precisely defined and comparable", type: "checkbox", initial: false }, active] },
  canteens: { label: "Canteens", fields: [name(), { key: "location_description", label: "Location description", type: "textarea", max: 300 }, active] },
  canteen_offerings: { label: "Canteen offerings & availability", fields: [
    { key: "canteen_id", label: "Canteen", collection: "canteens", required: true },
    { key: "menu_item_id", label: "Menu item", collection: "menu_items", required: true },
    { key: "canteen_item_label", label: "Canteen's own item label (optional)", max: 120 },
    { key: "is_available", label: "I have checked: this offering is currently available", type: "checkbox", initial: false, help: "Saving records this availability check at the current time. Price verification is separate." }, active] },
}
