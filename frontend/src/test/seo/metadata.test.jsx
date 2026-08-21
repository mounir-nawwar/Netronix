// SEO-001 … SEO-005.
//
// Baseline, measured by the audit: `index.html` carried `charset`, `viewport`,
// `icon` and `<title>Netronix</title>`. That was the complete metadata for
// every route in the application — no description, no Open Graph, no Twitter
// Card, no canonical, no structured data, no `robots.txt`, no sitemap.
//
// The honesty rule these tests exist to enforce: **nothing here may assert a
// value the application invented.** There is a test below that fails if any
// route ever emits `AggregateRating`, `reviewCount` or a postal address,
// because those are exactly the fields that make a Product rich result
// attractive and this project has no data behind any of them.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import ShopContextProvider from '../../context/ShopContext.jsx'
import App from '../../App.jsx'
import { reset } from '../../lib/head.js'
import { absolute, breadcrumbLd, organizationLd, productLd, robotsFor } from '../../lib/seo.js'
import { buildRobots, buildSitemap, PRIVATE_ROUTES } from '../../../scripts/make-sitemap.mjs'
import { setCatalog, makeProduct } from '../msw/handlers.js'

const root = process.cwd()
const read = (relative) => readFileSync(join(root, relative), 'utf8')

const renderApp = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <ShopContextProvider><App /></ShopContextProvider>
    </MemoryRouter>,
)

const meta = (selector) => document.head.querySelector(selector)?.getAttribute('content')
const jsonLdBlocks = () => [...document.head.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => JSON.parse(script.textContent))

afterEach(() => reset())

describe('SEO-001 — static defaults in the served HTML', () => {
    const html = read('index.html')

    it('has a description, a theme colour and a real title', () => {
        expect(html).toMatch(/<meta\s+name="description"/)
        expect(html).toMatch(/<meta\s+name="theme-color"\s+content="#6a5acd"/)
        expect(html).toMatch(/<title>Netronix — Next-Gen Tech, Delivered<\/title>/)
        expect(html).not.toMatch(/<title>Netronix<\/title>/)
    })

    it('has Open Graph and Twitter Card tags with a real image', () => {
        for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image']) {
            expect(html, property).toMatch(new RegExp(`property="${property}"`))
        }
        for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
            expect(html, name).toMatch(new RegExp(`name="${name}"`))
        }
        expect(html).toMatch(/content="\/og\/netronix-og\.png"/)
    })

    it('ships the OG image at exactly 1200×630', () => {
        // PNG header: width and height are big-endian uint32 at bytes 16 and 20.
        const png = readFileSync(join(root, 'public/og/netronix-og.png'))
        expect(png.subarray(1, 4).toString()).toBe('PNG')
        expect(png.readUInt32BE(16)).toBe(1200)
        expect(png.readUInt32BE(20)).toBe(630)
    })

    it('links the fonts rather than @importing them (PERF-009)', () => {
        expect(html).toMatch(/rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/)
        expect(html).toMatch(/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/)
        expect(read('src/index.css')).not.toMatch(/@import url\(/)
    })

    it('hardcodes no production hostname anywhere in the metadata layer', () => {
        for (const file of ['index.html', 'src/lib/seo.js', 'src/components/Seo.jsx', 'public/robots.txt']) {
            const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
            const hosts = source.match(/https?:\/\/[a-z0-9.-]+/gi) ?? []
            const external = hosts.filter((host) => !/fonts\.(googleapis|gstatic)\.com|schema\.org|localhost|127\.0\.0\.1|www\.w3\.org/.test(host))
            expect(external, `${file} names ${external.join(', ')}`).toEqual([])
        }
    })
})

