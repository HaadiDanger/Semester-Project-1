import { test, expect } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { createBrowserBackend } from "./backend.mjs"
import { rpc } from "../helpers/database.mjs"
import { sampleEvidence } from "../../scripts/fixtures/sample-evidence.mjs"
import { saveProfile } from "../helpers/records.mjs"
import { attachMotion, effects, recordMotion, translations } from "./motion.mjs"
import { settleCards, textContrast } from "./design.mjs"

let backend
test.beforeAll(async () => { backend = await createBrowserBackend() })
test.afterAll(async () => { await backend?.close() })
test.beforeEach(async ({ context, page }) => {
  backend.errors.length = 0; backend.failNext.clear(); backend.beforeReply = null
  await backend.attach(context)
  page.on("pageerror", error => backend.errors.push(error.message))
})
test.afterEach(() => { expect(backend.errors).toEqual([]) })

async function signIn(page, account, next = "/my-profile") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`)
  await page.getByLabel("Email address", { exact: true }).fill(account.email)
  await page.getByLabel("Password", { exact: true }).fill(account.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, "\\?")}$`))
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
}
async function settled(page) {
  await expect(page.locator(".loading-state")).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator("#main-content > div")).toHaveCSS("opacity", "1")
  if (await page.locator(".hero-art").count()) await expect(page.locator(".hero-art")).toHaveCSS("opacity", "1")
  if (await page.locator("#main-content > div > article").count()) await expect(page.locator("#main-content > div > article")).toHaveCSS("opacity", "1")
}

test("[mocked API] editorial typography is local, reading surfaces stay legible, and short pages keep their footer", async ({ page }, testInfo) => {
  const fonts = new Set()
  page.on("request", request => { if (request.resourceType() === "font") fonts.add(request.url()) })
  await page.goto("/")
  await settled(page)
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(29, 41, 39)")
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark")
  await expect(page.locator("body")).toHaveCSS("color", "rgb(236, 231, 220)")
  await expect(page.locator(".site-header")).toHaveCSS("backdrop-filter", "none")
  expect(await page.locator("body").evaluate(node => getComputedStyle(node).fontFamily)).toContain("Archivo Variable")
  expect(await page.locator(".hero-title").evaluate(node => getComputedStyle(node).fontFamily)).toContain("Newsreader Variable")
  expect(fonts.size).toBe(3)
  expect([...fonts].every(url => new URL(url).origin === "http://127.0.0.1:4173" && url.endsWith(".woff2"))).toBe(true)
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(3)
  const ledger = []
  for (const path of ["/", "/discover", `/student/${backend.publicMember.id}`, "/sign-in", "/canteen-prices"]) {
    await page.goto(path)
    await settled(page)
    await settleCards(page)
    const contrast = await textContrast(page, ".nav-link,.footer-note,.development-banner,.hero-copy,.hero-kicker,.hero-title em,.art-label,.hero-mini small,.eyebrow,.section-description,.profile-card-name,.profile-card-bio,.skill-tag,.filter-label > span,.results-meta,.pagination .muted,.text-link,.btn,.auth-page .muted,.profile-sections .muted")
    expect(contrast.filter(item => item.ratio < 4.5), `Text contrast on ${path}`).toEqual([])
    ledger.push({ path, minimumTextContrast: Math.min(...contrast.map(item => item.ratio)) })
    await noOverflow(page)
    if (["/discover", "/sign-in"].includes(path)) await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-desktop.png`), fullPage: true })
  }
  await page.goto("/sign-in")
  await settled(page)
  const footer = await page.locator(".site-footer").boundingBox()
  expect(footer.y + footer.height).toBeGreaterThanOrEqual(999)
  await testInfo.attach("editorial-reading-surface-contrast", { body: JSON.stringify(ledger, null, 2), contentType: "application/json" })
})

for (const width of [360, 1440]) {
  test(`[mocked API] delayed local fonts preserve hero geometry at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(() => {
      window.__fontShifts = []
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__fontShifts.push(entry.value) }).observe({ type: "layout-shift", buffered: true })
    })
    let release, held = 0
    const gate = new Promise(resolve => { release = resolve })
    await page.route("**/*.woff2", async route => { held++; await gate; await route.continue() })
    const geometry = () => page.locator(".hero-title,.hero-copy,.hero-search,.hero-art").evaluateAll(nodes => nodes.map(node => ({ class: node.className, top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })))
    let before
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" })
      await expect.poll(() => held).toBe(3)
      await expect(page.locator(".hero-art")).toHaveCSS("opacity", "1")
      await expect(page.locator(".feature-card")).toHaveCount(3)
      await expect(page.locator(".profile-card")).toHaveCount(12)
      before = await geometry()
      await page.evaluate(() => { window.__fontShifts = [] })
    } finally { release() }
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const after = await geometry()
    const shifts = await page.evaluate(() => window.__fontShifts.reduce((total, value) => total + value, 0))
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(after[i].top - before[i].top), before[i].class).toBeLessThanOrEqual(1)
      expect(Math.abs(after[i].height - before[i].height), before[i].class).toBeLessThanOrEqual(1)
    }
    expect(shifts).toBeLessThan(.02)
    await testInfo.attach("delayed-font-layout", { body: JSON.stringify({ width, before, after, fontSwapLayoutShift: shifts }, null, 2), contentType: "application/json" })
    await page.screenshot({ path: testInfo.outputPath(`home-${width}-viewport.png`) })
  })
}

test("[mocked API] public discovery combines filters, paginates without duplicates, and preserves mounted cards", async ({ page }) => {
  await page.goto("/discover")
  await expect(page.locator(".profile-card")).toHaveCount(12)
  const first = await page.locator(".profile-card a").evaluateAll(links => links.map(link => link.getAttribute("href")))
  await page.getByRole("button", { name: "Next page" }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator(".profile-grid")).toHaveAttribute("aria-busy", "false")
  const second = await page.locator(".profile-card a").evaluateAll(links => links.map(link => link.getAttribute("href")))
  expect(first.filter(id => second.includes(id))).toEqual([])
  await page.getByRole("searchbox").fill("Hashim")
  await expect(page.locator(".profile-card")).toHaveCount(1)
  const card = await page.locator(".profile-card").elementHandle(), route = await page.locator("#main-content > div").elementHandle()
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Food & cooking" })
  await page.getByLabel("Skill", { exact: true }).selectOption({ label: "Homemade ice cream" })
  await expect(page.locator(".profile-grid")).toHaveAttribute("aria-busy", "false")
  await expect(page.locator(".results-meta").getByRole("status")).toContainText("1 profile to explore")
  expect(await card.evaluate(node => node === document.querySelector(".profile-card"))).toBe(true)
  expect(await route.evaluate(node => node === document.querySelector("#main-content > div"))).toBe(true)
  await page.getByRole("searchbox").fill("no-such-test-person")
  await expect(page.getByText("No matches just yet.")).toBeVisible()
  await page.getByRole("button", { name: "Clear filters" }).first().click()
  await expect(page.locator(".profile-card")).toHaveCount(12)
})

