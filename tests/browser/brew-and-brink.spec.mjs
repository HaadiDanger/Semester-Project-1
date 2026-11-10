import { test, expect } from "@playwright/test"
import { createBrowserBackend } from "./backend.mjs"
import { createCafeMenuImportSQL, loadCafeMenu } from "../../scripts/lib/cafe-menu-import.mjs"

let backend
test.beforeAll(async () => {
  backend = await createBrowserBackend()
  const instanceId = (await backend.db.query("select instance_id from private.instance_config")).rows[0].instance_id
  for (const key of ["nescafe-iust", "brew-and-brink"]) await backend.db.exec(createCafeMenuImportSQL({ ...await loadCafeMenu(key), instanceId }))
})
test.afterAll(async () => { await backend?.close() })
test.beforeEach(async ({ context, page }) => {
  backend.errors.length = 0
  await backend.attach(context)
  page.on("pageerror", error => backend.errors.push(error.message))
})
test.afterEach(() => { expect(backend.errors).toEqual([]) })

for (const width of [360, 1440]) {
  test(`[mocked API] Brew and Brink sizes, sections and café switching work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto("/canteen-prices")
    await expect(page.getByRole("heading", { name: "BREW AND BRINK", exact: true })).toBeVisible()
    await expect(page.locator(".cafe-subtitle")).toHaveText("University Café – Food & Beverages Menu")
    await expect(page.locator(".menu-card")).toHaveCount(29)
    await expect(page.locator(".menu-provenance")).toContainText("Prices from the supplied menu.")
    await expect(page.getByRole("group", { name: "Menu category", exact: true }).getByRole("button")).toHaveCount(6)
    for (const image of await page.locator(".menu-card img").all()) await image.scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator(".menu-card img,.cafe-cover > img").evaluateAll(images => images.length === 30 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
    await page.screenshot({ path: testInfo.outputPath(`brew-and-brink-${width}.png`), fullPage: true })

    await page.getByRole("button", { name: /^Tea & Hot Coffee/ }).click()
    await expect(page.locator(".menu-card")).toHaveCount(6)
    for (const [name, price] of [["Tea Small", "₹15"], ["Tea Large", "₹30"], ["Coffee Small", "₹30"], ["Coffee Large", "₹60"]]) {
      await expect(page.getByRole("article", { name, exact: true }).locator(".menu-card-price")).toHaveText(price)
    }
    await page.reload()
    await expect(page.locator(".menu-card")).toHaveCount(6)
    await page.getByLabel("Choose café").selectOption({ label: "NESCAFÉ IUST · 30 items" })
    await expect(page.locator(".menu-card")).toHaveCount(30)
    await expect(page.getByRole("article", { name: "Cold Coffee", exact: true })).toContainText("₹70")
    await page.getByLabel("Choose café").selectOption({ label: "BREW AND BRINK · 29 items" })
    await expect(page.locator(".menu-card")).toHaveCount(29)
    await page.getByRole("button", { name: /^Shakes & Cold Beverages/ }).click()
    await expect(page.locator(".menu-card")).toHaveCount(4)
    await expect(page.getByRole("article", { name: "Cold Coffee", exact: true })).toContainText("₹110")
    await page.getByRole("button", { name: "Clear filters", exact: true }).click()
    await page.getByRole("button", { name: "₹50 & under", exact: true }).click()
    await expect(page.locator(".menu-card")).toHaveCount(8)
    await page.getByLabel("Sort by").selectOption("highest")
    await expect(page.locator(".menu-card-price").first()).toHaveText("₹50")
    await page.reload()
    await expect(page.locator(".menu-card")).toHaveCount(8)
    await expect(page.getByLabel("Choose café")).toHaveValue(/.+/)
    await expect(page.getByRole("heading", { name: "BREW AND BRINK", exact: true })).toBeVisible()
  })
}
