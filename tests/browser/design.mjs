import { expect } from "@playwright/test"

// Trigger the existing viewport-once entrances; never disable or fast-forward them.
export async function settleCards(page, selectors = ".feature-card,.profile-card,.menu-comparison-card") {
  const cards = page.locator(selectors)
  for (const card of await cards.all()) await card.scrollIntoViewIfNeeded()
  await expect.poll(() => cards.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === "1"))).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
}

// Rendered solid-surface text contrast. This is not a full accessibility audit.
export async function textContrast(page, selectors) {
  return page.locator(selectors).evaluateAll(nodes => {
    const colour = value => {
      const values = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]
      return [...values.slice(0, 3), values[3] ?? 1]
    }
    const blend = (front, back) => front.slice(0, 3).map((channel, i) => channel * front[3] + back[i] * (1 - front[3]))
    const luminance = rgb => rgb.map(channel => {
      const value = channel / 255
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
    }).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0)
    return nodes.filter(node => node.getClientRects().length && !node.disabled).map(node => {
      const ancestors = []
      for (let parent = node; parent; parent = parent.parentElement) ancestors.unshift(parent)
      let background = [255, 255, 255]
      for (const parent of ancestors) background = blend(colour(getComputedStyle(parent).backgroundColor), background)
      const foreground = blend(colour(getComputedStyle(node).color), background)
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      return { text: node.textContent.trim().slice(0, 90), class: node.className, ratio: (values[0] + .05) / (values[1] + .05) }
    })
  })
}