test("[mocked API] auth forms distinguish confirmation, failure, recovery and safe return paths", async ({ page }) => {
  await page.goto("/my-profile")
  await expect(page).toHaveURL(/sign-in\?next=/)
  await page.goto("/sign-up")
  await page.getByLabel("Email address").fill(`signup-${randomUUID()}@browser.example.invalid`)
  await page.getByLabel("Password", { exact: true }).fill("Only-a-browser-test-password!")
  await page.getByLabel("Confirm password").fill("Mismatch-browser-test-password!")
  await page.getByRole("button", { name: "Create account", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("do not match")
  await page.getByLabel("Confirm password").fill("Only-a-browser-test-password!")
  await page.getByRole("button", { name: "Create account", exact: true }).click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("Check your email")
  await expect(page.locator(".header-cta")).toContainText("Join the community")
  await page.goto("/recover-account")
  await expect(page.getByText("This recovery link did not establish a session.", { exact: false })).toBeVisible()
  await page.goto("/auth/callback?error_description=Expired%20test%20link")
  await expect(page.getByText("Expired test link", { exact: false })).toBeVisible()
  await page.goto("/forgot-password")
  await page.getByLabel("Email address").fill("missing@browser.example.invalid")
  await page.getByRole("button", { name: "Send recovery link" }).click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("If an account matches")
  const account = await backend.account("safe-return")
  await page.goto("/sign-in?next=//outside.example.invalid")
  await page.getByLabel("Email address").fill(account.email)
  await page.getByLabel("Password", { exact: true }).fill("wrong-password")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Invalid login credentials")
  await page.getByLabel("Password", { exact: true }).fill(account.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/my-profile$/)
  await expect(page.getByLabel("Full name")).toBeVisible()
})

test("[mocked API] signup confirmation can be resent after cooldown and keeps the correct callback and address", async ({ page }) => {
  await page.clock.install()
  const email = `resend-${randomUUID()}@browser.example.invalid`
  await page.goto("/sign-up")
  await page.getByLabel("Email address").fill(email)
  await page.getByLabel("Password", { exact: true }).fill("Only-a-browser-test-password!")
  await page.getByLabel("Confirm password").fill("Only-a-browser-test-password!")
  await page.getByRole("button", { name: "Create account", exact: true }).click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("Check your email")
  const resend = page.getByRole("button", { name: /Resend confirmation email/ })
  await expect(resend).toBeDisabled()
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0)
  await page.clock.fastForward(61000)
  await expect(resend).toBeEnabled()
  await resend.click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("A new confirmation email was requested")
  await expect(resend).toBeDisabled()
  const call = backend.authCalls.findLast(call => call.path.endsWith("/resend") && call.body.email === email)
  expect(call.body.type).toBe("signup")
  expect(call.redirectTo).toBe("http://127.0.0.1:4173/auth/callback")
  await page.getByLabel("Email address").fill("corrected@browser.example.invalid")
  await expect(resend).toHaveCount(0)
  await expect(page.locator(".auth-page").getByRole("status")).toHaveCount(0)
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible()
})

test("[mocked API] unconfirmed password login offers resend and delivery failures never show a success notice", async ({ page }) => {
  await page.clock.install()
  const email = `unconfirmed-${randomUUID()}@browser.example.invalid`, password = "Only-a-browser-test-password!"
  const created = await backend.target.service.auth.admin.createUser({ email, password, email_confirm: false })
  expect(created.error).toBeNull()
  await page.goto("/sign-in")
  await page.getByLabel("Email address").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Confirm your email address before signing in")
  const resend = page.getByRole("button", { name: /Resend confirmation email/ })
  await expect(resend).toBeEnabled()
  await resend.click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("A new confirmation email was requested")
  await page.clock.fastForward(61000)
  await page.route("**/auth/v1/resend**", route => route.fulfill({ status: 500, contentType: "application/json",
    body: JSON.stringify({ code: "unexpected_failure", msg: "Error sending confirmation email" }) }))
  await resend.click()
  await expect(page.getByRole("alert")).toContainText("The email could not be sent")
  await expect(page.locator(".auth-page").getByRole("status")).toHaveCount(0)
  await page.unroute("**/auth/v1/resend**")
  await resend.click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("A new confirmation email was requested")
})

test("[mocked API] recovery rate limits pause retries and expired email fragments show actionable errors", async ({ page }) => {
  await page.clock.install()
  await page.goto("/forgot-password")
  await page.getByLabel("Email address").fill("recover@browser.example.invalid")
  await page.route("**/auth/v1/recover**", route => route.fulfill({ status: 429, contentType: "application/json",
    body: JSON.stringify({ code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }) }))
  await page.getByRole("button", { name: "Send recovery link" }).click()
  await expect(page.getByRole("alert")).toContainText("Too many email requests")
  await expect(page.locator(".auth-page").getByRole("status")).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled()
  await page.clock.fastForward(61000)
  await page.unroute("**/auth/v1/recover**")
  await page.getByRole("button", { name: "Send recovery link" }).click()
  await expect(page.locator(".auth-page").getByRole("status")).toContainText("If an account matches")
  expect(backend.authCalls.findLast(call => call.path.endsWith("/recover")).redirectTo).toBe("http://127.0.0.1:4173/recover-account")
  for (const path of ["/auth/callback", "/recover-account"]) {
    await page.goto(`${path}#error=access_denied&error_code=otp_expired&error_description=This%20email%20link%20has%20expired`)
    await expect(page.getByText("This email link has expired", { exact: false })).toBeVisible()
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("link", { name: path === "/auth/callback" ? "Go to sign in" : "Request another link" })).toBeVisible()
  }
})

