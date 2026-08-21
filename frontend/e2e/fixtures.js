import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** Where everything is listening, written by the global setup. */
export const state = () => JSON.parse(readFileSync(resolve(here, '.e2e-state.json'), 'utf8'))

/** The seeded demo customer. Its password is in the README; it is not a secret. */
export const DEMO_CUSTOMER = {
    email: 'demo@netronix.test',
    password: 'NetronixDemo123!',
}

/** A complete Lebanese address, in the shape the checkout form submits. */
export const ADDRESS = {
    firstName: 'Demo',
    lastName: 'Customer',
    email: 'demo@netronix.test',
    street: '124 Rue Gouraud',
    city: 'Beirut',
    state: 'Beirut Governorate',
    zipcode: '02022',
    country: 'Lebanon',
    phone: '+961 71 000 000',
}

/**
 * The visible element with this text.
 *
 * The storefront renders each product grid twice — a `md:hidden` carousel and a
 * `hidden md:grid` grid — so `.first()` alone picks whichever comes first in the
 * DOM, which at desktop width is the hidden one. `visible=true` filters to what
 * a person can actually see, which is what these tests are about.
 */
export const visibleText = (page, text) => page.getByText(text).locator('visible=true').first()

/**
 * The price ceiling the storefront's slider should be showing, read from the
 * API rather than written down here.
 *
 * It has to be derived: `admin.spec.js` runs first and adds a product more
 * expensive than anything in the seed, so a hardcoded expectation asserts the
 * seed's catalog rather than the catalog the page is actually rendering — which
 * is how this test failed while the behaviour under test was correct. What the
 * assertion is *for* is that the ceiling comes from the catalog at all; the old
 * defect was a constant 1000 that hid every laptop.
 */
export async function catalogCeiling() {
    const response = await fetch(`${state().apiUrl}/api/product/list`)
    const body = await response.json()
    const products = body.items ?? body.products ?? []
    const prices = products
        .map((product) => (Number.isFinite(product.priceMinor) ? product.priceMinor / 100 : product.price))
        .filter((price) => Number.isFinite(price))

    const highest = Math.max(...prices)
    return { highest, ceiling: highest <= 1000 ? Math.ceil(highest / 100) * 100 : Math.ceil(highest / 1000) * 1000 }
}

/**
 * Walk the whole page from top to bottom and back.
 *
 * The homepage mounts its lower sections on approach (PERF-003,
 * `DeferredSection`), so a test that asserts on them has to reach them the way
 * a visitor does. Stepping rather than jumping to the bottom, because a single
 * jump can skip past a section's `rootMargin` without ever intersecting it.
 */
