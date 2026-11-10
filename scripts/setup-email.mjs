import { readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"
import { parseArgs, parseEnv } from "node:util"
import nodemailer from "nodemailer"

const startMarker = "# BEGIN IUST Orbit SMTP"
const endMarker = "# END IUST Orbit SMTP"
// Recognize settings saved by the original Gmail setup when switching providers.
const markers = [[startMarker, endMarker], ["# BEGIN IUST Connect Gmail SMTP", "# END IUST Connect Gmail SMTP"]]
const smtpPrefix = "SUPABASE_AUTH_EMAIL_SMTP_"
const providers = {
  gmail: { name: "Gmail", host: "smtp.gmail.com", port: 587, secure: false },
  resend: { name: "Resend", host: "smtp.resend.com", port: 465, secure: true },
}
const validEmail = value => typeof value === "string" && value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value)

async function readConfiguration(file) {
  try { return await readFile(file, "utf8") }
  catch (error) { if (error.code === "ENOENT") return ""; throw error }
}

function environmentFile(existing, { host, port, user, email, password }) {
  const present = markers.filter(pair => pair.some(marker => existing.includes(marker)))
  if (present.length > 1) throw new Error("supabase/.env.local contains multiple managed SMTP blocks. Keep one complete block before running setup again.")
  const [savedStart, savedEnd] = present[0] || markers[0]
  const start = existing.indexOf(savedStart), end = existing.indexOf(savedEnd)
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || existing.indexOf(savedStart, start + 1) >= 0 || existing.indexOf(savedEnd, end + 1) >= 0))) {
    throw new Error("The SMTP configuration markers in supabase/.env.local are incomplete or repeated. Repair that block before running setup again.")
  }
  const before = start < 0 ? existing : existing.slice(0, start)
  const after = end < 0 ? "" : existing.slice(end + savedEnd.length)
  if (Object.keys(parseEnv(before + after)).some(key => key.startsWith(smtpPrefix))) {
    throw new Error("supabase/.env.local already contains manually configured SMTP settings. Keep those settings together in the managed SMTP block or edit them directly.")
  }
  const values = { ENABLED: "true", HOST: host, PORT: String(port), USER: user, PASS: password, ADMIN_EMAIL: email, SENDER_NAME: "IUST Orbit" }
  const block = [startMarker, ...Object.entries(values).map(([key, value]) => `${smtpPrefix}${key}=${JSON.stringify(value)}`), endMarker].join("\n")
  return start < 0 ? `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}\n` : before + block + after
}

function smtpError(error, provider) {
  const { name, host, port } = providers[provider]
  if (error.code === "EAUTH") return new Error(provider === "resend"
    ? "Resend rejected the login. Use an active Resend API key with sending access to your verified domain."
    : "Gmail rejected the login. Enable Google 2-Step Verification and use a fresh 16-character app password from https://myaccount.google.com/apppasswords.")
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS"].includes(error.code)) return new Error(`Could not reach ${name} securely on ${host}:${port}. Check your connection and outbound SMTP access, then retry.`)
  return new Error(provider === "resend"
    ? "Resend did not accept the setup email. Check the sender's verified domain, API key permissions, test recipient and sending limits in Resend."
    : "Gmail did not accept the setup email. Check the account's sending limits and app password, then retry.")
}

export async function setupGmail({ email, appPassword, file, createTransport }) {
  email = email?.trim()
  const password = appPassword?.replace(/\s/g, "")
  if (!validEmail(email)) throw new Error("Enter the full email address of your Gmail or Google Workspace sender.")
  if (!/^[a-z0-9]{16}$/i.test(password || "")) throw new Error("Enter Google's 16-character app password. Spaces between its groups are accepted.")
  return setupSmtp({ provider: "gmail", email, user: email, password, recipient: email, file, createTransport })
}

export async function setupResend({ email, apiKey, testEmail, file, createTransport }) {
  email = email?.trim()
  testEmail = testEmail?.trim()
  const password = apiKey?.trim()
  if (!validEmail(email)) throw new Error("Enter the full email address of a sender on your verified Resend domain.")
  if (!validEmail(testEmail)) throw new Error("Enter a single test recipient email address whose inbox you can check.")
  if (!password || password.length > 512 || !/^re_[a-z0-9_-]+$/i.test(password)) throw new Error("Enter a Resend API key beginning with re_.")
  return setupSmtp({ provider: "resend", email, user: "resend", password, recipient: testEmail, file, createTransport })
}