test("[mocked API] three portfolio entries and private contact persist across browser contexts; failed saves keep input and retry IDs", async ({ page, browser }) => {
  const account = await backend.account("portfolio-owner")
  await signIn(page, account)
  await page.getByLabel("Full name").fill("Browser Portfolio Owner")
  await page.getByLabel("Department", { exact: true }).selectOption(backend.refs.department)
  await page.getByLabel("Programme", { exact: true }).selectOption(backend.refs.programme)
  await page.getByLabel("Semester / year").selectOption("2")
  await page.getByLabel("Short bio").fill("An explicitly fictional browser-test profile with three distinct projects.")
  await page.getByLabel("Add a skill", { exact: true }).selectOption(backend.refs.skill)
  for (let index = 1; index <= 3; index++) {
    if (index > 1) await page.getByRole("button", { name: "Add project", exact: true }).click()
    await page.getByLabel(`Project ${index} title`, { exact: true }).fill(`Browser project ${index}`)
    await page.getByLabel(`Project ${index} description`, { exact: true }).fill(`Independent description ${index}`)
  }
  await page.getByRole("button", { name: "Add contact link" }).click()
  await page.getByLabel("Contact 1 type").selectOption("email")
  await page.getByLabel("Contact 1 value").fill("private-draft@browser.example.invalid")
  backend.failNext.set("save_my_profile", 1)
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("simulated database outage")
  await expect(page.getByLabel("Project 3 title")).toHaveValue("Browser project 3")
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(page.locator(".toast")).toContainText("Draft saved in Supabase")
  const calls = backend.calls.filter(call => call.name === "save_my_profile" && call.userId === account.id)
  expect(calls.at(-2).args.p_request_id).toBe(calls.at(-1).args.p_request_id)
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173" })
  try {
    await backend.attach(context)
    const otherPage = await context.newPage()
    await signIn(otherPage, account)
    await expect(otherPage.getByLabel("Project 3 description")).toHaveValue("Independent description 3")
    await expect(otherPage.getByLabel("Contact 1 audience")).toHaveValue("owner")
    await otherPage.reload()
    await expect(otherPage.getByLabel("Project 2 title")).toHaveValue("Browser project 2")
    await otherPage.getByRole("button", { name: "Remove project 2" }).click()
    await expect(otherPage.getByLabel("Project 2 title")).toHaveValue("Browser project 3")
    await otherPage.getByRole("button", { name: "Save & submit for review" }).click()
    await expect(otherPage.getByRole("button", { name: "Withdraw submission to edit" })).toBeVisible()
    await expect(otherPage.getByLabel("Full name")).toBeDisabled()
    await otherPage.getByRole("button", { name: "Withdraw submission to edit" }).click()
    await expect(otherPage.getByLabel("Full name")).toBeEnabled()
  } finally { await context.close() }
})

test("[mocked API] authenticated uploads normalize through shared image code and keep the editor mounted", async ({ page }) => {
  const account = await backend.account("image-owner")
  await signIn(page, account)
  const form = await page.locator(".profile-form").elementHandle()
  await page.getByLabel("Full name").fill("Browser Image Owner")
  await page.getByLabel("Upload your photo", { exact: true }).setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: sampleEvidence() })
  await expect(page.locator(".form-photo img")).toBeVisible()
  expect(await form.evaluate(node => node === document.querySelector(".profile-form"))).toBe(true)
  await expect(page.getByLabel("Full name")).toHaveValue("Browser Image Owner")
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled()
})

test("[mocked API] profile audiences and late responses cannot leak private data after sign-out", async ({ page }) => {
  const path = `/student/${backend.publicMember.id}`
  await page.goto(path)
  await expect(page.getByRole("heading", { name: "Public test project" })).toBeVisible()
  await expect(page.getByText("Owner-only test project", { exact: true })).toHaveCount(0)
  await expect(page.locator(".profile-avatar img")).toHaveCount(0)
  expect(await page.evaluate(() => window.INJECTED)).toBeUndefined()
  await signIn(page, backend.publicMember, path)
  await expect(page.getByText("owner-only@browser.example.invalid", { exact: true })).toBeVisible()
  await expect(page.locator(".profile-avatar img")).toBeVisible()
  let release, began
  const gate = new Promise(resolve => { release = resolve }), started = new Promise(resolve => { began = resolve })
  backend.beforeReply = async ({ name, userId }) => { if (name === "get_profile" && userId === backend.publicMember.id) { began(); await gate } }
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await started
  await page.locator(".header-cta").click()
  await expect(page).toHaveURL("http://127.0.0.1:4173/")
  backend.beforeReply = null; release()
  await page.goto(path)
  await expect(page.getByRole("heading", { name: "Public test project" })).toBeVisible()
  await expect(page.getByText("owner-only@browser.example.invalid", { exact: true })).toHaveCount(0)
  await expect(page.getByText("campus-only@browser.example.invalid", { exact: true })).toHaveCount(0)
  await expect(page.locator(".profile-avatar img")).toHaveCount(0)
})

test("[mocked API] report dialog traps focus, cancels safely, restores focus and announces submission", async ({ page }) => {
  const account = await backend.account("reporter")
  await signIn(page, account, `/student/${backend.publicMember.id}`)
  const trigger = page.getByRole("button", { name: "Report a concern" })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Report this profile" })
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden")
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press(index < 8 ? "Tab" : "Shift+Tab")
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden")
  await trigger.click()
  await page.getByLabel("Description", { exact: true }).fill("An explicitly fictional browser-test report.")
  await page.getByRole("button", { name: "Send report" }).click()
  await expect(page.locator(".toast")).toContainText("report was sent")
  await expect(dialog).toHaveCount(0)
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 4500 })
})

test("[mocked API] café comparisons exclude unpublished development-fixture prices", async ({ page }) => {
  await page.goto("/canteen-prices?view=compare&query=Tea")
  await expect(page.getByRole("heading", { name: "A second café is needed." })).toBeVisible()
  await expect(page.locator(".price-card")).toHaveCount(0)
  await page.getByLabel("Max INR", { exact: true }).fill("25")
  await page.getByRole("searchbox", { name: "Search canteen items" }).fill("Lemon drink")
  await expect(page.locator(".results-meta")).toContainText("0 matching items")
  await expect(page.getByRole("region", { name: "Compare café menus" })).not.toContainText("Simulated verification")
})

