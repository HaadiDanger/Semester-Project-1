import { readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"
import { parseEnv } from "node:util"
import nodemailer from "nodemailer"

// Stable markers let reruns find SMTP settings saved before the IUST Orbit rename.
const startMarker = "# BEGIN IUST Connect Gmail SMTP"
const endMarker = "# END IUST Connect Gmail SMTP"
const smtpPrefix = "SUPABASE_AUTH_EMAIL_SMTP_"

async function readConfiguration(file) {
  try { return await readFile(file, "utf8") }
  catch (error) { if (error.code === "ENOENT") return ""; throw error }
}

function environmentFile(existing, email, password) {
  const start = existing.indexOf(startMarker), end = existing.indexOf(endMarker)
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error("The Gmail configuration markers in supabase/.env.local are incomplete. Repair that block before running setup again.")
  const before = start < 0 ? existing : existing.slice(0, start)
  const after = end < 0 ? "" : existing.slice(end + endMarker.length)
  if (Object.keys(parseEnv(before + after)).some(key => key.startsWith(smtpPrefix))) {
    throw new Error("supabase/.env.local already contains manually configured SMTP settings. Keep those settings together in the managed Gmail block or edit them directly.")
  }
  const values = { ENABLED: "true", HOST: "smtp.gmail.com", PORT: "587", USER: email, PASS: password, ADMIN_EMAIL: email, SENDER_NAME: "IUST Orbit" }
  const block = [startMarker, ...Object.entries(values).map(([key, value]) => `${smtpPrefix}${key}=${JSON.stringify(value)}`), endMarker].join("\n")
  return start < 0 ? `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}\n` : before + block + after
}

function smtpError(error) {
  if (error.code === "EAUTH") return new Error("Gmail rejected the login. Enable Google 2-Step Verification and use a fresh 16-character app password from https://myaccount.google.com/apppasswords.")
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS"].includes(error.code)) return new Error("Could not reach Gmail securely on smtp.gmail.com:587. Check your connection and outbound SMTP access, then retry.")
  return new Error("Gmail did not accept the setup email. Check the account's sending limits and app password, then retry.")
}

export async function setupGmail({ email, appPassword, file = new URL("../supabase/.env.local", import.meta.url), createTransport = nodemailer.createTransport }) {
  email = email?.trim()
  const password = appPassword?.replace(/\s/g, "")
  if (!email || email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email)) throw new Error("Enter the full email address of your Gmail or Google Workspace sender.")
  if (!/^[a-z0-9]{16}$/i.test(password || "")) throw new Error("Enter Google's 16-character app password. Spaces between its groups are accepted.")
  const original = await readConfiguration(file)
  const contents = environmentFile(original, email, password)
  const transport = createTransport({ host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true,
    auth: { user: email, pass: password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    logger: false, debug: false })
  try {
    await transport.verify()
    const result = await transport.sendMail({ from: { name: "IUST Orbit", address: email }, to: email,
      subject: "IUST Orbit email delivery test",
      text: "Your IUST Orbit Gmail sender is working.\n\nAfter setup completes, restart local Supabase to apply the settings. Signup confirmations and password-reset emails will then be sent through this Gmail account.\n\nYour campus. Your skills. Your services." })
    if (!result.accepted?.length || result.rejected?.length) throw new Error("Setup email was not accepted")
  } catch (error) { throw smtpError(error) }
  finally { transport.close() }

  // Replace only this setup command's block, preserving other operator settings.
  if (await readConfiguration(file) !== original) throw new Error("supabase/.env.local changed during setup. Run setup again to keep the latest settings.")
  const temporary = new URL(`.env.gmail-${randomUUID()}.local`, file)
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 })
    await rename(temporary, file)
  } finally { await rm(temporary, { force: true }) }
}

async function credentials() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run npm run email:setup in your own interactive terminal to enter Gmail credentials privately.")
  let hidden = false
  const output = new Writable({ write(chunk, encoding, done) { if (!hidden) process.stdout.write(chunk, encoding); done() } })
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 })
  const controller = new AbortController()
  terminal.on("SIGINT", () => controller.abort())
  try {
    const email = await terminal.question("Gmail sending address: ", { signal: controller.signal })
    process.stdout.write("Google app password (input hidden): ")
    hidden = true
    const appPassword = await terminal.question("", { signal: controller.signal })
    return { email, appPassword }
  } finally { hidden = false; terminal.close(); process.stdout.write("\n") }
}

if (import.meta.main) {
  try {
    console.log("Set up Gmail for IUST Orbit confirmation and password-reset emails.\nCreate a Google app password at https://myaccount.google.com/apppasswords (requires 2-Step Verification).")
    const values = await credentials()
    console.log("Checking Gmail and sending one setup email to the sending address…")
    await setupGmail(values)
    console.log("Gmail accepted the setup email. Settings saved in ignored supabase/.env.local.\n\nApply the settings:\n  npx supabase stop\n  npx supabase start\n\nThen restart your Edge Functions terminal. See docs/email.md for the end-to-end check.")
  } catch (error) { console.error(error.name === "AbortError" ? "Email setup cancelled." : error.message); process.exitCode = 1 }
}
