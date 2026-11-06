const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 })
export function money(value) { return value === null || value === undefined ? "—" : inr.format(Number(value)) }
export function observedAt(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "Not recorded"
}
export function portion(item) {
  const quantity = item.serving_quantity
  const unit = item.unit || item.unit_code
  return quantity && unit ? `${Number(quantity)} ${unit}${Number(quantity) !== 1 && unit === "piece" ? "s" : ""}${item.portion || item.portion_spec ? ` · ${item.portion || item.portion_spec}` : ""}` : "Portion not established"
}
export const priceStatuses = {
  eligible: { label: "Current verified price", detail: "The latest price has current verification and an exact comparison portion." },
  missing: { label: "Price not recorded", detail: "An administrator has not recorded a price for this offering." },
  unverified: { label: "Awaiting verification", detail: "The latest price needs a source check before it can be compared." },
  stale: { label: "Verification out of date", detail: "A fresh source check is required before this price can be compared." },
  availability_stale: { label: "Availability needs checking", detail: "The latest availability check is outside the freshness window." },
  withdrawn: { label: "Price withdrawn", detail: "The latest price was withdrawn. Earlier prices are not used as a fallback." },
  revoked: { label: "Verification revoked", detail: "The latest verification was revoked. This price is excluded from comparisons." },
  unavailable: { label: "Currently unavailable", detail: "This offering is marked unavailable and is excluded from comparisons." },
  incomparable: { label: "Portion not comparable", detail: "An exact, equivalent portion is needed before this offering can be compared." },
  evidence_missing: { label: "Evidence needs attention", detail: "Current source evidence is unavailable; this price cannot be compared." },
  retired: { label: "Retired", detail: "This offering or a related catalogue entry has been retired." },
}
