import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir, rm, writeFile } from "node:fs/promises"
import { parseEnv } from "node:util"
import { setupGmail } from "../scripts/setup-email.mjs"
import { temporaryDirectory } from "./helpers/temp.mjs"

const sender = "sender@example.invalid", appPassword = "abcd efgh ijkl mnop"
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