async function setupSmtp({ provider, email, user, password, recipient, file = new URL("../supabase/.env.local", import.meta.url), createTransport = nodemailer.createTransport }) {
  const { name, host, port, secure } = providers[provider]
  const original = await readConfiguration(file)
  const contents = environmentFile(original, { host, port, user, email, password })
  const transport = createTransport({ host, port, secure, requireTLS: true,
    auth: { user, pass: password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    logger: false, debug: false })
  try {
    await transport.verify()
    const result = await transport.sendMail({ from: { name: "IUST Orbit", address: email }, to: recipient,
      subject: "IUST Orbit email delivery test",
      text: `This is your IUST Orbit ${name} delivery test.\n\nAfter setup completes, restart local Supabase to apply the settings. Signup confirmations and password-reset emails will then be sent through ${name}.` })
    if (!result.accepted?.length || result.rejected?.length) throw new Error("Setup email was not accepted")
  } catch (error) { throw smtpError(error, provider) }
  finally { transport.close() }

  // Replace only this setup command's block, preserving other operator settings.
  if (await readConfiguration(file) !== original) throw new Error("supabase/.env.local changed during setup. Run setup again to keep the latest settings.")
  const temporary = new URL(`.env.smtp-${randomUUID()}.local`, file)
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 })
    await rename(temporary, file)
  } finally { await rm(temporary, { force: true }) }
}

async function credentials(provider) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`Run npm run email:setup -- --provider ${provider} in your own interactive terminal to enter credentials privately.`)
  let hidden = false
  const output = new Writable({ write(chunk, encoding, done) { if (!hidden) process.stdout.write(chunk, encoding); done() } })
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 })
  const controller = new AbortController()
  terminal.on("SIGINT", () => controller.abort())
  try {
    const email = await terminal.question(provider === "resend" ? "Sender email on your verified Resend domain: " : "Gmail sending address: ", { signal: controller.signal })
    const testEmail = provider === "resend" ? await terminal.question("Test recipient (an inbox you can check): ", { signal: controller.signal }) : email
    process.stdout.write(provider === "resend" ? "Resend API key (input hidden): " : "Google app password (input hidden): ")
    hidden = true
    const password = await terminal.question("", { signal: controller.signal })
    return provider === "resend" ? { email, testEmail, apiKey: password } : { email, appPassword: password }
  } finally { hidden = false; terminal.close(); process.stdout.write("\n") }
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: { provider: { type: "string", default: "gmail" }, help: { type: "boolean", short: "h" } } })
    if (!Object.hasOwn(providers, values.provider)) throw new Error("Choose --provider resend or --provider gmail.")
    if (values.help) {
      console.log("Usage: npm run email:setup -- --provider resend|gmail\n\nResend: verified-domain sender, a test recipient and a Resend API key.\nGmail (default): Gmail address and a Google app password.\nCredentials are entered privately and saved server-side after a setup email is accepted. See docs/email.md.")
    } else {
      const { name } = providers[values.provider]
      console.log(`Set up ${name} for IUST Orbit confirmation and password-reset emails.\n` + (values.provider === "resend"
        ? "Verify your sending domain at https://resend.com/domains and create a sending API key at https://resend.com/api-keys."
        : "Create a Google app password at https://myaccount.google.com/apppasswords (requires 2-Step Verification)."))
      const input = await credentials(values.provider)
      console.log(`Checking ${name} and sending one setup email to ${values.provider === "resend" ? "the test recipient" : "the sending address"}…`)
      await (values.provider === "resend" ? setupResend(input) : setupGmail(input))
      console.log(`${name} accepted the setup email. Check the recipient's inbox and spam folder. Settings saved in ignored supabase/.env.local.\n\nApply the settings:\n  npx supabase stop\n  npx supabase start\n\nThen restart your Edge Functions terminal. See docs/email.md for the end-to-end check.`)
    }
  } catch (error) { console.error(error.name === "AbortError" ? "Email setup cancelled." : error.message); process.exitCode = 1 }
}