test("[mocked API] role-manager UI is separate and current backend revocation removes administrator access", async ({ page }) => {
  await backend.account("backup-administrator", "admin")
  await signIn(page, backend.manager, "/admin")
  await expect(page.getByRole("button", { name: "Roles", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Accounts & profiles", exact: true })).toHaveCount(0)
  await page.locator(".header-cta").click()
  await signIn(page, backend.admin, "/admin")
  await expect(page.getByRole("button", { name: "Accounts & profiles", exact: true })).toBeVisible()
  await dbRole(false)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(page.getByText("Administrator access required.")).toBeVisible()
  await dbRole(true)
  async function dbRole(grant) {
    await rpc(backend.db, backend.manager.id, "manage_role", { p_user_id: backend.admin.id, p_role: "admin", p_grant: grant,
      p_reason: "Browser role-refresh test", p_request_id: randomUUID() })
  }
})

test("[mocked API] administrator workflows moderate, maintain references, resolve suggestions and audit decisions", async ({ page }) => {
  const owner = await backend.account("admin-review-subject")
  const draft = await saveProfile(backend.db, owner.id, backend.refs, { display_name: "Browser Review Subject" })
  await rpc(backend.db, owner.id, "profile_action", { p_action: "submit", p_expected_version: draft.write_version, p_request_id: randomUUID() })
  await rpc(backend.db, owner.id, "suggest_skill", { p_name: "Browser suggestion to merge", p_category_id: null, p_request_id: randomUUID() })
  await signIn(page, backend.admin, "/admin")
  const tabs = page.getByRole("navigation", { name: "Administration sections" })
  await tabs.getByRole("button", { name: "Accounts & profiles", exact: true }).click()
  await page.getByRole("searchbox", { name: "Search administration records" }).fill(owner.email)
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1)
  async function review(action, reason) {
    await page.getByRole("button", { name: "Review account", exact: true }).click()
    await page.getByLabel("Administrator action").selectOption(action)
    if (action === "eligibility") await page.getByLabel("Eligibility decision").selectOption("eligible")
    await page.getByLabel("Reason / feedback").fill(reason)
    await page.getByRole("button", { name: "Record decision" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator(".admin-panel").getByRole("status")).not.toContainText("Refreshing")
  }
  await review("eligibility", "Synthetic browser test eligibility; not a real identity check.")
  await review("approve", "Browser content approval is separate from campus eligibility.")
  expect((await rpc(backend.db, null, "get_profile", { p_id: owner.id })).display_name).toBe("Browser Review Subject")

  await tabs.getByRole("button", { name: "Reference data", exact: true }).click()
  await page.getByRole("button", { name: "Add entry", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Browser-only reference department")
  await page.getByLabel("Source / reason for this change").fill("Synthetic UI test reference; not university data.")
  await page.getByRole("button", { name: "Save reference", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("Filter this collection").fill("Browser-only reference department")
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByLabel("Active (uncheck to retire)").uncheck()
  await page.getByLabel("Source / reason for this change").fill("Retire the synthetic reference after exercising the editor.")
  await page.getByRole("button", { name: "Save reference", exact: true }).click()
  await expect(page.locator(".admin-table tbody tr")).toContainText("Retired")

  await tabs.getByRole("button", { name: "Skill suggestions", exact: true }).click()
  const suggestion = page.locator(".admin-record").filter({ hasText: "Browser suggestion to merge" })
  await suggestion.getByRole("button", { name: "Review", exact: true }).click()
  await page.getByLabel("Resolution", { exact: true }).selectOption("merged")
  await page.getByLabel("Approved skill").selectOption(backend.refs.skill)
  await page.getByLabel("Resolution reason").fill("Matched to an existing synthetic test skill.")
  await page.getByRole("button", { name: "Save resolution" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect((await rpc(backend.db, owner.id, "get_my_skill_requests"))[0].status).toBe("merged")

  await tabs.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(page.getByLabel("Price freshness window (days)")).toHaveValue("30")
  await page.getByLabel("Price freshness window (days)").fill("31")
  await page.getByLabel("Change reason").fill("Temporary browser settings check.")
  await page.getByRole("button", { name: "Save settings", exact: true }).click()
  await expect(page.locator(".toast").filter({ hasText: "Platform settings saved" })).toBeVisible()
  expect((await rpc(backend.db, null, "get_app_config")).stale_after_days).toBe(31)
  await page.getByLabel("Price freshness window (days)").fill("30")
  await page.getByLabel("Change reason").fill("Restore the agreed 30-day default after the check.")
  await page.getByRole("button", { name: "Save settings", exact: true }).click()
  await expect(page.getByLabel("Change reason")).toHaveValue("")
  await tabs.getByRole("button", { name: "Audit history", exact: true }).click()
  await page.getByRole("searchbox", { name: "Search administration records" }).fill("profile.approve")
  const approval = page.locator(".admin-table tbody tr").filter({ hasText: "Browser content approval" })
  await expect(approval).toHaveCount(1)
  await expect(approval).toContainText("profile.approve")
})

test("[mocked API] every administrator section fits mobile and desktop; private evidence and report resolution work", async ({ page }, testInfo) => {
  const reporter = await backend.account("independent-report")
  const report = await rpc(backend.db, reporter.id, "report_profile", { p_profile_id: backend.publicMember.id, p_category: "other", p_description: "Browser independent resolution example.", p_request_id: randomUUID() })
  await signIn(page, backend.admin, "/admin")
  const tabs = page.getByRole("navigation", { name: "Administration sections" })
  for (const width of [360, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const label of ["Overview", "Accounts & profiles", "Reference data", "Canteen prices", "Skill suggestions", "Reports", "Audit history", "Settings"]) {
      await tabs.getByRole("button", { name: label, exact: true }).click()
      await settled(page)
      await noOverflow(page)
    }
    await tabs.getByRole("button", { name: "Overview", exact: true }).click()
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`), fullPage: true })
  }
  await tabs.getByRole("button", { name: "Canteen prices", exact: true }).click()
  await page.getByRole("searchbox", { name: "Search administration records" }).fill("Tea")
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(3)
  await page.getByRole("button", { name: "Manage price", exact: true }).first().click()
  await page.getByRole("button", { name: "View private evidence", exact: true }).first().click()
  await expect(page.getByAltText("Private price-verification evidence")).toBeVisible()
  await expect(page.getByRole("dialog")).toContainText("simulated prices and checks")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await tabs.getByRole("button", { name: "Reports", exact: true }).click()
  await page.locator(".admin-record").filter({ hasText: "Browser independent resolution example." }).getByRole("button", { name: "Review", exact: true }).click()
  await page.getByLabel("Resolution reason").fill("Reviewed independently in the synthetic browser test.")
  await page.getByRole("button", { name: "Save resolution" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect((await backend.db.query("select status from private.moderation_reports where id=$1", [report.id])).rows[0].status).toBe("resolved")
})

test("[mocked API] price editor appends a correction, validates uploaded evidence, verifies and revokes without rewriting history", async ({ page }) => {
  const account = backend.manifest.accounts["sample-admin"]
  await signIn(page, account, "/admin?section=prices")
  await page.getByRole("searchbox", { name: "Search administration records" }).fill("Lemon drink")
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1)
  await page.getByRole("button", { name: "Manage price", exact: true }).click()
  await expect(page.locator(".history-record")).toHaveCount(2)
  await page.getByLabel("INR amount").fill("40")
  await page.getByLabel("This corrects the current price record").check()
  await page.getByLabel("Source details / reason").fill("Illustrative browser correction; not a real menu price.")
  await page.getByRole("button", { name: "Append history event" }).click()
  await expect(page.locator(".history-record")).toHaveCount(3)
  await expect(page.locator(".history-record").first()).toContainText("Corrects record")
  await expect(page.locator(".history-record").first()).toContainText("No verification recorded")
  await page.getByLabel("Price action").selectOption("verified")
  const observed = await page.evaluate(() => { const date = new Date(Date.now() - 120000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })
  await page.getByLabel("Actual observation date and time").fill(observed)
  await expect(page.getByLabel("Source method")).toHaveValue("simulated")
  await page.getByLabel("Upload private evidence", { exact: true }).setInputFiles({ name: "simulated-evidence.png", mimeType: "image/png", buffer: sampleEvidence() })
  await expect(page.locator(".asset-control img")).toBeVisible()
  await page.getByLabel("Source details / reason").fill("Simulated browser verification using code-drawn sample evidence.")
  await page.getByRole("button", { name: "Append history event" }).click()
  await expect(page.locator(".history-record").first()).toContainText("Simulated browser verification")
  let current = (await rpc(backend.db, null, "get_canteen_prices", { p_filters: { query: "Lemon drink" } })).items[0]
  expect(current.status).toBe("eligible"); expect(current.amount).toBe(40)
  await page.getByLabel("Price action").selectOption("revoked")
  await page.getByLabel("Source details / reason").fill("Simulated revocation preserves every earlier event.")
  await page.getByRole("button", { name: "Append history event" }).click()
  await expect(page.locator(".history-record").first()).toContainText("Simulated revocation")
  await expect(page.locator(".history-record")).toHaveCount(3)
  await expect(page.locator(".history-record").first().locator(".verification-record")).toHaveCount(2)
  current = (await rpc(backend.db, null, "get_canteen_prices", { p_filters: { query: "Lemon drink" } })).items[0]
  expect(current.status).toBe("revoked"); expect(current.amount).toBeNull()
  expect(current.is_cheapest).toBe(false); expect(current.difference).toBeNull()
  const history = await rpc(backend.db, account.id, "admin_price_history", { p_offering_id: current.id })
  expect(history.items.map(record => record.amount)).toEqual([40, 30, 20])
  expect(history.items[0].verifications.map(event => event.decision)).toEqual(["revoked", "verified"])
})

test("[mocked API] enhanced motion shows real orbits, entrances and hover effects while retaining viewport-once lifetime and route exits", async ({ page }, testInfo) => {
  await recordMotion(page)
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/")
  await settled(page)
  const route = page.locator("#main-content > div"), hero = page.locator(".hero-grid > div").first(), art = page.locator(".hero-art")
  const entrance = async (node, duration, y, delay = 0) => {
    expect((await effects(node)).some(effect => effect.duration === duration && effect.delay === delay)).toBe(true)
    const samples = await translations(node)
    expect(samples.some(sample => sample.y === y), `Initial ${y}px entrance`).toBe(true)
    expect(samples.some(sample => sample.y > 0 && sample.y < y), "Observed intermediate translation").toBe(true)
    await expect.poll(() => node.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBeCloseTo(0, 2)
  }
  expect((await effects(route)).some(effect => effect.duration === 180)).toBe(true)
  await entrance(hero, 800, 28)
  await entrance(art, 900, 24, 100)
  const sheen = await page.locator(".hero").evaluate(node => { const style = getComputedStyle(node, "::before"); return { duration: style.animationDuration, count: style.animationIterationCount, position: style.backgroundPosition } })
  expect(sheen.duration).toBe("18s"); expect(sheen.count).toBe("infinite")
  await expect.poll(() => page.locator(".hero").evaluate(node => getComputedStyle(node, "::before").backgroundPosition)).not.toBe(sheen.position)
  await expect(page.locator(".hero-orbit")).toHaveAttribute("aria-hidden", "true")
  await expect(page.locator(".hero-orbit")).toHaveCSS("pointer-events", "none")
  await expect(page.locator(".orbit-plane")).toHaveCount(3)
  await expect(page.locator(".orbit-runner")).toHaveCount(3)
  await expect(page.locator(".orbit-core")).toHaveCount(1)
  await expect(page.locator(".orbit-star")).toHaveCount(3)
  await expect(page.locator(".hero-orbit a,.hero-orbit button")).toHaveCount(0)
  for (const [selector, duration, direction, diameter] of [[".orbit-runner-outer", "16s", "normal", "14px"], [".orbit-runner-inner", "24s", "reverse", "10px"], [".orbit-runner-cross", "32s", "normal", "8px"]]) {
    const orbit = page.locator(selector)
    await expect(orbit).toHaveCSS("animation-duration", duration)
    await expect(orbit).toHaveCSS("animation-direction", direction)
    await expect(orbit).toHaveCSS("animation-iteration-count", "infinite")
    const orbitFrames = await orbit.evaluate(node => node.getAnimations()[0].effect.getKeyframes())
    expect(orbitFrames.every(frame => Object.keys(frame).every(key => ["offset", "computedOffset", "easing", "composite", "transform"].includes(key)))).toBe(true)
    const position = await orbit.evaluate(node => getComputedStyle(node).transform)
    await expect.poll(() => orbit.evaluate(node => getComputedStyle(node).transform)).not.toBe(position)
    expect(await orbit.evaluate(node => getComputedStyle(node, "::before").width)).toBe(diameter)
    const finish = await orbit.evaluate(node => ({ trail: getComputedStyle(node, "::after").backgroundImage,
      mask: getComputedStyle(node, "::after").maskImage, glow: getComputedStyle(node, "::before").boxShadow }))
    expect(finish.trail).toContain("conic-gradient")
    expect(finish.mask).toContain("radial-gradient")
    expect(finish.glow).not.toBe("none")
  }
  for (const selector of [".orbit-plane-cross", ".orbit-star"]) {
    const node = page.locator(selector).first()
    const frames = await node.evaluate(element => element.getAnimations()[0].effect.getKeyframes())
    expect(frames.every(frame => Object.keys(frame).every(key => ["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(key)))).toBe(true)
    const position = await node.evaluate(element => getComputedStyle(element).transform)
    await expect.poll(() => node.evaluate(element => getComputedStyle(element).transform)).not.toBe(position)
  }
  const aura = await page.locator(".hero-orbit").evaluate(node => ({ duration: getComputedStyle(node, "::before").animationDuration,
    name: getComputedStyle(node, "::before").animationName }))
  expect(aura).toEqual({ duration: "10s", name: "orbit-breathe" })
  const mini = page.locator(".hero-mini").first()
  await expect(mini).toHaveCSS("animation-duration", "8s")
  const floatFrames = await mini.evaluate(node => node.getAnimations()[0].effect.getKeyframes())
  expect(floatFrames.every(frame => Object.keys(frame).every(key => ["offset", "computedOffset", "easing", "composite", "translate"].includes(key)))).toBe(true)
  expect(floatFrames.some(frame => frame.translate?.includes("-7px"))).toBe(true)
  const floatPosition = await mini.evaluate(node => getComputedStyle(node).translate)
  await expect.poll(() => mini.evaluate(node => getComputedStyle(node).translate)).not.toBe(floatPosition)
  await mini.hover({ force: true })
  await expect(mini).toHaveCSS("animation-play-state", "paused")
  await mini.focus()
  await page.mouse.move(0, 0)
  await expect(mini).toHaveCSS("animation-play-state", "paused")
  await mini.evaluate(node => node.blur())

  const card = page.locator(".feature-card").first(), cardNode = await card.elementHandle()
  await card.scrollIntoViewIfNeeded()
  await expect(card).toHaveCSS("opacity", "1")
  await entrance(card, 650, 24)
  await card.hover()
  await expect(card).toHaveCSS("translate", "0px -4px")
  await expect.poll(() => card.locator(".avatar-art").evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a)).toBeCloseTo(1.055, 3)
  await page.locator(".header-cta").hover()
  await expect.poll(() => page.locator(".header-cta").evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42)).toBeCloseTo(-3, 1)
  const count = (await effects(card)).length
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }))
  await expect.poll(() => card.evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(0)
  await card.scrollIntoViewIfNeeded()
  await expect(card).toHaveCSS("opacity", "1")
  expect((await effects(card)).length).toBe(count)

  const original = await route.elementHandle()
  await page.evaluate(() => { location.hash = "discover" })
  await expect(page).toHaveURL(/#discover$/)
  expect(await original.evaluate(node => node === document.querySelector("#main-content > div"))).toBe(true)
  expect(await cardNode.evaluate(node => node === document.querySelector(".feature-card"))).toBe(true)
  const profile = page.locator(".profile-card").first()
  await profile.scrollIntoViewIfNeeded()
  await expect(profile).toHaveCSS("opacity", "1")
  await entrance(profile, 550, 18)
  await page.evaluate(() => {
    window.__routeChildren = []
    new MutationObserver(() => window.__routeChildren.push(document.querySelector("main").children.length)).observe(document.querySelector("main"), { childList: true })
  })
  await card.locator(".feature-photo").click()
  await expect(page).toHaveURL(/\/student\//)
  const detail = page.locator("#main-content > div > article")
  await expect(detail).toBeVisible()
  await settled(page)
  expect(await original.evaluate(node => node.isConnected)).toBe(false)
  expect((await effects(original)).some(effect => effect.duration === 180 && effect.frames.at(-1).opacity === "0")).toBe(true)
  expect((await effects(detail)).some(effect => effect.duration === 350)).toBe(true)
  expect(await page.evaluate(() => window.__routeChildren.every(count => count <= 1))).toBe(true)
  await attachMotion(page, testInfo)
})

test("[mocked API] reduced motion removes translation and sheen loops while keyboard mobile navigation restores focus", async ({ page }, testInfo) => {
  await recordMotion(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 360, height: 1000 })
  await page.goto("/")
  await settled(page)
  const original = await page.locator("#main-content > div").elementHandle()
  await page.keyboard.press("Tab")
  const skip = page.getByRole("link", { name: "Skip to content" })
  await expect(skip).toBeFocused()
  expect((await skip.boundingBox()).y).toBeGreaterThanOrEqual(0)
  await page.keyboard.press("Enter")
  await expect(page.locator("main")).toBeFocused()
  expect(await original.evaluate(node => node === document.querySelector("#main-content > div"))).toBe(true)
  await expect(page.locator(".hero-grid > div").first()).toHaveCSS("transform", "none")
  const reduced = await page.locator(".hero").evaluate(node => ({ sheen: getComputedStyle(node, "::before").animationDuration,
    count: getComputedStyle(node, "::before").animationIterationCount, scroll: getComputedStyle(document.documentElement).scrollBehavior }))
  expect(parseFloat(reduced.sheen)).toBeLessThan(.001); expect(reduced.count).toBe("1"); expect(reduced.scroll).toBe("auto")
  for (const node of await page.locator(".orbit-plane-cross,.orbit-runner,.orbit-star,.hero-mini").all()) await expect(node).toHaveCSS("animation-name", "none")
  expect(await page.locator(".hero-orbit").evaluate(node => getComputedStyle(node, "::before").animationName)).toBe("none")
  const reducedMini = page.locator(".hero-mini").first()
  await reducedMini.hover()
  await expect(reducedMini).toHaveCSS("translate", "none")
  await settleCards(page)
  for (const [selector, initial] of [[".hero-intro", 28], [".hero-art,.feature-card", 24], [".profile-card", 18]]) {
    for (const node of await page.locator(selector).all()) {
      // Invisible initial offsets may snap to zero, but must never tween in reduced motion.
      expect((await translations(node)).every(sample => sample.y === 0 || sample.y === initial)).toBe(true)
      await expect(node).toHaveCSS("transform", "none")
    }
  }
  const toggle = page.getByRole("button", { name: "Open menu", exact: true })
  await toggle.focus()
  await page.keyboard.press("Enter")
  const menu = page.getByRole("navigation", { name: "Mobile navigation" }), menuNode = await menu.elementHandle()
  await expect(menu).toHaveCSS("opacity", "1")
  await page.keyboard.press("Tab")
  await expect(menu.getByRole("link", { name: "Home", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(toggle).toBeFocused()
  expect((await effects(menuNode)).some(effect => effect.duration === 150 && effect.frames.at(-1).opacity === "0")).toBe(true)
  await toggle.click()
  await menu.getByRole("link", { name: "Campus cafés", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/canteen-prices$/)
  await expect(menu).toHaveCount(0)
  await settled(page)
  const frames = await page.evaluate(() => window.__motion.flatMap(entry => entry.frames))
  expect(frames.some(frame => typeof frame.transform === "string" && /translate/.test(frame.transform))).toBe(false)
  expect((await effects(page.locator("#main-content > div"))).every(effect => effect.duration === 0)).toBe(true)
  await noOverflow(page)
  await attachMotion(page, testInfo)
})

test("[mocked API] phone and touch landscape retain two orbits and pause them offscreen or when hidden", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "no-preference" })
  try {
    await backend.attach(context)
    const page = await context.newPage()
    page.on("pageerror", error => backend.errors.push(error.message))
    for (const [width, height] of [[360, 780], [390, 844], [430, 932], [844, 390]]) {
      await page.setViewportSize({ width, height })
      await page.goto("/")
      await settled(page)
      await page.locator(".hero-art").scrollIntoViewIfNeeded()
      await expect(page.locator(".hero")).toHaveAttribute("data-motion", "active")
      expect(await page.locator(".hero").evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.effect.getTiming().iterations === Infinity).length)).toBe(2)
      for (const selector of [".orbit-plane-cross", ".orbit-runner-cross", ".orbit-star", ".hero-mini"]) {
        for (const node of await page.locator(selector).all()) await expect(node).toHaveCSS("animation-name", "none")
      }
      for (const selector of [".hero", ".hero-orbit"]) expect(await page.locator(selector).evaluate(node => getComputedStyle(node, "::before").animationName)).toBe("none")
      for (const selector of [".orbit-runner-outer", ".orbit-runner-inner"]) {
        const runner = page.locator(selector)
        await expect(runner).toHaveCSS("animation-name", "orbit-turn")
        const position = await runner.evaluate(node => getComputedStyle(node).transform)
        await expect.poll(() => runner.evaluate(node => getComputedStyle(node).transform)).not.toBe(position)
      }
      const button = await page.locator(".search-submit").boundingBox()
      expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44)
      await noOverflow(page)
      await page.screenshot({ path: testInfo.outputPath(`phone-orbits-${width}x${height}.png`) })
    }
    const hero = page.locator(".hero"), runners = page.locator(".orbit-runner-outer,.orbit-runner-inner")
    const visibility = state => page.evaluate(state => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state })
      document.dispatchEvent(new Event("visibilitychange"))
    }, state)
    await visibility("hidden")
    await expect(hero).toHaveAttribute("data-motion", "paused")
    for (const runner of await runners.all()) await expect(runner).toHaveCSS("animation-play-state", "paused")
    const paused = await runners.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transform))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await runners.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transform))).toEqual(paused)
    await visibility("visible")
    await expect(hero).toHaveAttribute("data-motion", "active")
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }))
    await expect(hero).toHaveAttribute("data-motion", "paused")
    for (const runner of await runners.all()) await expect(runner).toHaveCSS("animation-play-state", "paused")
    await page.locator(".hero-art").scrollIntoViewIfNeeded()
    await expect(hero).toHaveAttribute("data-motion", "active")
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await hero.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.effect.getTiming().iterations === Infinity).length)).toBe(0)
    await expect(page.locator(".phone-preview-banner")).toHaveCount(0)
  } finally { await context.close() }
})

test("[mocked API] offscreen profile photos are deferred, blob URLs are released, and late photos are cancelled", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    window.__photoResources = { created: [], revoked: [], reads: [] }
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL, fetch = window.fetch
    URL.createObjectURL = function (blob) { const url = create.call(this, blob); window.__photoResources.created.push(url); return url }
    URL.revokeObjectURL = function (url) { window.__photoResources.revoked.push(url); return revoke.call(this, url) }
    window.fetch = function (input, init) {
      if (typeof input !== "string" || !input.endsWith("/asset-gateway") || JSON.parse(init?.body || "{}").action !== "read") return fetch.call(this, input, init)
      const record = { aborted: false, completed: false }
      window.__photoResources.reads.push(record)
      const abort = () => { record.aborted = true }
      init.signal?.addEventListener("abort", abort, { once: true })
      return fetch.call(this, input, init).finally(() => { record.completed = true; init.signal?.removeEventListener("abort", abort) })
    }
  })
  await signIn(page, backend.publicMember, "/")
  await page.getByRole("searchbox", { name: "Search the campus directory" }).fill("Browser Privacy Member")
  const card = page.locator(".profile-card").filter({ hasText: "Browser Privacy Member" })
  await expect(page.locator(".profile-card")).toHaveCount(1)
  await settled(page)
  expect((await card.boundingBox()).y).toBeGreaterThan(1044)
  expect(await page.evaluate(() => window.__photoResources.reads.length)).toBe(0)
  await card.scrollIntoViewIfNeeded()
  await expect(card.locator("img")).toBeVisible()
  await expect(card.locator("img")).toHaveAttribute("decoding", "async")
  const photo = await card.locator("img").getAttribute("src")
  expect(photo).toMatch(/^blob:/)
  expect(await page.evaluate(() => window.__photoResources.reads.length)).toBe(1)
  const cafes = async () => {
    await page.getByRole("button", { name: "Open menu", exact: true }).click()
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Campus cafés", exact: true }).click()
    await expect(page).toHaveURL(/\/canteen-prices$/)
    await settled(page)
  }
  await cafes()
  expect(await page.evaluate(url => window.__photoResources.revoked.includes(url), photo)).toBe(true)
  await page.getByRole("button", { name: "Open menu", exact: true }).click()
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Home", exact: true }).click()
  await page.getByRole("searchbox", { name: "Search the campus directory" }).fill("Browser Privacy Member")
  await expect(page.locator(".profile-card")).toHaveCount(1)
  let began, release
  const started = new Promise(resolve => { began = resolve }), gate = new Promise(resolve => { release = resolve })
  await page.route("**/functions/v1/asset-gateway", async route => { began(); await gate; await route.fallback() })
  try {
    await card.scrollIntoViewIfNeeded()
    await started
    await cafes()
    await expect.poll(() => page.evaluate(() => window.__photoResources.reads.at(-1).aborted)).toBe(true)
  } finally { release() }
  await expect.poll(() => page.evaluate(() => window.__photoResources.reads.at(-1).completed)).toBe(true)
  expect(await page.evaluate(() => window.__photoResources.created)).toEqual([photo])
  expect(await page.evaluate(() => window.__photoResources.revoked)).toEqual([photo])
})

test("[mocked API] non-home route modules load on demand without changing public navigation", async ({ page }) => {
  const modules = new Set()
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/src/pages/")) modules.add(path.split("/").at(-1)) })
  await page.goto("/")
  await settled(page)
  expect([...modules]).toEqual(["HomePage.jsx"])
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Campus cafés", exact: true }).click()
  await expect(page).toHaveURL(/\/canteen-prices$/)
  await settled(page)
  expect(modules.has("CanteenPage.jsx")).toBe(true)
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Discover", exact: true }).click()
  await expect(page.locator(".profile-card")).toHaveCount(12)
  expect(modules.has("DiscoverPage.jsx")).toBe(true)
  await page.locator(".profile-card a").first().click()
  await expect(page.locator(".profile-surface")).toBeVisible()
  expect(modules.has("StudentPage.jsx")).toBe(true)
  for (const name of ["AuthPage.jsx", "AuthCallbackPage.jsx", "MyProfilePage.jsx", "AdminPage.jsx"]) expect(modules.has(name)).toBe(false)
})

for (const width of [360, 768, 1024, 1440, 1920]) {
  test(`[mocked API] responsive routes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    for (const path of ["/", "/discover", `/student/${backend.publicMember.id}`, "/canteen-prices", "/sign-in"]) {
      await page.goto(path)
      await settled(page)
      if (path === "/") {
        await expect(page.locator(".feature-card")).toHaveCount(3)
        const obscured = await page.locator(".hero-mini strong,.hero-mini small").evaluateAll(labels => {
          const note = document.querySelector(".art-note").getBoundingClientRect()
          return labels.filter(label => {
            const box = label.getBoundingClientRect()
            return box.left < note.right && box.right > note.left && box.top < note.bottom && box.bottom > note.top
          }).map(label => label.textContent)
        })
        expect(obscured, "The decorative caption must not obscure linked profile labels").toEqual([])
      }
      await noOverflow(page)
      await settleCards(page)
      const name = path === "/" ? "home" : path.startsWith("/student/") ? "profile" : path.slice(1)
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true })
    }
    const account = await backend.account(`layout-${width}`)
    await saveProfile(backend.db, account.id, backend.refs, { display_name: "Browser Layout Member", bio: "A fictional automated-test profile, with three projects and a private contact.",
      about: "This disposable profile exercises the populated editor without changing retained campus records.", services: "Study guides, a small workshop, and an idea to share.", interests: ["Making", "Learning together"],
      projects: [1, 2, 3].map(index => ({ title: `Browser project ${index}`, description: `Independent project ${index} in the disposable layout test.`, audience: index === 1 ? "public" : "owner", sort_order: index - 1 })),
      contacts: [{ kind: "email", value: "layout@browser.example.invalid", audience: "owner" }] })
    await signIn(page, account)
    await expect(page.getByLabel("Full name")).toBeVisible()
    await expect(page.getByLabel("Project 3 title")).toHaveValue("Browser project 3")
    await settled(page)
    await noOverflow(page)
    const boxes = await page.locator(".profile-form").evaluate(node => Object.fromEntries(["photo", "skills", "about", "portfolio", "privacy", "contacts", "actions"]
      .map(section => [section, node.querySelector(`.form-${section}`).getBoundingClientRect().toJSON()])))
    if (width >= 1001) {
      for (const [left, right] of [["photo", "skills"], ["about", "portfolio"], ["privacy", "contacts"]]) {
        expect(Math.abs(boxes[left].top - boxes[right].top)).toBeLessThan(1)
        expect(boxes[right].left - boxes[left].right).toBeCloseTo(24, 0)
        expect(Math.abs(boxes[left].width - boxes[right].width)).toBeLessThan(1)
      }
      expect(Math.abs(boxes.actions.left - boxes.photo.left)).toBeLessThan(1)
      expect(Math.abs(boxes.actions.right - boxes.skills.right)).toBeLessThan(1)
    } else {
      expect(Math.abs(boxes.photo.left - boxes.skills.left)).toBeLessThan(1)
      expect(boxes.skills.top).toBeGreaterThan(boxes.about.bottom)
    }
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true })
  })
}

test("unconfigured installation displays setup states and deep links without inventing people or prices", async ({ page }) => {
  for (const path of ["/", "/discover", "/canteen-prices", "/my-profile", "/admin", "/sign-in"]) {
    await page.goto(`http://127.0.0.1:4174${path}`)
    await expect(page.getByText("Connect your campus database.", { exact: true })).toBeVisible()
    await expect(page.locator(".profile-card,.feature-card,.price-card")).toHaveCount(0)
    await noOverflow(page)
  }
})