describe('SEO-002 — per-route titles, descriptions and canonicals', () => {
    const routes = [
        { path: '/cart', title: /Your Cart — Netronix/ },
        { path: '/placeorder', title: /Checkout — Netronix/ },
        { path: '/about', title: /About — Netronix/ },
        { path: '/contact', title: /Contact — Netronix/ },
        { path: '/products', title: /All Products — Netronix/ },
        { path: '/collections', title: /Collections — Netronix/ },
    ]

    it.each(routes)('$path has its own title, description and canonical', async ({ path, title }) => {
        renderApp(path)
        await waitFor(() => expect(document.title).toMatch(title))

        expect(meta('meta[name="description"]')).toBeTruthy()
        expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'))
            .toBe(absolute(path))
        // The share card is populated on every route, not only the homepage.
        expect(meta('meta[property="og:title"]')).toMatch(title)
        expect(meta('meta[property="og:image"]')).toMatch(/^https?:\/\/.+\/og\/netronix-og\.png$/)
    })

    it('gives two different routes two different titles', async () => {
        const first = render(
            <MemoryRouter initialEntries={['/cart']}>
                <ShopContextProvider><App /></ShopContextProvider>
            </MemoryRouter>,
        )
        await waitFor(() => expect(document.title).toMatch(/Your Cart/))
        const cartTitle = document.title
        first.unmount()
        reset()

        renderApp('/about')
        await waitFor(() => expect(document.title).toMatch(/About/))
        expect(document.title).not.toBe(cartTitle)
    })
})

describe('SEO — private routes are not indexable', () => {
    it.each(PRIVATE_ROUTES)('%s is noindex', (path) => {
        expect(robotsFor(path)).toBe('noindex, nofollow')
    })

    it.each(['/', '/products', '/about', '/contact'])('%s is indexable', (path) => {
        expect(robotsFor(path)).toBeUndefined()
    })

    it('emits the robots meta on a private route', async () => {
        renderApp('/cart')
        await waitFor(() => expect(meta('meta[name="robots"]')).toBe('noindex, nofollow'))
    })
})

describe('SEO-004 — structured data, and only what is true', () => {
    it('puts Organization and WebSite on the homepage', async () => {
        renderApp('/')
        // The homepage is a lazy chunk behind a Suspense boundary and its
        // `<Seo>` applies in an effect after it resolves, so this needs more
        // than the 1 s default when the suite is running files in parallel.
        await waitFor(() => expect(jsonLdBlocks().length).toBeGreaterThan(0), { timeout: 10_000 })

        const types = jsonLdBlocks().map((block) => block['@type'])
        expect(types).toContain('Organization')
        expect(types).toContain('WebSite')
    })

    it('builds Product + Offer from the catalog document alone', () => {
        const product = {
            _id: '680262846be92b2511550a66',
            name: 'MacBook Pro 16" M4 Pro',
            description: 'A laptop.',
            brand: 'Apple',
            image: ['https://res.cloudinary.com/demo/image/upload/v1/netronix/macbook-16.png'],
        }
        const block = productLd(product, { priceMinor: 379900, inStock: true })

        expect(block['@type']).toBe('Product')
        expect(block.name).toBe('MacBook Pro 16" M4 Pro')
        expect(block.offers).toMatchObject({
            '@type': 'Offer',
            priceCurrency: 'USD',
            price: '3799.00',
            availability: 'https://schema.org/InStock',
        })
    })

    it('says OutOfStock when the inventory says so', () => {
        const block = productLd({ _id: 'p1', name: 'X' }, { priceMinor: 1000, inStock: false })
        expect(block.offers.availability).toBe('https://schema.org/OutOfStock')
    })

    it('omits Offer entirely rather than inventing a price', () => {
        const block = productLd({ _id: 'p1', name: 'X' }, {})
        expect(block.offers).toBeUndefined()
    })

    it('never emits a rating, a review count or an address', () => {
        const serialised = JSON.stringify([
            organizationLd(),
            productLd({ _id: 'p1', name: 'X', brand: 'B' }, { priceMinor: 999, inStock: true }),
            breadcrumbLd([{ name: 'Home', path: '/' }]),
        ])
        for (const forbidden of ['AggregateRating', 'aggregateRating', 'reviewCount', 'ratingValue', 'PostalAddress', 'telephone', 'priceValidUntil']) {
            expect(serialised, forbidden).not.toContain(forbidden)
        }
    })

    it('emits Product and BreadcrumbList on a real product page', async () => {
        const product = makeProduct({ _id: '680262846be92b2511550a66', name: 'Seeded Laptop' })
        setCatalog([product])

        renderApp(`/product/${product._id}`)
        await waitFor(() => expect(document.title).toMatch(/Seeded Laptop — Netronix/))

        const types = jsonLdBlocks().map((block) => block['@type'])
        expect(types).toContain('Product')
        expect(types).toContain('BreadcrumbList')

        const productBlock = jsonLdBlocks().find((block) => block['@type'] === 'Product')
        expect(productBlock.name).toBe('Seeded Laptop')
        expect(productBlock.url).toBe(absolute(`/product/${product._id}`))
        // SEO-005 — the ObjectId deep link still works and is still canonical.
        // No destructive slug migration was invented for it.
        expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'))
            .toBe(absolute(`/product/${product._id}`))
    })
})

