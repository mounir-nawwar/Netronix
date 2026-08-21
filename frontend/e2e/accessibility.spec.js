// PHASE 4 — accessibility in a real browser.
//
// Three things only Chromium can answer, and the audit could not:
//
//   * **axe** on the pages that matter. The audit's accessibility section is
//     static analysis — "27 aria attributes, 0 roles" — and explicitly says no
//     axe scan was run. This is the scan.
//   * **A keyboard-only checkout.** A11Y-005's headline finding is that the
//     payment selector was two `<div onClick>`s, so *checkout could not be
//     completed without a mouse*. The journey below uses `keyboard.press` and
//     `keyboard.type` exclusively — there is not one `click()` in it — and it
//     ends on a real order.
//   * **Focus traps and focus restoration**, which are about where the browser
//     puts focus and cannot be simulated.

import AxeBuilder from '@axe-core/playwright'

import { test, expect } from './test.js'
import { ADDRESS, DEMO_CUSTOMER, scrollThroughPage, state, visibleLink } from './fixtures.js'

/**
 * Gate 4 fails on critical and serious violations.
 *
 * Moderate and minor ones are reported in the run output and not enforced,
 * which is a deliberate line rather than an oversight: the moderate bucket is
 * dominated by heading-order and landmark-uniqueness rules whose "fix" on a
 * marketing page is often to make the markup worse. What is enforced is
 * everything that stops somebody using the site.
 */
const BLOCKING = ['critical', 'serious']

/**
 * Let the entrance animations finish before scanning.
 *
 * Almost every section on this site fades and slides in on mount. axe computes
 * colour contrast from the *composited* colour, so an element caught at
 * `opacity: 0.3` half way through a 300 ms fade is reported as a contrast
 * violation that no visitor ever experiences. Waiting for the finite animations
 * to settle is the difference between measuring the page and measuring the
 * transition into it.
 *
 * Infinite animations — the two brand marquees — are skipped, because their
 * `finished` promise never resolves.
 */
async function settleAnimations(page) {
    await page.evaluate(async () => {
        if (typeof document.getAnimations !== 'function') return
        const finite = document.getAnimations().filter((animation) => {
            const timing = animation.effect?.getTiming?.()
            return timing && timing.iterations !== Infinity
        })
        await Promise.all(finite.map((animation) => animation.finished.catch(() => { })))
    })
    // framer-motion drives some values off rAF rather than WAAPI, so those are
    // not in `getAnimations()`. One settle frame plus a small margin covers them.
    await page.waitForTimeout(600)
}

async function scan(page, { include, disableRules = [] } = {}) {
    await settleAnimations(page)

    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    if (include) builder = builder.include(include)
    if (disableRules.length > 0) builder = builder.disableRules(disableRules)

    const results = await builder.analyze()
    const blocking = results.violations.filter((violation) => BLOCKING.includes(violation.impact))
    const other = results.violations.filter((violation) => !BLOCKING.includes(violation.impact))

    if (other.length > 0) {
        console.log(`[axe] ${page.url()} — ${other.length} non-blocking: ${other.map((v) => `${v.id}(${v.impact})`).join(', ')}`)
    }
    return { blocking, other, results }
}

/**
 * Put an admin session into the browser without driving the sign-in form.
 *
 * Deliberately **not** a UI login. `authLimiter` allows five authentication
 * attempts per IP per fifteen minutes (SEC-005), and that budget is shared by
 * the whole suite: `admin.spec.js` signs in, `storefront.spec.js` signs a
 * customer in twice, and adding two more form logins here pushed a later
 * sign-in past the threshold — so a storefront flow failed with a 429 that had
 * nothing to do with what it was testing. Signing in through the API once and
 * reusing the token costs one attempt for this whole file.
 *
 * The console's own login form is covered by `admin.spec.js`, which is where
 * that behaviour belongs.
 */
async function adminSession(page) {
    const { adminUrl, adminToken } = state()
    if (!adminToken) throw new Error('the E2E harness did not provision an admin session')

    await page.addInitScript((token) => {
        window.localStorage.setItem('token', token)
    }, adminToken)

    return adminUrl
}

const report = (blocking) => blocking
    .map((violation) => `${violation.impact} · ${violation.id} · ${violation.nodes.length} node(s)\n    ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join('\n    ')}`)
    .join('\n\n')

