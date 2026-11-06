import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { categories, profiles, SEED_BATCH } from "../fixtures/profiles.mjs"
import { canteenCases } from "../fixtures/canteens.mjs"

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export const DATASET_HASH = hash({ version: 1, categories, profiles, canteenCases })
export const FIXTURES = Object.fromEntries([
  ["sample-admin", { hash: hash({ key: "sample-admin", role: "admin", dataset: DATASET_HASH }) }],
  ...profiles.map(profile => [profile.key, { hash: hash(profile) }]),
].map(([key, value]) => [key, { ...value, email: `${key}-${SEED_BATCH.slice(0, 8)}@iust-connect.example.invalid` }]))
export const isMain = url => process.argv[1] && url === pathToFileURL(process.argv[1]).href

export async function readManifest(path, target) {
  let manifest
  try { manifest = JSON.parse(await readFile(path, "utf8")) }
  catch (error) { if (error.code !== "ENOENT") throw error; return null }
  if (manifest.instanceId !== target.instanceId || manifest.batchId !== SEED_BATCH || manifest.datasetHash !== DATASET_HASH
    || !Number.isFinite(Date.parse(manifest.seededAt)) || !manifest.accounts || Array.isArray(manifest.accounts)
    || manifest.includeCanteens !== undefined && typeof manifest.includeCanteens !== "boolean") {
    throw new Error("Existing fixture manifest belongs to a different instance, batch or dataset. Preserve it and use the matching target and fixture revision.")
  }
  for (const [key, record] of Object.entries(manifest.accounts)) {
    if (!FIXTURES[key] || record.email !== FIXTURES[key].email || record.fixtureHash !== FIXTURES[key].hash
      || typeof record.password !== "string" || record.password.length < 24 || (record.id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(record.id))) {
      throw new Error(`Fixture credentials for ${key} do not match the protected manifest.`)
    }
  }
  return manifest
}
export async function writeManifest(path, manifest) {
  const pending = new URL("accounts.pending.json", path)
  await writeFile(pending, JSON.stringify(manifest, null, 2), { mode: 0o600 })
  await rename(pending, path)
}
export function verifyFixtureAccount(user, key, record) {
  const meta = user.app_metadata
  if (!FIXTURES[key] || user.email !== FIXTURES[key].email || meta?.iust_connect_fixture !== true || meta.seed_batch_id !== SEED_BATCH
    || meta.fixture_key !== key || meta.fixture_hash !== FIXTURES[key].hash || record?.id && record.id !== user.id) {
    throw new Error(`Auth account ${key || "(unknown)"} does not match its exact fixture UUID, email and protected metadata. Existing data was preserved.`)
  }
}
