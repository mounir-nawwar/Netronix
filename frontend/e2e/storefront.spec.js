// PHASE 3 — the storefront flows, in a real browser, against a real API and a
// real (in-memory, seeded) database.
//
// Flow numbers refer to `.local-audit/03_END_TO_END_FLOWS.md`.

import { test, expect } from './test.js'

import { addFirstAvailableToCart, authenticate, catalogCeiling, fillAddress, revealAllProducts, scrollThroughPage, signIn, visibleLink } from './fixtures.js'

// ---------------------------------------------------------------------------
test.describe('flow 1/2 — startup and the catalog (FE-001, FE-006, PERF-005)', () => {
    test('runs one complete paginated catalog walk per page load', async ({ page }) => {
        const catalogRequests = []
        const tagRequests = []
        page.on('request', (request) => {
            const url = request.url()
            if (url.includes('/api/product/list')) catalogRequests.push(url)
            if (url.endsWith('/api/product/tags')) tagRequests.push(url)
        })

        await page.goto('/')
        await expect(page.getByRole('heading', { name: /best sellers/i })).toBeVisible()
        // Give any straggling section a chance to issue its own request.
        await page.waitForTimeout(1500)

        expect(catalogRequests, 'GET /api/product/list').toHaveLength(1)
        expect(tagRequests, 'GET /api/product/tags').toHaveLength(1)
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 8 — the homepage renders from seeded data (FE-004, PORT-001)', () => {
    test('every section shows real products, with no placeholders', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: /best sellers/i })).toBeVisible({ timeout: 15_000 })

        // PERF-003 — the sections below the countdown banner are mounted when a
        // visitor approaches them (`DeferredSection`), not before the hero has
        // painted: on the production build that took the homepage's blocking
        // time down by a third. They start several thousand pixels down, so
        // reaching them is what a person does too. Scrolling to the end and
        // back is how this test now sees the whole page — the assertions
        // themselves, which are about FE-004's invented placeholder content,
        // are unchanged.
        await scrollThroughPage(page)

        // FeaturedProducts — the tabbed grid. Asserted through the card links,
        // because each grid is rendered twice (a mobile carousel and a desktop
        // grid) and only one of the two is visible at any width.
        await expect(page.getByRole('heading', { name: /best sellers/i })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Latest Laptops' })).toBeVisible()
        await expect(visibleLink(page, 'MacBook Pro 16" M4 Pro')).toBeVisible()

        // ShopTheLook — the hotspots.
        await expect(page.getByRole('heading', { name: /professional workspace/i })).toBeVisible()
        await expect(page.getByLabel('View LG UltraGear 27" OLED')).toBeVisible()

        // FeaturedProduct + HeroVideo — the single-product surfaces.
        await expect(page.getByRole('heading', { name: 'Razer Cobra Pro' })).toBeVisible()

        // None of the invented fallbacks. `Razer Cobra Mouse` is the product
        // `FeaturedProduct` used to invent when its hardcoded id missed — note
        // that the *real* seeded product is "Razer Cobra Pro".
        await expect(page.getByText('Razer Cobra Mouse')).toHaveCount(0)
        await expect(page.getByText('Loading...')).toHaveCount(0)
        await expect(page.getByText('No featured products yet.')).toHaveCount(0)
        await expect(page.getByText('No workspace picks yet.')).toHaveCount(0)
    })

    test('the hero video call to action resolves to a real product page', async ({ page }) => {
        await page.goto('/')
        await scrollThroughPage(page)
        const cta = page.getByRole('link', { name: /view details/i }).first()
        await expect(cta).toBeVisible()
        await cta.click()
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        expect(page.url()).toMatch(/\/product\/[0-9a-f]{24}/)
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 4 — browse, filter, sort (FE-003, FE-010)', () => {
    test('/collections/all shows products above $1,000', async ({ page }) => {
        await page.goto('/collections/all')
        // The grid pages at twelve; these two are named explicitly, so the whole
        // result has to be on screen before they can be called missing.
        await revealAllProducts(page)
        // Seeded laptops start at $1,149 and the most expensive is $3,299 —
        // every one of them was hidden by the hardcoded ceiling.
        await expect(visibleLink(page, 'MacBook Pro 16" M4 Pro')).toBeVisible()
        await expect(visibleLink(page, 'Netronix Apex Battlestation')).toBeVisible()
    })

    test('the price slider reaches the top of the catalog', async ({ page }) => {
        await page.goto('/collections/all')
        await revealAllProducts(page)
        // Wait for the catalog to land: the ceiling is derived from it, so
        // asserting before it arrives measures the default, not the fix.
        await expect(visibleLink(page, 'Netronix Apex Battlestation')).toBeVisible()

        // The ceiling is read from the live catalog, not written down: the admin
        // spec runs first and adds a product dearer than anything seeded, so a
        // fixed number here asserts the wrong catalog. The defect being guarded
        // is the *hardcoded* 1000, which was written into the state, the `max`
        // attribute and the track's percentage arithmetic alike.
        const { highest, ceiling } = await catalogCeiling()
        expect(highest, 'the catalog has products above the old hardcoded ceiling').toBeGreaterThan(1000)

        // Price and the variant axes live in the Refine drawer now. They were a
        // permanent 16rem sidebar on every viewport — a quarter of the grid's
        // width spent on controls most visits never touch. Where the control is
        // presented is a design decision; what this test holds is that its
        // ceiling comes from the catalog rather than from a literal 1000, and
        // that is unchanged.
        await page.getByRole('button', { name: /refine/i }).click()

        const sliders = page.getByRole('slider')
        await expect(sliders).toHaveCount(2)
        // Polled: the ceiling is derived from the catalog, so the attribute
        // settles a moment after the grid does.
        for (let i = 0; i < 2; i += 1) {
            await expect
                .poll(async () => sliders.nth(i).getAttribute('max'), { timeout: 30_000 })
                .toBe(String(ceiling))
        }
    })

    test('a typed collection filters by tag', async ({ page }) => {
        await page.goto('/collections/macbooks')
        await revealAllProducts(page)
        await expect(visibleLink(page, 'MacBook Pro 16" M4 Pro')).toBeVisible()
        await expect(page.getByText('Netronix Apex Battlestation')).toHaveCount(0)
    })

    test('the tag filter offers only tags the catalog has', async ({ page }) => {
        await page.goto('/collections/all')
        // The taxonomy is chips in the sticky bar rather than a sidebar column,
        // but they are still real checkboxes with real labels — a
        // `<button aria-pressed>` would have looked the same and been worse for
        // a keyboard and a screen reader alike.
        await expect(page.getByLabel('Laptops')).toBeAttached()
        // Three of the forty names `addMissingCategories` injected.
        await expect(page.getByLabel('Networking')).toHaveCount(0)
        await expect(page.getByLabel('Clearance')).toHaveCount(0)
        await expect(page.getByLabel('Webcam')).toHaveCount(0)
    })

    test('search narrows the product list', async ({ page }) => {
        await page.goto('/products?search=MacBook')
        await revealAllProducts(page)
        await expect(visibleLink(page, 'MacBook Pro 16" M4 Pro')).toBeVisible()
        await expect(page.getByText('Sonos Era 300')).toHaveCount(0)
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 20 — routes and states (FE-020, FE-021)', () => {
    test('an unknown URL renders a 404, not empty chrome', async ({ page }) => {
        await page.goto('/nowhere-at-all')
        await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible()
        await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible()
    })

    test('/orders sends a signed-out visitor to sign in', async ({ page }) => {
        await page.goto('/orders')
        await expect(page).toHaveURL(/\/login/)
        await expect(page.getByText(/no orders found/i)).toHaveCount(0)
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 6 — the guest cart (FE-009)', () => {
    test('the last item removed stays gone after a reload', async ({ page }) => {
        await page.goto('/collections/all')
        await addFirstAvailableToCart(page, 'Sonos Era 300')

        await page.goto('/cart')
        await expect(page.getByText('Sonos Era 300').first()).toBeVisible()

        // Remove it, then reload. The stale-storage bug made it reappear.
        await page.getByRole('button', { name: 'Remove item' }).first().click()
        await expect(page.getByText(/your cart is empty/i)).toBeVisible()

        await page.reload()
        await expect(page.getByText(/your cart is empty/i)).toBeVisible()
        await expect(page.getByText('Sonos Era 300')).toHaveCount(0)
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 11 — guest checkout', () => {
    test('a guest can buy without an account', async ({ page }) => {
        await page.goto('/collections/all')
        await addFirstAvailableToCart(page, 'Anker Prime 27K Power Bank')

        await page.goto('/cart')
        const checkout = page.getByRole('button', { name: /proceed to checkout/i })
        await checkout.scrollIntoViewIfNeeded()
        await checkout.click()

        await expect(page).toHaveURL(/\/placeorder/)
        await fillAddress(page)

        // FE-032 — a `type="number"` input could not hold either of these.
        await expect(page.getByPlaceholder('Zip/Postal Code')).toHaveValue('02022')
        await expect(page.getByPlaceholder('Phone Number')).toHaveValue('+961 71 000 000')

        await page.getByRole('button', { name: /place order/i }).click()

        // FE-031 — a router navigation, not a full page load.
        await expect(page).toHaveURL(/\/$|\/#/, { timeout: 20_000 })
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 9/7 — sign in, cart merge, order history, sign out', () => {
    test('a guest cart survives signing in, and logout clears everything', async ({ page }) => {
        // Something in the cart as a guest.
        await page.goto('/collections/all')
        await addFirstAvailableToCart(page, 'Sony WH-1000XM6')

        // Sign in as the seeded demo customer, who already has a server cart.
        await signIn(page)
        await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })

        // FE-009 — both carts are present. The guest one used to be discarded.
        await page.goto('/cart')
        await expect(page.getByText('Sony WH-1000XM6').first()).toBeVisible()
        await expect(page.getByText('Razer Cobra Pro').first()).toBeVisible()

        // Order history is reachable now that there is a session.
        await page.goto('/orders')
        await expect(page.getByRole('heading', { name: /my orders/i })).toBeVisible()

        // FE-002 / SEC-022 — logout clears the cart, not just the token.
        await page.goto('/')
        // Sign out lives inside the profile dropdown, and the navbar renders
        // two of everything — a desktop bar and a mobile one, both mounted, one
        // hidden by CSS at any width. `.first()` picks by DOM order, not by
        // what a person can see, so both the trigger and the item are filtered
        // to what is actually visible.
        const profile = page.locator('.profile-trigger').locator('visible=true').first()
        await expect(profile).toBeVisible()
        await profile.click()

        const signOut = page.getByRole('button', { name: /sign out/i }).locator('visible=true').first()
        await expect(signOut).toBeVisible()
        await signOut.click()

        await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })

        await page.goto('/cart')
        await expect(page.getByText(/your cart is empty/i)).toBeVisible()
        expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
        expect(await page.evaluate(() => localStorage.getItem('guestCart'))).toBeNull()
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 10 — wishlist (FE-005, FE-013)', () => {
    test('add, view, back, remove', async ({ page }) => {
        // A session, not a sign-in journey — this flow is about the wishlist.
        // Driving the form here spent one of `authLimiter`'s five attempts per
        // fifteen minutes, and as the last login in a full run it was the one
        // that intermittently got a 429 and failed on "still on /login".
        await authenticate(page)
        await page.goto('/')
        await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })

        await page.goto('/wishlist')
        // FE-013 — it settles, rather than spinning for ever.
        await expect(page.getByRole('heading', { name: /my wishlist/i })).toBeVisible()
        await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 20_000 })

        // FE-005 — back goes back, rather than to "/-1".
        await page.goto('/products')
        await page.goto('/wishlist')
        await page.getByRole('button', { name: /^back$/i }).first().click()
        await expect(page).toHaveURL(/\/products/)
    })
})

// ---------------------------------------------------------------------------
test.describe('flow 16 — the chatbot (FE-027, FE-028, FE-029, BE-001)', () => {
    test('opens one widget, sends a message, and ends its session on close', async ({ page }) => {
        const ends = []
        page.on('request', (request) => {
            if (request.url().includes('/api/chatbot/end')) ends.push(request.url())
        })

        // Opened from the catalog rather than the homepage. The widget is
        // mounted by `App`, so it is on every route, and the homepage's 11.5 MB
        // video and 3D iframe (PERF-001…003, Phase 4) put this test within
        // seconds of the suite's timeout while testing none of them.
        await page.goto('/collections/all')
        await page.getByRole('button', { name: /open support chat/i }).click()

        // FE-027 — exactly one interface, from one owner.
        await expect(page.getByRole('log')).toHaveCount(1)
        await expect(page.getByRole('log')).toBeVisible()

        // The greeting arrives from the API. No OpenAI key is configured, so it
        // is the structured offline fallback — still `{ text, links[] }`, and
        // still plain text with no markup.
        await expect(page.getByRole('log').getByText(/\S/).first()).toBeVisible()

        // `getByLabel` matches substrings, and Phase 4 named the send button
        // "Send message" (A11Y-009), so the unanchored name now matches two
        // controls. Anchored to the input's exact name.
        const chatInput = page.getByLabel('Message', { exact: true })
        await chatInput.fill('Do you sell laptops?')
        await chatInput.press('Enter')
        await expect(page.getByText('Do you sell laptops?')).toBeVisible()

        // FE-028 — closing ends the real session, exactly once.
        await page.getByRole('button', { name: /end chat/i }).click()
        await expect(page.getByRole('log')).toHaveCount(0)
        await page.waitForTimeout(1000)
        expect(ends).toHaveLength(1)
    })
})
