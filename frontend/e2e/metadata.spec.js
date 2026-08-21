// SEO-001 … SEO-005 — the emitted metadata, read out of a real DOM.
//
// The unit suite asserts the head-management module and the static HTML. This
// asserts what a browser ends up with after the route has rendered — which is
// what a crawler that executes JavaScript sees, and is the only place the
// runtime and the static defaults are observed together.
//
// **What is not asserted here, and is recorded as blocked rather than faked:**
// a share-card *preview*. Rendering one requires Facebook's Sharing Debugger,
// X's Card Validator or LinkedIn's Post Inspector to fetch a public URL. This
// stack is on loopback and this phase contacts no external service, so what is
// verified is the exact set of tags those crawlers read. The rendering itself
// is `BLOCKED_EXTERNAL_OPERATION`.

import { test, expect } from './test.js'

import { visibleLink } from './fixtures.js'

const head = (page) => page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content ?? null,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
    ogDescription: document.querySelector('meta[property="og:description"]')?.content ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
    ogType: document.querySelector('meta[property="og:type"]')?.content ?? null,
    twitterCard: document.querySelector('meta[name="twitter:card"]')?.content ?? null,
    twitterImage: document.querySelector('meta[name="twitter:image"]')?.content ?? null,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((script) => JSON.parse(script.textContent)),
}))

test.describe('per-route metadata', () => {
    test('the homepage carries a complete share card and Organization data', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByRole('heading', { name: /best sellers/i })).toBeVisible()

        const meta = await head(page)

        expect(meta.title).toMatch(/Netronix/)
        expect(meta.title).not.toBe('Netronix')
        expect(meta.description?.length ?? 0).toBeGreaterThan(60)
        expect(meta.themeColor).toBe('#6a5acd')
        expect(meta.canonical).toMatch(/^https?:\/\/.+\/$/)

        // A shared link renders a card: title, description, image.
        expect(meta.ogTitle).toBeTruthy()
        expect(meta.ogDescription?.length ?? 0).toBeGreaterThan(40)
        expect(meta.ogImage).toMatch(/^https?:\/\/.+\/og\/netronix-og\.png$/)
        expect(meta.ogUrl).toBe(meta.canonical)
        expect(meta.twitterCard).toBe('summary_large_image')
        expect(meta.twitterImage).toBe(meta.ogImage)

        const types = meta.jsonLd.map((block) => block['@type'])
        expect(types).toContain('Organization')
        expect(types).toContain('WebSite')
    })

    test('the OG image really exists and is 1200×630', async ({ page, request }) => {
        await page.goto('/')
        const { ogImage } = await head(page)

        const response = await request.get(ogImage)
        expect(response.status()).toBe(200)
        expect(response.headers()['content-type']).toMatch(/image\/png/)

        const body = await response.body()
        // PNG IHDR: width and height are big-endian uint32 at offsets 16 and 20.
        expect(body.subarray(1, 4).toString()).toBe('PNG')
        expect(body.readUInt32BE(16)).toBe(1200)
        expect(body.readUInt32BE(20)).toBe(630)
    })

    test('a product page names the product and carries Product + Offer', async ({ page }) => {
        await page.goto('/products')
        await visibleLink(page, 'MacBook Pro 16" M4 Pro').click()
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()

        // The heading renders from the catalog the context already holds; the
        // `<Seo>` descriptor is applied in an effect on the next commit. Polled
        // rather than read once, because reading once measures the race.
        await expect.poll(async () => page.title()).toMatch(/MacBook Pro 16" M4 Pro — Netronix/)

        const meta = await head(page)

        expect(meta.title).toMatch(/MacBook Pro 16" M4 Pro — Netronix/)
        expect(meta.description).toBeTruthy()
        expect(meta.ogType).toBe('product')
        // SEO-005 — the ObjectId deep link is canonical. No destructive slug
        // migration was invented, and the id route still resolves.
        expect(meta.canonical).toMatch(/\/product\/[0-9a-f]{24}$/)
        expect(page.url()).toBe(meta.canonical)

        const product = meta.jsonLd.find((block) => block['@type'] === 'Product')
        expect(product).toBeTruthy()
        expect(product.name).toBe('MacBook Pro 16" M4 Pro')
        expect(product.offers.priceCurrency).toBe('USD')
        expect(Number(product.offers.price)).toBeGreaterThan(0)
        expect(product.offers.availability).toMatch(/InStock|OutOfStock/)

        const breadcrumb = meta.jsonLd.find((block) => block['@type'] === 'BreadcrumbList')
        expect(breadcrumb.itemListElement).toHaveLength(3)
    })

    test('nothing anywhere invents a rating, a review count or an address', async ({ page }) => {
        for (const path of ['/', '/products', '/collections', '/about']) {
            await page.goto(path)
            const meta = await head(page)
            const serialised = JSON.stringify(meta.jsonLd)
            for (const forbidden of ['ggregateRating', 'reviewCount', 'ratingValue', 'PostalAddress', 'telephone']) {
                expect(serialised, `${path} emits ${forbidden}`).not.toContain(forbidden)
            }
        }
    })

    test('every route has its own title, and the private ones are noindex', async ({ page }) => {
        const seen = new Map()

        for (const [path, expected] of [
            ['/', /Netronix/],
            ['/products', /All Products — Netronix/],
            ['/collections', /Collections — Netronix/],
            ['/about', /About — Netronix/],
            ['/contact', /Contact — Netronix/],
            ['/cart', /Your Cart — Netronix/],
            ['/placeorder', /Checkout — Netronix/],
        ]) {
            await page.goto(path)
            await expect.poll(async () => page.title()).toMatch(expected)
            const meta = await head(page)
            seen.set(path, meta.title)
            expect(meta.canonical, path).toContain(path === '/' ? '/' : path)
        }

        // Seven routes, seven distinct titles — the finding was one string for
        // all of them.
        expect(new Set(seen.values()).size).toBe(seen.size)

        for (const path of ['/cart', '/placeorder']) {
            await page.goto(path)
            await expect.poll(async () => (await head(page)).robots).toBe('noindex, nofollow')
        }
        await page.goto('/products')
        await expect.poll(async () => (await head(page)).robots).toBeNull()
    })

    test('a 404 is noindex', async ({ page }) => {
        await page.goto('/no-such-page-anywhere')
        await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible()
        await expect.poll(async () => (await head(page)).robots).toBe('noindex, nofollow')
    })
})

test.describe('SEO-003 — robots.txt and sitemap.xml are served', () => {
    // The E2E stack runs Vite in dev mode, which serves `public/` verbatim.
    // `sitemap.xml` is a build artifact, so its content is asserted in the unit
    // suite against the generator; what is checked here is that `robots.txt`
    // is actually reachable at the root of a running storefront.
    test('robots.txt is served and disallows the private routes', async ({ request, baseURL }) => {
        const response = await request.get(`${baseURL}/robots.txt`)
        expect(response.status()).toBe(200)

        const body = await response.text()
        expect(body).toMatch(/^User-agent: \*$/m)
        for (const route of ['/cart', '/placeorder', '/orders', '/wishlist', '/login']) {
            expect(body, route).toMatch(new RegExp(`^Disallow: ${route}$`, 'm'))
        }
        expect(body).toMatch(/^Sitemap: /m)
    })
})
