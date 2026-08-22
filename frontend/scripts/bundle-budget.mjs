#!/usr/bin/env node
// Gate 4 — the reproducible bundle budget report.
//
// Two things this deliberately does NOT do, because both are how bundle claims
// go wrong:
//
//   * It does not sum `dist/`. `dist/` contains every lazy route chunk and
//     every image variant a `srcset` might pick; a visitor downloads a small
//     fraction of it. Total `dist` is not initial transfer and saying so is a
//     fabrication in the flattering direction.
//   * It does not guess from file names. It walks Vite's build manifest.
//
// **How "initial chunks" are selected.** The manifest records, per module, its
// `file`, its static `imports`, its `dynamicImports`, and its `css`. The
// initial set for a route is the transitive closure over **`imports` only** —
// static imports, which the browser must have before the module can evaluate —
// starting from the HTML entry, plus (for a non-index route) the route's own
// lazy chunk and *its* static closure. `dynamicImports` are followed for
// nothing, because that is exactly what a `React.lazy` boundary defers.
//
// Sizes are gzip, measured with `zlib.gzipSync` at level 9 on the emitted
// file, because gzip is what a server negotiates and what the budget is
// written in.
//
//   node scripts/bundle-budget.mjs                # storefront, from ./dist
//   node scripts/bundle-budget.mjs --app admin    # ../admin/dist
//   node scripts/bundle-budget.mjs --json         # machine-readable
//
// Exits non-zero if a budget is exceeded or a forbidden chunk is present, so
// it can be a CI step rather than a document.

import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

/** PERF-001 — the Spline runtime chunks, by the names Rollup gave them. */
export const FORBIDDEN_CHUNK_PATTERNS = [
    /(^|[/-])physics[-.]/,
    /(^|[/-])navmesh[-.]/,
    /(^|[/-])opentype[-.]/,
    /(^|[/-])howler[-.]/,
    /gaussian-splat/,
]

export const APPS = {
    frontend: {
        dist: resolve(repoRoot, 'frontend/dist'),
        // Roadmap Gate 4: initial JS < 500 kB gzip (from 1,480 kB).
        budgetGzipBytes: 500 * 1024,
        // The storefront's routes, as `React.lazy` sources in `App.jsx`.
        routes: {
            '/': 'src/pages/Home.jsx',
            '/product/:id': 'src/pages/Product.jsx',
            '/cart': 'src/pages/Cart.jsx',
            '/placeorder': 'src/pages/PlaceOrder.jsx',
        },
    },
    admin: {
        dist: resolve(repoRoot, 'admin/dist'),
        // Gate 4: admin initial bundle < 400 kB gzip where feasible.
        budgetGzipBytes: 400 * 1024,
        routes: {
            '/dashboard': 'src/pages/Dashboard.jsx',
            '/list': 'src/pages/List.jsx',
        },
    },
}

const gzipOf = (path) => gzipSync(readFileSync(path), { level: 9 }).length

function walk(dir, found = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path, found)
        else found.push(path)
    }
    return found
}

/**
 * The transitive closure over **static** imports.
 * `seen` is shared so a chunk imported by two entries is counted once.
 */
function staticClosure(manifest, key, seen = new Set()) {
    if (!key || seen.has(key)) return seen
    const entry = manifest[key]
    if (!entry) return seen
    seen.add(key)
    for (const imported of entry.imports ?? []) staticClosure(manifest, imported, seen)
    return seen
}

/** The files a closure of manifest keys actually costs: chunks plus their CSS. */
function filesOf(manifest, keys) {
    const files = new Set()
    for (const key of keys) {
        const entry = manifest[key]
        if (!entry) continue
        files.add(entry.file)
        for (const css of entry.css ?? []) files.add(css)
    }
    return [...files]
}

