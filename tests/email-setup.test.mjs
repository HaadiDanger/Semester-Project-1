import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir, rm, writeFile } from "node:fs/promises"
import { parseEnv } from "node:util"
import { setupGmail, setupResend } from "../scripts/setup-email.mjs"
import { temporaryDirectory } from "./helpers/temp.mjs"

const sender = "sender@example.invalid", appPassword = "abcd efgh ijkl mnop"
const apiKey = "re_test_sending_key", testEmail = "recipient@example.invalid"
async function fixture(t) {
  const directory = await temporaryDirectory("iust-email-")
  t.after(() => rm(directory.path, { recursive: true, force: true }))
  return { directory, file: new URL(".env.local", directory.url) }
}
function smtpDouble(overrides = {}) {
  const calls = []
  return { calls, createTransport(options) {
    calls.push({ action: "connect", options })
    return { verify: async () => { calls.push({ action: "verify" }); await overrides.verify?.() },
      sendMail: async mail => { calls.push({ action: "send", mail }); return overrides.sendMail ? overrides.sendMail(mail) : { accepted: [sender], rejected: [] } },
      close: () => calls.push({ action: "close" }) }
  } }
}

test("Gmail setup requires TLS, checks authentication, sends only to the sender, and saves CLI 3 configuration", async t => {
  const { directory, file } = await fixture(t), smtp = smtpDouble()
  await setupGmail({ email: ` ${sender} `, appPassword, file, createTransport: smtp.createTransport })
  assert.deepEqual(smtp.calls.map(call => call.action), ["connect", "verify", "send", "close"])
  assert.equal(smtp.calls[0].options.requireTLS, true)
  assert.equal(smtp.calls[0].options.auth.pass, "abcdefghijklmnop")
  assert.equal(smtp.calls[2].mail.to, sender)
  assert.equal(smtp.calls[2].mail.from.address, sender)
  assert.equal(JSON.stringify(smtp.calls[2].mail).includes("abcdefghijklmnop"), false)
  const env = parseEnv(await readFile(file, "utf8"))
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_ENABLED, "true")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_HOST, "smtp.gmail.com")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_PORT, "587")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_USER, sender)
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_ADMIN_EMAIL, sender)
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_PASS, "abcdefghijklmnop")
  assert.equal(Object.keys(env).some(key => key.startsWith("VITE_")), false)
  assert.deepEqual(await readdir(directory.path), [".env.local"])
})

test("Gmail setup preserves unrelated configuration and rotates only its managed credentials", async t => {
  const { file } = await fixture(t), smtp = smtpDouble()
  const original = '# Existing operator settings\r\nEXISTING_SETTING="keep this"\r\n'
  await writeFile(file, original)
  await setupGmail({ email: sender, appPassword, file, createTransport: smtp.createTransport })
  await setupGmail({ email: "other@example.invalid", appPassword: "ponmlkjihgfedcba", file, createTransport: smtp.createTransport })
  const contents = await readFile(file, "utf8"), env = parseEnv(contents)
  assert.ok(contents.startsWith(original))
  assert.equal(env.EXISTING_SETTING, "keep this")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_USER, "other@example.invalid")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_PASS, "ponmlkjihgfedcba")
  assert.equal(contents.includes("abcdefghijklmnop"), false)
  assert.equal(contents.match(/SUPABASE_AUTH_EMAIL_SMTP_PASS=/g).length, 1)
})

test("Gmail failures preserve saved settings and do not disclose SMTP errors or passwords", async t => {
  const { directory, file } = await fixture(t)
  const original = "EXISTING_SETTING=keep\n"
  await writeFile(file, original)
  for (const failure of ["EAUTH", "ETIMEDOUT", "OTHER"]) {
    const smtp = smtpDouble({ verify: () => { throw Object.assign(new Error(`private ${appPassword}`), { code: failure }) } })
    await assert.rejects(setupGmail({ email: sender, appPassword, file, createTransport: smtp.createTransport }), error => {
      assert.equal(error.message.includes(appPassword), false)
      return /Gmail/.test(error.message)
    })
    assert.equal(smtp.calls.some(call => call.action === "send"), false)
    assert.equal(smtp.calls.at(-1).action, "close")
    assert.equal(await readFile(file, "utf8"), original)
  }
  const rejected = smtpDouble({ sendMail: () => ({ accepted: [], rejected: [sender] }) })
  await assert.rejects(setupGmail({ email: sender, appPassword, file, createTransport: rejected.createTransport }), /did not accept/)
  assert.equal(await readFile(file, "utf8"), original)
  assert.deepEqual(await readdir(directory.path), [".env.local"])
})

