// A11Y-001 — `prefers-reduced-motion: reduce`, in a real browser.
//
// The jsdom suite (`src/test/a11y/reduced-motion.test.jsx`) asserts which
// branch each component takes. This asserts what a visitor with the preference
// set actually gets: the marquee is not moving, the scrolling text is not
// moving, the product film is not playing and has requested no video bytes,
// and the third-party 3D scene was never fetched.
//
// It also asserts the other half, which matters more for a portfolio project
// than the first: **without** the preference, every one of those still runs.
// Reduced motion is not permission to ship a duller site to everybody.

import { test, expect } from './test.js'

/**
 * Bring an element into view and *keep* it there while the page settles.
 *
 * Three reasons this is not `locator.scrollIntoViewIfNeeded()`.
 *
 *   * Playwright's helper waits for the element to hold still, and the whole
 *     point of the scrolling text is that it never does: under ordinary motion
 *     it moves on every frame, so the helper retried until the test timed out.
 *   * The homepage grows after first paint — the hero's third-party iframe
 *     resolves, images arrive — so a single `scrollIntoView` can land correctly
 *     and then be wrong a moment later. That is not hypothetical: it is why the
 *     product film's `IntersectionObserver` never fired under ordinary motion
 *     while firing perfectly under reduced motion, where the static hero makes
 *     the layout settle immediately. The application was right and the scroll
 *     was early.
 *   * It re-reads the box each time, so the element ends up genuinely inside
 *     the viewport rather than merely having been asked to be.
 */
async function scrollTo(page, locator, { attempts = 12 } = {}) {
    await locator.waitFor({ state: 'attached' })

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await locator.evaluate((node) => node.scrollIntoView({ block: 'center' }))
        await page.waitForTimeout(250)

        const inView = await locator.evaluate((node) => {
            const box = node.getBoundingClientRect()
            return box.bottom > 0 && box.top < window.innerHeight
        })
        if (inView) {
            // One more settle pass so an observer scheduled by this scroll has
            // run before the caller asserts on its effect.
            await page.waitForTimeout(250)
            return
        }
    }
    throw new Error('could not bring the element into view')
}

/** Two transform reads a second apart. Equal means it is not moving. */
async function isMoving(locator, page, ms = 700) {
    const before = await locator.evaluate((node) => getComputedStyle(node).transform)
    await page.waitForTimeout(ms)
    const after = await locator.evaluate((node) => getComputedStyle(node).transform)
    return before !== after
}

test.describe('with prefers-reduced-motion: reduce', () => {
    test.use({})

    test('the hero is a static panel and the Spline scene is never requested', async ({ page }) => {
        const splineRequests = []
        page.on('request', (request) => {
            if (request.url().includes('spline.design')) splineRequests.push(request.url())
        })

        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        await expect(page.getByTestId('hero-static')).toBeVisible()
        await expect(page.locator('iframe[src*="spline.design"]')).toHaveCount(0)

        // Not a blank section: the same headline, copy and call to action.
        await expect(page.getByRole('heading', { name: /Next-Gen Tech, Delivered/i })).toBeVisible()
        await expect(page.getByText(/Your gateway to the latest/i)).toBeVisible()

        await page.waitForTimeout(1000)
        expect(splineRequests, 'the 3D scene was fetched under reduced motion').toHaveLength(0)
    })

    test('the brand marquee is still', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        const strip = page.locator('section .flex.whitespace-nowrap').first()
        await expect(strip).toBeVisible()
        // Static, not absent — the logos are still there.
        await expect(strip.locator('img').first()).toBeVisible()
        expect(await isMoving(strip, page)).toBe(false)
    })

    test('the scrolling text is still', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        const track = page.getByTestId('scrolling-text-track')
        await scrollTo(page, track)
        await expect(track).toHaveAttribute('data-animating', 'false')
        expect(await isMoving(track, page)).toBe(false)
        // The words are still on the page.
        await expect(track).toContainText('Premium tech')
    })

    test('the product film does not autoplay and fetches no video', async ({ page }) => {
        const mediaRequests = []
        page.on('request', (request) => {
            if (/\.(mp4|webm)(\?|$)/.test(request.url())) mediaRequests.push(request.url())
        })

        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        const video = page.getByTestId('hero-video')
        await scrollTo(page, video)
        await page.waitForTimeout(1500)

        await expect(video).toHaveAttribute('data-loaded', 'false')
        expect(await video.evaluate((node) => node.paused)).toBe(true)
        expect(mediaRequests, `video was fetched: ${mediaRequests.join(', ')}`).toHaveLength(0)

        // The poster is showing, so the section is not an empty black band.
        await expect(video).toHaveAttribute('poster', /netronix-product-video-poster\.jpg/)
        // And the play control works: this is a choice, not a removal.
        await expect(page.getByRole('button', { name: /play the product film/i })).toBeVisible()
    })

    test('pressing play still plays it — the preference is not a lockout', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        const video = page.getByTestId('hero-video')
        await scrollTo(page, video)
        await page.getByRole('button', { name: /play the product film/i }).click()

        await expect(video).toHaveAttribute('data-loaded', 'true')
        await expect.poll(async () => video.evaluate((node) => node.paused), { timeout: 15_000 }).toBe(false)
    })
})

test.describe('without the preference — the signature experience is intact', () => {
    test('the Spline hero renders', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.goto('/')

        await expect(page.locator('iframe[src*="spline.design"]')).toHaveCount(1)
        await expect(page.getByTestId('hero-static')).toHaveCount(0)
    })

    test('the marquee moves', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.goto('/')

        const strip = page.locator('.animate-marquee-right').first()
        await expect(strip).toBeVisible()
        expect(await isMoving(strip, page)).toBe(true)
    })

    test('the scrolling text moves', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.goto('/')

        const track = page.getByTestId('scrolling-text-track')
        await scrollTo(page, track)
        await expect(track).toHaveAttribute('data-animating', 'true')
        expect(await isMoving(track, page, 400)).toBe(true)
    })

    test('the product film loads and plays when scrolled to', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.goto('/')

        const video = page.getByTestId('hero-video')
        await scrollTo(page, video)

        await expect(video).toHaveAttribute('data-loaded', 'true', { timeout: 15_000 })
        await expect.poll(async () => video.evaluate((node) => node.paused), { timeout: 20_000 }).toBe(false)
    })

    test('PERF-002 — the film is not fetched before it is scrolled to', async ({ page }) => {
        const mediaRequests = []
        page.on('request', (request) => {
            if (/\.(mp4|webm)(\?|$)/.test(request.url())) mediaRequests.push(request.url())
        })

        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.goto('/', { waitUntil: 'load' })
        await expect(page.getByRole('heading', { name: /best sellers/i })).toBeVisible()

        // The homepage is tall; the film sits well below the fold.
        expect(mediaRequests, `the film was fetched on load: ${mediaRequests.join(', ')}`).toHaveLength(0)
    })
})
