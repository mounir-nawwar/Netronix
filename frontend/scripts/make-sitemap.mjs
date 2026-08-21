#!/usr/bin/env node
// SEO-003 — `sitemap.xml`, written at build time.
//
//   node scripts/make-sitemap.mjs [--out dist]
//
// **What this deliberately does not do.** The remediation plan suggests
// generating the sitemap "from the catalog". That would mean this script
// connecting to a database at build time, and the only database available in
// this project's local workflow is the in-memory one the tests create and
// destroy — so the product URLs it emitted would be the ids of fixtures that
// exist nowhere else. A sitemap full of 404s is worse for a crawler than a
// short honest one.
//
// So it lists the **static public routes only**, and says so. Product URLs are
// reachable by crawling `/products` and `/collections`, which are both in the
// file and both render real links. When this project grows a build step with
// real catalog access, `PUBLIC_STATIC_ROUTES` is where the extra entries go.
//
// The origin comes from `VITE_FRONTEND_URL` — the same variable the runtime
// canonical uses — with a loopback default, because a sitemap naming a
// hostname nobody controls is a fabrication.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/** Routes a crawler should never be pointed at (kept in step with `src/lib/seo.js`). */
export const PRIVATE_ROUTES = ['/cart', '/placeorder', '/orders', '/wishlist', '/login']

export const PUBLIC_STATIC_ROUTES = ['/', '/products', '/collections', '/about', '/contact']

export function readOrigin(env = process.env) {
    const configured = env.VITE_FRONTEND_URL?.trim()
    if (configured) return configured.replace(/\/+$/, '')

    // `.env` is not loaded by Vite for a plain node script, so read it directly
    // rather than silently defaulting when the developer has set it.
    const envFile = join(root, '.env')
    if (existsSync(envFile)) {
        const match = readFileSync(envFile, 'utf8').match(/^VITE_FRONTEND_URL\s*=\s*(.+)$/m)
        if (match) return match[1].trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '')
    }
    return 'http://localhost:5173'
}

export function buildSitemap(origin, routes = PUBLIC_STATIC_ROUTES) {
    const today = new Date().toISOString().slice(0, 10)
    const urls = routes
        .filter((route) => !PRIVATE_ROUTES.includes(route))
        .map((route) => [
            '  <url>',
            `    <loc>${origin}${route === '/' ? '/' : route}</loc>`,
            `    <lastmod>${today}</lastmod>`,
            `    <changefreq>${route === '/' ? 'daily' : 'weekly'}</changefreq>`,
            `    <priority>${route === '/' ? '1.0' : '0.7'}</priority>`,
            '  </url>',
        ].join('\n'))

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- Static public routes only. Product URLs are not enumerated here:',
        '     this build has no catalog access, and inventing ids would produce a',
        '     sitemap of 404s. They are reachable from /products and /collections. -->',
        '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace('www.sitemap.org', 'www.sitemaps.org'),
        ...urls,
        '</urlset>',
        '',
    ].join('\n')
}

/** `robots.txt` with an absolute `Sitemap:` line for this origin. */
export function buildRobots(origin, template) {
    return template.replace(/^Sitemap: .*$/m, `Sitemap: ${origin}/sitemap.xml`)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
    const args = process.argv.slice(2)
    const outIndex = args.indexOf('--out')
    const outDir = resolve(root, outIndex === -1 ? 'dist' : args[outIndex + 1])

    const origin = readOrigin()
    mkdirSync(outDir, { recursive: true })

    writeFileSync(join(outDir, 'sitemap.xml'), buildSitemap(origin), 'utf8')

    const robotsTemplate = readFileSync(join(root, 'public/robots.txt'), 'utf8')
    writeFileSync(join(outDir, 'robots.txt'), buildRobots(origin, robotsTemplate), 'utf8')

    console.log(`sitemap.xml and robots.txt written to ${outDir} for origin ${origin}`)
}