test("Gmail setup rejects invalid inputs and conflicting manual SMTP settings before making network requests", async t => {
  const { file } = await fixture(t), smtp = smtpDouble()
  for (const email of ["not-an-email", "sender@example.invalid\nVITE_SECRET=oops", "person@example.invalid,other@example.invalid"]) {
    await assert.rejects(setupGmail({ email, appPassword, file, createTransport: smtp.createTransport }), /full email address/)
  }
  await assert.rejects(setupGmail({ email: sender, appPassword: "too-short", file, createTransport: smtp.createTransport }), /16-character/)
  for (const contents of ["SUPABASE_AUTH_EMAIL_SMTP_PASS=manually-configured\n", "# BEGIN IUST Connect Gmail SMTP\n"]) {
    await writeFile(file, contents)
    await assert.rejects(setupGmail({ email: sender, appPassword, file, createTransport: smtp.createTransport }), /manually configured|incomplete/)
    assert.equal(await readFile(file, "utf8"), contents)
  }
  assert.equal(smtp.calls.length, 0)
})

test("Resend setup uses implicit TLS and an API key, sends to the chosen inbox, and saves only server SMTP configuration", async t => {
  const { directory, file } = await fixture(t)
  const smtp = smtpDouble({ sendMail: () => ({ accepted: [testEmail], rejected: [] }) })
  await setupResend({ email: ` ${sender} `, apiKey: ` ${apiKey} `, testEmail: ` ${testEmail} `, file, createTransport: smtp.createTransport })
  assert.deepEqual(smtp.calls.map(call => call.action), ["connect", "verify", "send", "close"])
  const transport = smtp.calls[0].options, mail = smtp.calls[2].mail
  assert.equal(transport.host, "smtp.resend.com"); assert.equal(transport.port, 465); assert.equal(transport.secure, true)
  assert.deepEqual(transport.auth, { user: "resend", pass: apiKey })
  assert.equal(transport.logger, false); assert.equal(transport.debug, false)
  assert.deepEqual(mail.from, { name: "IUST Orbit", address: sender }); assert.equal(mail.to, testEmail)
  assert.equal(JSON.stringify(mail).includes(apiKey), false)
  const env = parseEnv(await readFile(file, "utf8"))
  assert.deepEqual(env, {
    SUPABASE_AUTH_EMAIL_SMTP_ENABLED: "true", SUPABASE_AUTH_EMAIL_SMTP_HOST: "smtp.resend.com",
    SUPABASE_AUTH_EMAIL_SMTP_PORT: "465", SUPABASE_AUTH_EMAIL_SMTP_USER: "resend", SUPABASE_AUTH_EMAIL_SMTP_PASS: apiKey,
    SUPABASE_AUTH_EMAIL_SMTP_ADMIN_EMAIL: sender, SUPABASE_AUTH_EMAIL_SMTP_SENDER_NAME: "IUST Orbit",
  })
  assert.deepEqual(await readdir(directory.path), [".env.local"])
})