// ---------------------------------------------------------------------------
test.describe('axe — zero critical or serious violations', () => {
    test('home', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByRole('heading', { name: /best sellers/i })).toBeVisible()

        // The lower sections mount on approach (PERF-003), so the scan walks
        // the page first. Without this the homepage scan would quietly cover
        // only the top third of it, and shrinking a check's coverage to make it
        // pass is the failure mode this whole suite exists to avoid.
        await scrollThroughPage(page)

        // The hero is a third-party `<iframe>` to my.spline.design. axe cannot
        // reach into a cross-origin frame, and this project does not own its
        // contents; what it *can* be held to — that the frame has a title — is
        // asserted directly below and in the unit suite.
        const { blocking } = await scan(page)
        expect(report(blocking)).toBe('')
    })

    test('the hero iframe is titled', async ({ page }) => {
        await page.goto('/')
        const frame = page.locator('iframe[src*="spline.design"]')
        await expect(frame).toHaveAttribute('title', /3D robot scene/i)
        // A11Y-006 — `frameborder` was the invalid React prop spelling.
        await expect(frame).toHaveAttribute('frameborder', '0')
    })

    test('a seeded product page', async ({ page }) => {
        await page.goto('/products')
        await visibleLink(page, 'MacBook Pro 16" M4 Pro').click()
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()

        const { blocking } = await scan(page)
        expect(report(blocking)).toBe('')
    })

    test('cart, with something in it', async ({ page }) => {
        await page.goto('/products')
        await visibleLink(page, 'MacBook Pro 16" M4 Pro').click()
        const cta = page.getByRole('button', { name: /^(ADD TO CART|SELECT OPTIONS|OUT OF STOCK)$/ })
        await expect(cta).toBeVisible()
        const axes = page.locator('[role="group"][aria-labelledby^="variant-axis-"]')
        for (let i = 0; i < await axes.count(); i += 1) {
            const options = axes.nth(i).getByRole('button')
            if (await options.count() > 0) await options.first().click()
        }
        if (await cta.textContent() === 'ADD TO CART') await cta.click()

        await page.goto('/cart')
        const { blocking } = await scan(page)
        expect(report(blocking)).toBe('')
    })

    test('checkout', async ({ page }) => {
        await page.goto('/placeorder')
        await expect(page.getByRole('group', { name: /payment method/i })).toBeVisible()

        const { blocking } = await scan(page)
        expect(report(blocking)).toBe('')
    })

    test('the open support chat', async ({ page }) => {
        await page.goto('/')
        await page.getByRole('button', { name: /open support chat/i }).click()
        await expect(page.getByRole('dialog', { name: /netronix support/i })).toBeVisible()

        const { blocking } = await scan(page, { include: '[role="dialog"]' })
        expect(report(blocking)).toBe('')
    })

    test('the admin product list, with the inventory dialog open', async ({ page }) => {
        const adminUrl = await adminSession(page)

        await page.goto(`${adminUrl}/list`)
        await expect(page.getByRole('heading', { name: /^products$/i })).toBeVisible()

        await page.getByRole('button', { name: /^manage stock for /i }).first().click()
        await expect(page.getByRole('dialog')).toBeVisible()

        const { blocking } = await scan(page)
        expect(report(blocking)).toBe('')
    })
})

