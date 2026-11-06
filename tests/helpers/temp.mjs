import { mkdir, mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

export async function temporaryDirectory(prefix) {
  const root = process.platform === "win32" ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : join(tmpdir(), "opencode")
  await mkdir(root, { recursive: true })
  const path = await mkdtemp(join(root, prefix))
  return { path, url: pathToFileURL(path + "/") }
}
