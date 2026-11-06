import { unlink } from "node:fs/promises"
import { connectDevTarget, rpc } from "./lib/dev-target.mjs"
import { SEED_BATCH } from "./fixtures/profiles.mjs"
import { isMain, readManifest, verifyFixtureAccount } from "./lib/fixture-manifest.mjs"

export async function cleanupDevelopment({ confirm = process.argv.includes("--confirm=delete-local-samples"), connect = connectDevTarget,
  directory = new URL("../.dev-seed/", import.meta.url), log = console.log } = {}) {
if (!confirm) throw new Error("Pass --confirm=delete-local-samples to remove this fixture batch only.")
const target = await connect()
const manifestPath = new URL("accounts.json", directory)
const local = await readManifest(manifestPath, target)
const args = { p_instance_id: target.instanceId, p_batch_id: SEED_BATCH }
const inventory = await rpc(target.service, "dev_fixture_inventory", args)
for (const user of inventory.users) verifyFixtureAccount(user, user.app_metadata?.fixture_key, local?.accounts[user.app_metadata?.fixture_key])
const manifest = await rpc(target.service, "dev_cleanup_fixture_data", args)
if (manifest.users.some(user => !inventory.users.some(item => item.id === user.id && item.email === user.email))) throw new Error("Fixture inventory changed during cleanup. Retry from the target checks.")
for (const asset of manifest.assets) {
  const quarantine = await target.service.storage.from("upload-quarantine").remove([asset.quarantine_path])
  if (quarantine.error) throw quarantine.error
  if (asset.bucket && asset.path) {
    const final = await target.service.storage.from(asset.bucket).remove([asset.path])
    if (final.error) throw final.error
  }
}
await rpc(target.service, "dev_finalize_fixture_cleanup", args)
for (const user of manifest.users) {
  const { error } = await target.service.auth.admin.deleteUser(user.id)
  if (error) throw error
}
await unlink(manifestPath).catch(error => { if (error.code !== "ENOENT") throw error })
log(`Removed fixture batch ${SEED_BATCH}: ${manifest.users.length} Auth users and ${manifest.assets.length} assets. Other data was preserved.`)
return { users: manifest.users.length, assets: manifest.assets.length }
}
if (isMain(import.meta.url)) await cleanupDevelopment()
