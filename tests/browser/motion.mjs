// Observe native effects and Motion's inline transforms without changing code or timing.
export async function recordMotion(page) {
  await page.addInitScript(() => {
    window.__motion = []
    window.__motionTransforms = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args)
      window.__motion.push({ target: this, frames: animation.effect.getKeyframes(), timing: animation.effect.getTiming(), at: performance.now() })
      return animation
    }
    // Motion can animate opacity natively while translating the same node in JS.
    const selectors = ".hero-intro,.hero-art,.feature-card,.profile-card,.menu-comparison-card"
    const last = new WeakMap()
    const capture = (target, style = target.getAttribute("style")) => {
      if (!target.matches(selectors)) return
      const transform = style?.match(/(?:^|;)\s*transform:\s*([^;]+)/)?.[1]?.trim() || "none"
      if (last.get(target) === transform) return
      last.set(target, transform)
      window.__motionTransforms.push({ target, transform, y: new DOMMatrixReadOnly(transform).m42, at: performance.now() })
    }
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.oldValue !== null) capture(record.target, record.oldValue)
          capture(record.target)
        } else for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) {
          capture(node)
          for (const child of node.querySelectorAll(selectors)) capture(child)
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"], attributeOldValue: true })
  })
}
export const effects = locator => locator.evaluate(node => window.__motion.filter(entry => entry.target === node)
  .map(({ frames, timing }) => ({ frames, duration: timing.duration, delay: timing.delay })))
export const translations = locator => locator.evaluate(node => window.__motionTransforms.filter(entry => entry.target === node)
  .map(({ transform, y, at }) => ({ transform, y, at })))

export async function attachMotion(page, testInfo) {
  const ledger = await page.evaluate(() => window.__motion.map(({ target, frames, timing }) => ({
    tag: target.tagName, class: target.className, parent: target.parentElement?.className, frames, timing,
  })))
  await testInfo.attach("observed-browser-animations", { body: JSON.stringify(ledger, null, 2), contentType: "application/json" })
  const transforms = await page.evaluate(() => window.__motionTransforms.map(({ target, transform, y, at }) => ({
    tag: target.tagName, class: target.className, transform, y, at,
  })))
  await testInfo.attach("observed-inline-transforms", { body: JSON.stringify(transforms, null, 2), contentType: "application/json" })
}
