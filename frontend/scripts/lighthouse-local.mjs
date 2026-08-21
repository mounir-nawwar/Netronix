#!/usr/bin/env node
// Gate 4 — Lighthouse, against the local seeded stack.
//
//   node scripts/lighthouse-local.mjs
//
// **There is no baseline to compare against.** The audit says so explicitly:
// "No Lighthouse run, no axe scan, no screen-reader session, no real-device
// testing." Every Core Web Vitals figure in section 10 is reasoned from bundle
// composition and is flagged as needing runtime verification. So this script
// records what it measures *after* Phase 4 and nothing else — there is no
// before/after table here, because the "before" would have to be invented.
//
// How it runs:
//
//   * It brings up the same bounded local stack the Playwright suite uses
//     (`e2e/lifecycle.js` + `backend/scripts/e2eEnv.js`): an in-memory MongoDB
//     this process creates and destroys, a seeded catalog, and the API.
//     Nothing survives the run.
//   * It measures the **production build**, served by `vite preview` — not the
//     dev server. The first version of this script pointed Lighthouse at
//     `vite dev` and reported Performance 10 with 11.6 MB of transfer, because
//     a dev server ships the unbundled module graph: hundreds of unminified
//     requests that no visitor ever makes. That is a measurement of the
//     tooling. The API's URL is baked in at build time, so the API starts
//     first and the build is done against it.
//   * **Third-party hosts are blocked at the browser** with
//     `--host-resolver-rules`, so nothing outside loopback is contacted: this
//     phase makes no external request, and a Google Fonts stylesheet or the
//     hero's `my.spline.design` iframe hanging on a machine with no route to
//     them would be measuring the network rather than the page. What these
//     numbers describe is therefore **this application's own delivery**, and
//     the status document says so wherever it quotes them.
//   * It drives the Chromium that Playwright already installed — located with
//     `chromium.executablePath()` and started **directly**, not through
//     Playwright's own connection. Letting Playwright hold the CDP session and
//     Lighthouse hold another against the same browser produces
//     "Protocol error (Runtime.evaluate): Promise was collected" partway
//     through the trace, because the two clients race each other's execution
//     contexts. Lighthouse owns this browser outright.
//   * Each page is measured **three times per form factor and the median
//     reported**, which is what Lighthouse's own guidance asks for. A single
//     run on a shared cloud VM moves by ten points between invocations; a
//     median is the smallest thing that is honest to quote.
//   * Both **mobile** (4× CPU throttling, simulated slow 4G — Lighthouse's
//     default and the harder configuration) and **desktop** are run, and both
//     are reported. Quoting only the flattering one would be the whole problem
//     this project is about.
//   * It writes `.lighthouse/<formFactor>-<page>.json` plus a summary table,
//     and exits non-zero if Performance < 80 or Accessibility < 95 on any page
//     in the mobile configuration.
//
// **Local numbers are local numbers.** This measures a Vite production build
// served by `vite preview` on loopback on one machine. It is a real measurement
// of a real page; it is not a claim about production hosting. Any accepted
// exception is documentation only and does not alter the executable thresholds.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    assertApiHealthy, assertLighthousePageHealthy, guestCartFixture, normaliseLighthouseOptions,
} from './lighthouse-options.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const repoRoot = resolve(root, '..')
const OUT_DIR = resolve(root, '.lighthouse')

/** Gate 4's thresholds. */
export const THRESHOLDS = { performance: 80, accessibility: 95 }

async function freePort() {
    return new Promise((settle, reject) => {
        const probe = createServer()
        probe.unref()
        probe.on('error', reject)
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address()
            probe.close(() => settle(port))
        })
    })
}

/** Run a command to completion, failing loudly. */
function run(command, args, env = {}) {
    return new Promise((settle, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            stdio: ['ignore', 'ignore', 'inherit'],
            env: { ...process.env, ...env },
        })
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? settle() : reject(new Error(`${args.join(' ')} exited ${code}`))))
    })
}

async function waitFor(url, label, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        try {
            const response = await fetch(url)
            if (response.status < 500) return
        } catch { /* not up yet */ }
        if (Date.now() > deadline) throw new Error(`${label} did not come up at ${url}`)
        await new Promise((r) => setTimeout(r, 500))
    }
}

// Its own ownership file, so a Lighthouse run and the Playwright suite cannot
// tread on each other's state — and so `e2e/assert-clean.mjs` is never handed a
// state file this script wrote.
process.env.NETRONIX_E2E_STATE = resolve(OUT_DIR, '.lighthouse-state.json')
mkdirSync(OUT_DIR, { recursive: true })

const { spawnOwned, terminateOwned, clearState } = await import(resolve(root, 'e2e/lifecycle.js'))

let api = null