describe('SEO-003 — robots.txt and the sitemap', () => {
    const robots = read('public/robots.txt')

    it('disallows every private route', () => {
        for (const route of PRIVATE_ROUTES) {
            expect(robots, route).toMatch(new RegExp(`^Disallow: ${route}$`, 'm'))
        }
        expect(robots).toMatch(/^User-agent: \*$/m)
    })

    it('rewrites the Sitemap line to the configured origin at build time', () => {
        const built = buildRobots('http://127.0.0.1:4173', robots)
        expect(built).toMatch(/^Sitemap: http:\/\/127\.0\.0\.1:4173\/sitemap\.xml$/m)
        expect(built).not.toMatch(/^Sitemap: \/sitemap\.xml$/m)
    })

    it('lists only the truthful static routes, and no private one', () => {
        const xml = buildSitemap('http://127.0.0.1:4173')
        expect(xml).toMatch(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
        expect(xml).toContain('<loc>http://127.0.0.1:4173/</loc>')
        expect(xml).toContain('<loc>http://127.0.0.1:4173/products</loc>')
        for (const route of PRIVATE_ROUTES) {
            expect(xml, route).not.toContain(`<loc>http://127.0.0.1:4173${route}</loc>`)
        }
        // It says out loud that it does not enumerate products, rather than
        // implying it did.
        expect(xml).toMatch(/Product URLs are not enumerated here/)
    })
})

describe('the head is cleaned up between routes', () => {
    it('leaves no stale JSON-LD behind after navigating away', async () => {
        const view = renderApp('/')
        await waitFor(() => expect(jsonLdBlocks().length).toBeGreaterThan(0), { timeout: 10_000 })
        view.unmount()

        expect(jsonLdBlocks()).toHaveLength(0)
        expect(document.head.querySelectorAll('[data-rh]')).toHaveLength(0)
    })

    it('never writes a tag it did not create', async () => {
        const planted = document.createElement('meta')
        planted.setAttribute('name', 'planted-by-something-else')
        planted.setAttribute('content', 'untouched')
        document.head.appendChild(planted)

        const view = renderApp('/about')
        await waitFor(() => expect(document.title).toMatch(/About/))
        view.unmount()

        expect(document.head.querySelector('meta[name="planted-by-something-else"]')?.getAttribute('content'))
            .toBe('untouched')
        planted.remove()
    })
})

describe('a shared link renders a card', () => {
    it('emits a title, a description and a real absolute image on the homepage', async () => {
        renderApp('/')
        await waitFor(() => expect(document.title).toBeTruthy(), { timeout: 10_000 })

        expect(meta('meta[property="og:title"]')).toBeTruthy()
        expect(meta('meta[property="og:description"]')?.length).toBeGreaterThan(40)
        expect(meta('meta[property="og:image"]')).toMatch(/^https?:\/\//)
        expect(meta('meta[property="og:url"]')).toBe(absolute('/'))
        expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image')
    })
})