// ---------------------------------------------------------------------------
test.describe('A11Y-005 — the whole purchase, without a mouse', () => {
    /**
     * Move focus forward until the predicate matches, or give up.
     * Returns what it landed on, so a failure names the last thing focused.
     */
    async function tabUntil(page, predicate, { limit = 120 } = {}) {
        const seen = []
        for (let i = 0; i < limit; i += 1) {
            const description = await page.evaluate(() => {
                const el = document.activeElement
                if (!el) return null
                return {
                    tag: el.tagName,
                    type: el.getAttribute('type'),
                    name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60),
                    id: el.id,
                    href: el.getAttribute('href'),
                    placeholder: el.getAttribute('placeholder'),
                }
            })
            if (description) {
                seen.push(description)
                if (await predicate(description)) return { found: true, description, seen }
            }
            await page.keyboard.press('Tab')
        }
        return { found: false, description: null, seen }
    }

    test('browse → product → variant → cart → checkout complete, keyboard only', async ({ page }) => {
        // No `click()` appears anywhere below this line. Everything is Tab,
        // Enter, Space, arrow keys and typing.
        await page.goto('/products')
        // The page's own `<h1>` is "Products"; "All Products" is its <title>.
        await expect(page.getByRole('heading', { name: /^products$/i }).first()).toBeVisible()

        // --- reach a product card and open it
        const card = await tabUntil(page, async (el) => el.href?.includes('/product/'))
        expect(card.found, `never reached a product link; last focused: ${JSON.stringify(card.seen.slice(-3))}`).toBe(true)
        await page.keyboard.press('Enter')

        const cta = page.getByRole('button', { name: /^(ADD TO CART|SELECT OPTIONS|OUT OF STOCK)$/ })
        await expect(cta).toBeVisible()

        // --- choose one option on each variant axis, by keyboard
        const axes = page.locator('[role="group"][aria-labelledby^="variant-axis-"]')
        const axisCount = await axes.count()
        for (let i = 0; i < axisCount; i += 1) {
            const label = await axes.nth(i).getAttribute('aria-labelledby')
            const reached = await tabUntil(page, async () => {
                const inside = await page.evaluate((selector) => {
                    const group = document.querySelector(`[aria-labelledby="${selector}"]`)
                    return Boolean(group && document.activeElement && group.contains(document.activeElement))
                }, label)
                return inside
            }, { limit: 200 })
            expect(reached.found, `could not tab into variant axis ${label}`).toBe(true)
            await page.keyboard.press('Enter')
        }

        // --- add to cart
        await expect(cta).toHaveText('ADD TO CART')
        const reachedCta = await tabUntil(page, async (el) => el.name === 'ADD TO CART', { limit: 200 })
        expect(reachedCta.found, 'could not tab to ADD TO CART').toBe(true)
        await page.keyboard.press('Enter')

        await page.waitForFunction(() => {
            const cart = window.localStorage.getItem('guestCart')
            return Boolean(window.localStorage.getItem('token')) || Boolean(cart && cart !== '{}')
        }, null, { timeout: 15_000 })

        // --- to the checkout
        await page.goto('/placeorder')
        const group = page.getByRole('group', { name: /payment method/i })
        await expect(group).toBeVisible()

        // --- fill the address, by keyboard
        for (const [placeholder, value] of [
            ['First name', ADDRESS.firstName],
            ['Last name', ADDRESS.lastName],
            ['Email Address', DEMO_CUSTOMER.email],
            ['Street', ADDRESS.street],
            ['City', ADDRESS.city],
            ['State/Province', ADDRESS.state],
            ['Zip/Postal Code', ADDRESS.zipcode],
            ['Country', ADDRESS.country],
            ['Phone Number', ADDRESS.phone],
        ]) {
            const reached = await tabUntil(page, async (el) => el.placeholder === placeholder, { limit: 200 })
            expect(reached.found, `could not tab to the "${placeholder}" field`).toBe(true)
            await page.keyboard.type(value)
        }

        // --- the payment selector: the finding itself.
        //
        // Two `<div onClick>`s could not be reached by Tab at all. As a real
        // radio group, Tab reaches the checked radio and the arrow keys move
        // between the options — which is what the platform gives you for free
        // and what the divs threw away.
        const reachedRadio = await tabUntil(page, async (el) => el.type === 'radio', { limit: 200 })
        expect(reachedRadio.found, 'could not tab to a payment radio — A11Y-005 has regressed').toBe(true)

        await page.keyboard.press('ArrowUp')
        await expect(page.getByRole('radio', { name: /whish/i })).toBeChecked()
        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('radio', { name: /cash on delivery/i })).toBeChecked()

        // --- place the order
        const reachedSubmit = await tabUntil(page, async (el) => /place order/i.test(el.name), { limit: 200 })
        expect(reachedSubmit.found, 'could not tab to the submit button').toBe(true)
        await page.keyboard.press('Enter')

        // Evidence that the order actually happened, not that a button was
        // pressed: the checkout navigates away (a guest lands on the homepage,
        // flow 11), **and** the guest cart is cleared — which the provider does
        // only after the server has accepted the order.
        await page.waitForURL(/\/$|\/orders/, { timeout: 30_000 })
        await expect.poll(
            async () => page.evaluate(() => window.localStorage.getItem('guestCart')),
            { timeout: 15_000 },
        ).toBeNull()
    })
})