async function main() {
    mkdirSync(OUT_DIR, { recursive: true })

    const { startE2EEnvironment } = await import(resolve(repoRoot, 'backend/scripts/e2eEnv.js'))

    const API_PORT = await freePort()
    const STOREFRONT_PORT = await freePort()

    api = await startE2EEnvironment({
        port: API_PORT,
        corsOrigins: [`http://127.0.0.1:${STOREFRONT_PORT}`, `http://localhost:${STOREFRONT_PORT}`],
    })
    await waitFor(`${api.apiUrl}/api/product/list`, 'the API')

    const origin = `http://127.0.0.1:${STOREFRONT_PORT}`

    console.log('building the storefront against the local API…')
    // `NODE_ENV: 'production'`, and it is not decoration.
    //
    // `backend/scripts/e2eEnv.js` sets `process.env.NODE_ENV = 'test'` when it
    // is imported — correctly, for the API it stands up. This script imports it
    // *before* it builds, and Vite defines `process.env.NODE_ENV` in the bundle
    // from the value it inherits. With `'test'` in the environment,
    // `react-dom`'s entry took its non-production branch and the measured build
    // shipped **`react.development.js`**: 354 kB of React where production is
    // 144 kB, with every warning path, prop check and dev-only invariant that
    // the development build exists to run.
    //
    // Every mobile number this script printed before this line was added was
    // therefore measuring a development React that no visitor is ever served —
    // slower to download and several times slower to render. The script's own
    // header promises "the production build"; this is what makes that true.
    // The API keeps `NODE_ENV=test`, because only the build's environment is
    // overridden here.
    await run(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], {
        NODE_ENV: 'production',
        VITE_BACKEND_URL: api.apiUrl,
        VITE_FRONTEND_URL: origin,
    })
    await run(process.execPath, [resolve(root, 'scripts/make-sitemap.mjs')], { VITE_FRONTEND_URL: origin })

    spawnOwned({
        label: `preview:${STOREFRONT_PORT}`,
        command: process.execPath,
        args: [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(STOREFRONT_PORT), '--host', '127.0.0.1', '--strictPort'],
        cwd: root,
        env: {},
        match: `preview --port ${STOREFRONT_PORT}`,
    })
    await waitFor(origin, 'the storefront preview')

    // A real seeded product id, so the product page under test is a real page.
    const catalog = await (await fetch(`${api.apiUrl}/api/product/list`)).json()
    const products = catalog.items ?? catalog.products ?? []
    if (products.length === 0) throw new Error('the seeded catalog is empty — nothing to measure')
    let guestCart = null
    for (const product of products) {
        try {
            guestCart = guestCartFixture(product)
            break
        } catch { /* keep looking for an in-stock seeded product */ }
    }
    if (!guestCart) throw new Error('the seeded catalog has no in-stock product for the cart measurement')

    const pages = [
        { name: 'home', url: `${origin}/` },
        { name: 'product', url: `${origin}/product/${products[0]._id}` },
        { name: 'cart', url: `${origin}/cart` },
    ]

    const { chromium } = await import('@playwright/test')
    const lighthouse = (await import('lighthouse')).default

    const debugPort = await freePort()
    const profileDir = resolve(OUT_DIR, 'chrome-profile')
    rmSync(profileDir, { recursive: true, force: true })
    mkdirSync(profileDir, { recursive: true })

    spawnOwned({
        label: `chrome:${debugPort}`,
        command: chromium.executablePath(),
        args: [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${profileDir}`,
            // Nothing outside loopback resolves. See the header.
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
            'about:blank',
        ],
        cwd: root,
        env: {},
        match: `--remote-debugging-port=${debugPort}`,
    })
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`, 'the Chromium debugging endpoint', 60_000)

    // Measure a real cart, not the empty-state component. Lighthouse normally
    // clears storage before every navigation, so preserve this deterministic
    // one-line guest cart for all attempts in the dedicated browser profile.
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
    const context = browser.contexts()[0]
    const seedPage = context.pages()[0] ?? await context.newPage()
    await seedPage.goto(origin)
    await seedPage.evaluate((cart) => {
        localStorage.setItem('guestCart', JSON.stringify(cart))
        localStorage.removeItem('guestCartLines')
    }, guestCart)
    await seedPage.addInitScript(({ storefrontOrigin, cart }) => {
        if (location.origin !== storefrontOrigin) return
        localStorage.setItem('guestCart', JSON.stringify(cart))
        localStorage.removeItem('guestCartLines')
    }, { storefrontOrigin: origin, cart: guestCart })
    await seedPage.evaluate(() => localStorage.clear())
    await seedPage.goto(`${origin}/cart`)
    await seedPage.waitForSelector('button[aria-label="Remove item"]', { timeout: 30_000 })

    const { runs: RUNS, formFactors: wanted } = normaliseLighthouseOptions(process.env)
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

    const FORM_FACTORS = {
        mobile: {
            formFactor: 'mobile',
            screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
        },
        desktop: {
            formFactor: 'desktop',
            screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
            throttling: {
                rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1,
                requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0,
            },
        },
    }

    const byFormFactor = {}
    try {
        for (const [name, settings] of Object.entries(FORM_FACTORS)) {
            if (!wanted.includes(name)) continue
            const rows = []
            for (const page of pages) {
                const runs = []
                for (let attempt = 0; attempt < RUNS; attempt += 1) {
                    await assertApiHealthy(api.apiUrl, origin)
                    const run = await lighthouse(page.url, {
                        port: debugPort,
                        output: 'json',
                        logLevel: 'error',
                        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
                        ...settings,
                    })
                    assertLighthousePageHealthy(run.lhr, api.apiUrl)
                    await assertApiHealthy(api.apiUrl, origin)
                    runs.push(run.lhr)
                }

                // Keep the run whose performance score is the median, so the
                // stored report and the quoted number describe the same load.
                const scores = runs.map((lhr) => Math.round((lhr.categories.performance?.score ?? 0) * 100))
                const target = median(scores)
                const lhr = runs[scores.indexOf(target)]
                writeFileSync(resolve(OUT_DIR, `${name}-${page.name}.json`), JSON.stringify(lhr, null, 2))

                rows.push({
                    page: page.name,
                    url: page.url,
                    runs: scores,
                    performance: target,
                    accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
                    bestPractices: Math.round((lhr.categories['best-practices']?.score ?? 0) * 100),
                    seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
                    lcpMs: Math.round(lhr.audits['largest-contentful-paint']?.numericValue ?? 0),
                    fcpMs: Math.round(lhr.audits['first-contentful-paint']?.numericValue ?? 0),
                    cls: Number((lhr.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
                    tbtMs: Math.round(lhr.audits['total-blocking-time']?.numericValue ?? 0),
                    transferBytes: Math.round(lhr.audits['total-byte-weight']?.numericValue ?? 0),
                })
            }
            byFormFactor[name] = rows
        }
    } finally {
        rmSync(profileDir, { recursive: true, force: true })
    }

    writeFileSync(resolve(OUT_DIR, `summary-${wanted.join('-')}.json`), JSON.stringify(byFormFactor, null, 2))

    for (const [name, rows] of Object.entries(byFormFactor)) {
        const description = name === 'mobile'
            ? 'mobile emulation, 4× CPU throttling, simulated slow 4G (Lighthouse default)'
            : 'desktop emulation, no CPU throttling'
        console.log(`\nLighthouse — local seeded stack, production build, ${description}`)
        console.log(`median of ${RUNS} runs per page; third-party hosts blocked at the browser`)
        console.log('page      perf  a11y  bp  seo   LCP     FCP     CLS    TBT    transfer   runs')
        console.log('─'.repeat(86))
        for (const r of rows) {
            console.log(
                `${r.page.padEnd(9)} ${String(r.performance).padStart(4)}  ${String(r.accessibility).padStart(4)}  `
                + `${String(r.bestPractices).padStart(2)}  ${String(r.seo).padStart(3)}  `
                + `${String(r.lcpMs).padStart(5)}ms ${String(r.fcpMs).padStart(5)}ms `
                + `${String(r.cls).padStart(5)}  ${String(r.tbtMs).padStart(4)}ms  ${(r.transferBytes / 1024).toFixed(0).padStart(6)} kB   `
                + `${r.runs.join('/')}`,
            )
        }
    }

    console.log('')
    let failed = false
    for (const [name, rows] of Object.entries(byFormFactor)) {
        // Deliberately not averaged across pages: the gate is per page.
        const failures = rows.filter(
            (r) => r.performance < THRESHOLDS.performance || r.accessibility < THRESHOLDS.accessibility,
        )
        if (failures.length === 0) {
            console.log(`LIGHTHOUSE ${name}: every page >= ${THRESHOLDS.performance} performance and >= ${THRESHOLDS.accessibility} accessibility.`)
        } else {
            failed = true
            for (const failure of failures) {
                console.error(
                    `FAIL ${name}/${failure.page}: performance ${failure.performance} `
                    + `(need >= ${THRESHOLDS.performance}), accessibility ${failure.accessibility} `
                    + `(need >= ${THRESHOLDS.accessibility})`,
                )
            }
        }
    }
    if (failed) process.exitCode = 1
}

try {
    await main()
} catch (error) {
    console.error('lighthouse-local failed:', error?.message ?? error)
    process.exitCode = 1
} finally {
    await terminateOwned()
    // `terminateOwned` empties the in-memory registry; it does not remove the
    // file. Without this the run leaves an ownership file naming two dead PIDs,
    // which is exactly what somebody checking for a leak would read as one.
    clearState()
    await api?.stop?.().catch(() => { })
}
