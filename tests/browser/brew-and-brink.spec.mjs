import { test, expect } from "@playwright/test"
import { createBrowserBackend } from "./backend.mjs"
import { createCafeMenuImportSQL, loadCafeMenu } from "../../scripts/lib/cafe-menu-import.mjs"
import { createCafePhotoUpdateSQL, loadCafePhotoUpdate } from "../../scripts/lib/cafe-photo-update.mjs"
import { settleCards, textContrast } from "./design.mjs"
import { attachMotion, effects, recordMotion, translations } from "./motion.mjs"

let backend
test.beforeAll(async () => {
  backend = await createBrowserBackend()
  const instanceId = (await backend.db.query("select instance_id from private.instance_config")).rows[0].instance_id
  for (const key of ["nescafe-iust", "brew-and-brink"]) await backend.db.exec(createCafeMenuImportSQL({ ...await loadCafeMenu(key), instanceId }))
  await backend.db.exec(createCafePhotoUpdateSQL({ ...await loadCafePhotoUpdate("nescafe-hot-drink-cups"), instanceId }))
})
test.afterAll(async () => { await backend?.close() })
test.beforeEach(async ({ context, page }) => {
  backend.errors.length = 0
  await backend.attach(context)
  page.on("pageerror", error => backend.errors.push(error.message))
})
test.afterEach(() => { expect(backend.errors).toEqual([]) })

for (const width of [360, 768, 1024, 1440, 1920]) {
  test(`[mocked API] Brew and Brink sizes, sections and café switching work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto("/canteen-prices")
    await expect(page.getByRole("heading", { name: "BREW AND BRINK", exact: true })).toBeVisible()
    await expect(page.locator(".cafe-subtitle")).toHaveText("University Café – Food & Beverages Menu")
    await expect(page.locator(".menu-card")).toHaveCount(29)
    await expect(page.locator(".cafe-cover > img")).toHaveAttribute("src", "/images/menu/takeaway-latte.webp")
    await expect(page.locator(".menu-provenance")).toContainText("Prices from the supplied menu.")
    await expect(page.getByRole("group", { name: "Menu category", exact: true }).getByRole("button")).toHaveCount(6)
    for (const image of await page.locator(".menu-card img").all()) await image.scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator(".menu-card img,.cafe-cover > img").evaluateAll(images => images.length === 30 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    const contrast = await textContrast(page, ".cafe-kicker,.cafe-subtitle,.cafe-location,.cafe-description,.cafe-facts strong,.cafe-facts span,.cafe-facts .btn,.menu-provenance,.menu-card-category,.menu-card-title h3,.menu-card-price,.menu-price-label,.menu-card .menu-photo-credit,.menu-budget-picks button")
    expect(contrast.filter(item => item.ratio < 4.5)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.evaluate(() => document.fonts.ready)
    await settleCards(page)
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

  test(`[mocked API] published menu prices compare side by side and retain café selections at ${width}px`, async ({ page }, testInfo) => {
    if (width === 1440) await recordMotion(page)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto("/canteen-prices?view=compare")
    await expect(page.locator(".menu-comparison-card")).toHaveCount(3)
    const first = page.getByRole("combobox", { name: "First café", exact: true }), second = page.getByRole("combobox", { name: "Second café", exact: true })
    const brew = await first.inputValue(), nescafe = await second.inputValue()
    const cold = page.getByRole("article", { name: "Cold Coffee", exact: true })
    await expect(cold.locator(".price-amount")).toHaveText(["₹110", "₹70"])
    await expect(cold.locator(".price-comparison")).toContainText("₹40")
    await expect(page.getByRole("article", { name: "Cheese Fries", exact: true }).locator(".price-comparison")).toContainText("₹60")
    await expect(page.getByRole("article", { name: "Chicken Popcorn", exact: true }).locator(".price-comparison")).toContainText("₹10")
    await settleCards(page)
    if (width === 1440) {
      for (const [index, card] of (await page.locator(".menu-comparison-card").all()).entries()) {
        expect((await effects(card)).some(effect => effect.duration === 550 && effect.delay === Math.min(index * 50, 250))).toBe(true)
        const samples = await translations(card)
        expect(samples.some(sample => sample.y === 18)).toBe(true)
        expect(samples.some(sample => sample.y > 0 && sample.y < 18)).toBe(true)
        await expect(card).toHaveCSS("transform", "none")
      }
      await attachMotion(page, testInfo)
    }
    const contrast = await textContrast(page, ".comparison-note,.comparison-offer h4,.price-amount,.status-badge,.portion-label,.price-comparison,.comparison-menu-link")
    expect(contrast.filter(item => item.ratio < 4.5)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: testInfo.outputPath(`cafe-comparisons-${width}.png`), fullPage: true })
    await page.getByLabel("Max INR", { exact: true }).fill("90")
    await expect(page.locator(".menu-comparison-card")).toHaveCount(2)
    await expect(page.getByRole("article", { name: "Cheese Fries", exact: true }).locator(".price-amount")).toHaveText(["₹150", "₹90"])
    await page.getByRole("combobox", { name: "Price order", exact: true }).selectOption("difference")
    await expect(page.locator(".menu-comparison-card").first()).toContainText("Cheese Fries")
    await page.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Cold beverages" })
    await expect(page.locator(".menu-comparison-card")).toHaveCount(1)
    await page.getByRole("searchbox", { name: "Search canteen items" }).fill("No matching meal")
    await expect(page.getByRole("heading", { name: "No matches for these filters." })).toBeVisible()
    await page.getByRole("button", { name: "Reset comparison filters", exact: true }).click()
    await expect(page.locator(".menu-comparison-card")).toHaveCount(3)
    await page.getByRole("button", { name: "Swap cafés", exact: true }).click()
    await expect(first).toHaveValue(nescafe); await expect(second).toHaveValue(brew)
    await expect(cold.locator(".price-amount")).toHaveText(["₹70", "₹110"])
    await page.reload()
    await expect(first).toHaveValue(nescafe); await expect(second).toHaveValue(brew)
    await page.getByRole("link", { name: "Café menus", exact: true }).click()
    await expect(page.getByRole("heading", { name: "NESCAFÉ IUST", level: 2, exact: true })).toBeVisible()
    await page.getByRole("link", { name: "Compare prices", exact: true }).click()
    await expect(first).toHaveValue(nescafe)
    await expect(cold.locator(".price-amount")).toHaveText(["₹70", "₹110"])
    await first.selectOption(brew)
    await expect(second).toHaveValue(nescafe)
    await expect(cold.locator(".price-amount")).toHaveText(["₹110", "₹70"])
    await cold.getByRole("link", { name: "View BREW AND BRINK menu", exact: true }).click()
    await expect(page.getByRole("heading", { name: "BREW AND BRINK", level: 2, exact: true })).toBeVisible()
    await expect(page.locator(".menu-card")).toHaveCount(1)
    await expect(page.locator(".menu-card-price")).toHaveText("₹110")
  })
}

test("[mocked API] café comparisons recover from a failed menu request", async ({ page }) => {
  backend.failNext.set("get_canteen_menu_comparisons", 1)
  await page.goto("/canteen-prices?view=compare")
  await expect(page.getByRole("alert")).toContainText("simulated database outage")
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(page.locator(".menu-comparison-card")).toHaveCount(3)
})