export function report(appName) {
    const app = APPS[appName]
    if (!app) throw new Error(`unknown app: ${appName}`)
    if (!existsSync(app.dist)) {
        throw new Error(`${app.dist} does not exist — run \`npm run build\` in ${appName} first`)
    }

    const manifestPath = join(app.dist, '.vite/manifest.json')
    if (!existsSync(manifestPath)) {
        throw new Error(`${manifestPath} is missing — the build must set \`build.manifest: true\``)
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
    if (!entryKey) throw new Error('the manifest declares no entry chunk')

    // PERF-001 — nothing named after a Spline runtime module may exist at all.
    const distFiles = walk(app.dist).map((path) => path.slice(app.dist.length + 1))
    const forbidden = distFiles.filter((file) =>
        FORBIDDEN_CHUNK_PATTERNS.some((pattern) => pattern.test(file)))

    const entryClosure = staticClosure(manifest, entryKey)
    const entryFiles = filesOf(manifest, entryClosure)
    const measure = (files) => files
        .filter((file) => file.endsWith('.js'))
        .reduce((total, file) => total + gzipOf(join(app.dist, file)), 0)

    const initialJsGzip = measure(entryFiles)

    const routes = {}
    for (const [route, source] of Object.entries(app.routes)) {
        if (!manifest[source]) {
            routes[route] = { missing: source }
            continue
        }
        // The route's own static closure, minus everything the entry already
        // brought: what a visitor pays *on top of* the shell.
        const closure = staticClosure(manifest, source, new Set(entryClosure))
        const routeOnly = [...closure].filter((key) => !entryClosure.has(key))
        const routeFiles = filesOf(manifest, routeOnly)
        routes[route] = {
            addedJsGzip: measure(routeFiles),
            totalJsGzip: initialJsGzip + measure(routeFiles),
            chunks: routeFiles.filter((file) => file.endsWith('.js')),
        }
    }

    const distTotal = walk(app.dist).reduce((total, path) => total + statSync(path).size, 0)

    return {
        app: appName,
        entry: entryKey,
        entryChunks: entryFiles.filter((file) => file.endsWith('.js')),
        initialJsGzip,
        budgetGzipBytes: app.budgetGzipBytes,
        withinBudget: initialJsGzip < app.budgetGzipBytes,
        forbiddenChunks: forbidden,
        routes,
        distTotalBytes: distTotal,
    }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

function print(result) {
    console.log(`\n${result.app} — initial route assets (gzip, from .vite/manifest.json)`)
    console.log('─'.repeat(72))
    for (const chunk of result.entryChunks.sort()) {
        console.log(`  ${chunk.padEnd(48)} ${kb(gzipOf(join(APPS[result.app].dist, chunk))).padStart(10)}`)
    }
    console.log('─'.repeat(72))
    console.log(`  initial JS (entry + static imports)        ${kb(result.initialJsGzip).padStart(12)} gzip`)
    console.log(`  budget                                     ${kb(result.budgetGzipBytes).padStart(12)} gzip`)
    console.log(`  verdict                                    ${(result.withinBudget ? 'PASS' : 'FAIL').padStart(12)}`)
    console.log(`\n  per-route, on top of the shell:`)
    for (const [route, data] of Object.entries(result.routes)) {
        if (data.missing) {
            console.log(`    ${route.padEnd(20)} (no manifest entry for ${data.missing})`)
            continue
        }
        console.log(`    ${route.padEnd(20)} +${kb(data.addedJsGzip).padStart(9)}  →  ${kb(data.totalJsGzip)} total`)
    }
    console.log(`\n  forbidden Spline runtime chunks             ${result.forbiddenChunks.length === 0 ? 'none' : result.forbiddenChunks.join(', ')}`)
    console.log(`  dist/ on disk (NOT initial transfer)        ${kb(result.distTotalBytes)}`)
    console.log('')
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
    const args = process.argv.slice(2)
    const appIndex = args.indexOf('--app')
    const asJson = args.includes('--json')

    let requested;
    if (appIndex !== -1) {
        requested = [args[appIndex + 1]]
    } else {
        // Fall back to the app we are currently running inside, so `npm run budget`
        // in frontend/ doesn't require admin/dist to exist when run in isolated CI jobs.
        const cwdName = process.cwd().split('/').pop()
        requested = APPS[cwdName] ? [cwdName] : ['frontend', 'admin']
    }

    const results = requested.map((name) => report(name))
    if (asJson) console.log(JSON.stringify(results, null, 2))
    else results.forEach(print)

    const failures = results.filter((r) => !r.withinBudget || r.forbiddenChunks.length > 0)
    if (failures.length > 0) {
        console.error(`BUNDLE BUDGET: FAILED for ${failures.map((f) => f.app).join(', ')}`)
        process.exit(1)
    }
    console.log('BUNDLE BUDGET: within budget, no forbidden chunks.')
}