// ---------------------------------------------------------------------------
test.describe('A11Y-002 — focus traps and focus restoration', () => {
    test('the support chat traps focus and hands it back on Escape', async ({ page }) => {
        await page.goto('/')
        const launcher = page.getByRole('button', { name: /open support chat/i })
        await launcher.focus()
        await page.keyboard.press('Enter')

        const dialog = page.getByRole('dialog', { name: /netronix support/i })
        await expect(dialog).toBeVisible()
        await expect.poll(async () => page.evaluate(() =>
            Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)))).toBe(true)

        // Twenty tabs cannot leave a panel with a handful of controls.
        for (let i = 0; i < 20; i += 1) {
            await page.keyboard.press('Tab')
            const inside = await page.evaluate(() =>
                Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)))
            expect(inside, `focus escaped the chat after ${i + 1} tabs`).toBe(true)
        }

        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect.poll(async () => page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'))).toMatch(/support chat/i)
    })

    test('the search overlay traps focus and hands it back', async ({ page }) => {
        await page.goto('/products', { waitUntil: 'domcontentloaded' })
        const opener = page.getByRole('button', { name: /search products/i }).first()
        await expect(opener).toBeVisible({ timeout: 15_000 })
        await opener.focus()
        await page.keyboard.press('Enter')

        const dialog = page.getByRole('dialog', { name: /search products/i })
        await expect(dialog).toBeVisible()

        for (let i = 0; i < 12; i += 1) {
            await page.keyboard.press('Tab')
            const inside = await page.evaluate(() =>
                Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)))
            expect(inside, `focus escaped the search overlay after ${i + 1} tabs`).toBe(true)
        }

        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect.poll(async () => page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'))).toMatch(/search products/i)
    })

    test('the admin inventory dialog traps focus and hands it back', async ({ page }) => {
        const adminUrl = await adminSession(page)

        await page.goto(`${adminUrl}/list`)
        const opener = page.getByRole('button', { name: /^manage stock for /i }).first()
        await expect(opener).toBeVisible()
        const openerName = await opener.getAttribute('aria-label')
        await opener.focus()
        await page.keyboard.press('Enter')

        await expect(page.getByRole('dialog')).toBeVisible()
        for (let i = 0; i < 15; i += 1) {
            await page.keyboard.press('Tab')
            const inside = await page.evaluate(() =>
                Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)))
            expect(inside, `focus escaped the inventory dialog after ${i + 1} tabs`).toBe(true)
        }

        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
        await expect.poll(async () => page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'))).toBe(openerName)
    })
})

// ---------------------------------------------------------------------------
test.describe('A11Y-008 — the skip link', () => {
    test('is the first thing Tab reaches, and moves focus to the content', async ({ page }) => {
        await page.goto('/cart')

        // Wait for the page to exist before pressing a key at it.
        //
        // This is the one test in the suite that sends a keystroke rather than
        // driving a locator, so it is the one test with no auto-waiting of its
        // own — and `goto` resolves on `load`, which is not the same moment as
        // "React has committed". It used to be, because `main.jsx` rendered
        // inline during module evaluation and module scripts run before `load`.
        // The first mount is a transition now (PERF-003), so the commit is
        // scheduled rather than inline and lands just after `load`.
        //
        // What that changes is *this line*, not the behaviour under test. A
        // Tab pressed against an empty `#root` focuses `<body>` and the single
        // press is spent; measured directly, once the shell is committed, Tab
        // reaches `.skip-link` on the first press every time. The assertions
        // below are untouched — the skip link is still required to be the first
        // stop in the tab order and to move focus into `<main>`.
        await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible()

        await page.keyboard.press('Tab')

        const skip = page.getByRole('link', { name: /skip to main content/i })
        await expect(skip).toBeFocused()
        // Off-screen until focused, on-screen once it is.
        await expect(skip).toBeVisible()

        await page.keyboard.press('Enter')
        await expect.poll(async () => page.evaluate(() =>
            document.activeElement?.id || document.activeElement?.tagName)).toMatch(/main-content|MAIN/i)
    })
})
