#!/usr/bin/env node
// SEO-001 — the 1200×630 share card, generated locally.
//
//   node scripts/make-og-image.mjs
//
// Renders a local HTML page in the Chromium that Playwright already installed
// for the E2E suite and screenshots it at exactly 1200×630 into
// `public/og/netronix-og.png`. Nothing is downloaded and no service is called:
// the page is a `data:` URL, the typography is a system font stack, and the
// only artwork is the brand mark drawn as SVG.
//
// Why generated rather than hand-made: a share card that drifts out of step
// with the brand is worse than none, and this way regenerating it is one
// command with the source in version control.
//
// **Not a screenshot of the site.** The audit is explicit that a fabricated
// product screenshot would be dishonest; this is a typographic card that
// states the shop's name and what it sells, both of which are true.

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../public/og/netronix-og.png')

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    justify-content: space-between; padding: 72px 80px;
    background: radial-gradient(120% 100% at 82% 18%, #7d6ce0 0%, #5a4cbb 38%, #241f47 100%);
    color: #fff;
    font-family: "DejaVu Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mark { display: flex; align-items: center; gap: 22px; }
  .glyph {
    width: 68px; height: 68px; border-radius: 20px; background: #0f0d1f;
    display: flex; align-items: center; justify-content: center;
  }
  .glyph span { display:block; width: 30px; height: 8px; border-radius: 4px; background: #a99cf5; box-shadow: 0 14px 0 #a99cf5; }
  .wordmark { font-size: 40px; font-weight: 700; letter-spacing: 0.34em; }
  h1 { font-size: 82px; line-height: 1.05; font-weight: 700; letter-spacing: -0.01em; max-width: 15ch; }
  p { font-size: 30px; line-height: 1.35; color: rgba(255,255,255,0.82); max-width: 30ch; margin-top: 24px; }
  .rule { height: 6px; width: 132px; background: #fff; border-radius: 3px; margin-top: 40px; opacity: .9; }
  footer { display: flex; gap: 40px; font-size: 24px; color: rgba(255,255,255,0.72); letter-spacing: .04em; }
</style></head>
<body>
  <div class="mark">
    <div class="glyph"><span></span></div>
    <div class="wordmark">NETRONIX</div>
  </div>
  <div>
    <h1>Next-Gen Tech, Delivered.</h1>
    <p>Laptops, gaming PCs, components and audio — with real stock per variant.</p>
    <div class="rule"></div>
  </div>
  <footer>
    <span>Laptops</span><span>Gaming PCs</span><span>MacBooks</span><span>Audio</span><span>Accessories</span>
  </footer>
</body></html>`

const { chromium } = await import('@playwright/test')

mkdirSync(dirname(OUT), { recursive: true })

const browser = await chromium.launch()
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    await page.setContent(HTML, { waitUntil: 'load' })
    await page.screenshot({ path: OUT, type: 'png' })
    console.log(`wrote ${OUT}`)
} finally {
    await browser.close()
}