test("switching from legacy Gmail to Resend and back replaces credentials while preserving surrounding operator settings", async t => {
  const { file } = await fixture(t), smtp = smtpDouble()
  await setupGmail({ email: sender, appPassword, file, createTransport: smtp.createTransport })
  const legacy = (await readFile(file, "utf8")).replaceAll("IUST Orbit SMTP", "IUST Connect Gmail SMTP")
  await writeFile(file, `BEFORE="keep before"\r\n${legacy}\nAFTER="keep after"\n`)
  await setupResend({ email: sender, apiKey, testEmail, file, createTransport: smtp.createTransport })
  let contents = await readFile(file, "utf8"), env = parseEnv(contents)
  assert.equal(env.BEFORE, "keep before"); assert.equal(env.AFTER, "keep after")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_USER, "resend")
  assert.equal(contents.includes("IUST Connect Gmail SMTP"), false)
  assert.equal(contents.includes("abcdefghijklmnop"), false)
  assert.equal(contents.match(/SUPABASE_AUTH_EMAIL_SMTP_PASS=/g).length, 1)
  await setupGmail({ email: sender, appPassword, file, createTransport: smtp.createTransport })
  contents = await readFile(file, "utf8"); env = parseEnv(contents)
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_HOST, "smtp.gmail.com")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_PORT, "587")
  assert.equal(env.SUPABASE_AUTH_EMAIL_SMTP_USER, sender)
  assert.equal(contents.includes(apiKey), false)
  assert.equal(contents.match(/SUPABASE_AUTH_EMAIL_SMTP_PASS=/g).length, 1)
  assert.equal(env.BEFORE, "keep before"); assert.equal(env.AFTER, "keep after")
})

test("Resend authentication and delivery failures preserve the current sender and never disclose provider errors or API keys", async t => {
  const { directory, file } = await fixture(t), gmail = smtpDouble()
  await setupGmail({ email: sender, appPassword, file, createTransport: gmail.createTransport })
  const original = await readFile(file, "utf8")
  for (const failure of ["EAUTH", "ETIMEDOUT", "EENVELOPE"]) {
    const fail = () => { throw Object.assign(new Error(`private provider response ${apiKey}`), { code: failure }) }
    const smtp = smtpDouble(failure === "EENVELOPE" ? { sendMail: fail } : { verify: fail })
    await assert.rejects(setupResend({ email: sender, apiKey, testEmail, file, createTransport: smtp.createTransport }), error => {
      assert.equal(error.message.includes(apiKey), false)
      assert.equal(error.message.includes("private provider response"), false)
      return /Resend/.test(error.message)
    })
    assert.equal(smtp.calls.at(-1).action, "close")
    assert.equal(await readFile(file, "utf8"), original)
  }
  const rejected = smtpDouble({ sendMail: () => ({ accepted: [], rejected: [testEmail] }) })
  await assert.rejects(setupResend({ email: sender, apiKey, testEmail, file, createTransport: rejected.createTransport }), /Resend did not accept/)
  assert.equal(await readFile(file, "utf8"), original)
  assert.deepEqual(await readdir(directory.path), [".env.local"])
})

test("Resend input and configuration conflicts are rejected before contacting SMTP", async t => {
  const { file } = await fixture(t), smtp = smtpDouble()
  const input = { email: sender, apiKey, testEmail, file, createTransport: smtp.createTransport }
  for (const invalid of ["not-an-email", "sender@example.invalid\nVITE_SECRET=oops", "person@example.invalid,other@example.invalid"]) {
    await assert.rejects(setupResend({ ...input, email: invalid }), /full email address/)
    await assert.rejects(setupResend({ ...input, testEmail: invalid }), /single test recipient/)
  }
  for (const invalid of ["", "not-an-api-key", "re_key\nVITE_SECRET=oops"]) {
    await assert.rejects(setupResend({ ...input, apiKey: invalid }), /Resend API key/)
  }
  for (const contents of [
    "SUPABASE_AUTH_EMAIL_SMTP_PASS=manually-configured\n", "# BEGIN IUST Orbit SMTP\n",
    "# BEGIN IUST Connect Gmail SMTP\n# END IUST Connect Gmail SMTP\n# BEGIN IUST Orbit SMTP\n# END IUST Orbit SMTP\n",
    "# BEGIN IUST Orbit SMTP\n# END IUST Orbit SMTP\n# BEGIN IUST Orbit SMTP\n# END IUST Orbit SMTP\n",
  ]) {
    await writeFile(file, contents)
    await assert.rejects(setupResend(input), /manually configured|incomplete|multiple managed|repeated/)
    assert.equal(await readFile(file, "utf8"), contents)
  }
  assert.equal(smtp.calls.length, 0)
})
