// Observe the browser's animation effects without changing application code or timing.
export async function recordMotion(page) {
  await page.addInitScript(() => {
    window.__motion = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args)
      window.__motion.push({ target: this, frames: animation.effect.getKeyframes(), timing: animation.effect.getTiming(), at: performance.now() })
      return animation
    }
  })
}
export const effects = locator => locator.evaluate(node => window.__motion.filter(entry => entry.target === node)
  .map(({ frames, timing }) => ({ frames, duration: timing.duration, delay: timing.delay })))

export async function attachMotion(page, testInfo) {
  const ledger = await page.evaluate(() => window.__motion.map(({ target, frames, timing }) => ({
    tag: target.tagName, class: target.className, parent: target.parentElement?.className, frames, timing,
  })))
  await testInfo.attach("observed-browser-animations", { body: JSON.stringify(ledger, null, 2), contentType: "application/json" })
}