export async function scrollThroughPage(page, step = 600) {
    // Re-read the height as deferred sections mount. A single initial height
    // stopped before content added during the walk.
    const deadline = Date.now() + 12_000
    for (let y = 0; Date.now() < deadline; y += step) {
        const height = await page.evaluate(() => document.body.scrollHeight)
        if (y >= height) break
        await page.evaluate((top) => window.scrollTo(0, top), y)
        await page.waitForTimeout(80)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    // One frame for the mounts triggered on the way down to settle.
    await page.waitForTimeout(400)
}

/** The visible link with this accessible name. Product cards are links. */
export const visibleLink = (page, name) =>
    page.getByRole('link', { name }).locator('visible=true').first()

/**
 * Open a product from a listing and put one in the cart.
 *
 * The order matters. `getByRole('heading', { level: 1 })` was the readiness
 * condition here, and it is satisfied before the product's *variant* section
 * exists — so `axes.count()` returned 0 on a product that has axes, nothing was
 * selected, and the helper then waited thirty seconds for an "ADD TO CART" the
 * page was never going to render because the button still read "SELECT
 * OPTIONS". The call to action is the honest readiness signal: its label *is*
 * the state machine, and it only appears once the product has loaded.
 */
export async function addFirstAvailableToCart(page, productName) {
    await visibleLink(page, productName).click()

    // One locator across all three labels, so it keeps resolving as the state
    // changes rather than going stale the moment an option is chosen.
    const cta = page.getByRole('button', { name: /^(ADD TO CART|SELECT OPTIONS|OUT OF STOCK)$/ })
    await expect(cta).toBeVisible()

    // One option per axis, scoped to the product page's own variant rows —
    // `getByRole('group')` alone would also match any other grouping on the
    // page, and clicking the first button inside one of those selects nothing.
    const axes = page.locator('[role="group"][aria-labelledby^="variant-axis-"]')
    const axisCount = await axes.count()

    for (let i = 0; i < axisCount; i += 1) {
        const options = axes.nth(i).getByRole('button')
        if (await options.count() > 0) await options.first().click()
    }

    // If the first option of the last axis happens to be the sold-out one, try
    // the next. A product with no axes has one combination and needs none of
    // this: its key is the empty string, and the button is already live.
    if (axisCount > 0) {
        const lastAxis = axes.nth(axisCount - 1).getByRole('button')
        const optionCount = await lastAxis.count()
        for (let j = 1; j < optionCount; j += 1) {
            if ((await cta.textContent())?.trim() === 'ADD TO CART') break
            await lastAxis.nth(j).click()
        }
    }

    await expect(cta).toHaveText('ADD TO CART')
    await cta.scrollIntoViewIfNeeded()
    await cta.click()

    // And it is only added when it has actually landed. A click the provider
    // discarded used to surface a hundred lines later as an empty cart page,
    // which is how a variant-less product being unbuyable stayed hidden.
    const landed = await page
        .waitForFunction(() => {
            if (window.localStorage.getItem('token')) return true
            const cart = window.localStorage.getItem('guestCart')
            return Boolean(cart && cart !== '{}')
        }, null, { timeout: 15_000 })
        .catch(() => null)
    expect(landed, `"${productName}" was clicked into the cart but never reached it`).not.toBeNull()
}

/**
 * A signed-in session, without driving the sign-in form.
 *
 * `authLimiter` allows five authentication attempts per IP per fifteen minutes
 * (SEC-005) and that budget is shared by the **whole suite**: the admin spec
 * signs in, the accessibility spec needs an admin session, and two storefront
 * flows sign a customer in. A full run sat right on the threshold, so whichever
 * login happened to be last intermittently got a 429 and its test failed with
 * a symptom — "still on /login" — that had nothing to do with what it was
 * testing.
 *
 * So: one API sign-in per run, cached, replayed into `localStorage`. Flows that
 * are *about* signing in still use `signIn()` below and drive the real form —
 * flow 9/7 is the cart-merge journey and must. Flows that merely need a session
 * to exist use this.
 */
export async function authenticate(page) {
    const { customerToken } = state()
    if (!customerToken) throw new Error('the E2E harness did not provision a customer session')

    await page.addInitScript((token) => {
        window.localStorage.setItem('token', token)
    }, customerToken)

    return customerToken
}

export async function signIn(page, customer = DEMO_CUSTOMER) {
    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill(customer.email)
    await page.getByPlaceholder('••••••••').fill(customer.password)

    // A11Y-009 — scoped to `<main>`. Phase 4 gave the navbar's profile icon an
    // accessible name ("Sign in" when signed out), so a bare role+name query
    // now matches two controls and `.first()` picked the navbar one — which
    // navigates to /login rather than submitting the form, and left every
    // downstream assertion looking at the sign-in page.
    await page.getByRole('main').getByRole('button', { name: /^(sign in|login)$/i }).first().click()
}

export async function fillAddress(page, address = ADDRESS) {
    // The placeholders are the form's, verbatim. `getByPlaceholder` matches a
    // substring, so "Street Address" found nothing against a field whose
    // placeholder is "Street" — the checkout flow had never reached this far
    // before, so nobody had found out.
    await page.getByPlaceholder('First name').fill(address.firstName)
    await page.getByPlaceholder('Last name').fill(address.lastName)
    await page.getByPlaceholder('Email Address').fill(address.email)
    await page.getByPlaceholder('Street', { exact: true }).fill(address.street)
    await page.getByPlaceholder('City', { exact: true }).fill(address.city)
    await page.getByPlaceholder('State/Province').fill(address.state)
    await page.getByPlaceholder('Zip/Postal Code').fill(address.zipcode)
    await page.getByPlaceholder('Country').fill(address.country)
    await page.getByPlaceholder('Phone Number').fill(address.phone)
}
