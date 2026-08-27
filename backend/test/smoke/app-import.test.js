// B-0 — importing the Express application must be free of startup side effects.
//
// This is the test that makes every other backend test possible: Supertest can
// only drive the API in-process if importing it does not open a socket or a
// database connection.
//
// The handle snapshot is taken at module scope, before the dynamic import, so
// it measures exactly what importing `app.js` adds to the process.

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'

const activeHandles = () =>
    typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : []

const handlesBefore = new Set(activeHandles())
const resourcesBefore = process.getActiveResourcesInfo()
const readyStateBefore = mongoose.connection.readyState

// The measurement point.
const appModule = await import('../../app.js')

const newHandles = activeHandles().filter((handle) => !handlesBefore.has(handle))
const resourcesAfter = process.getActiveResourcesInfo()
const newHandleNames = newHandles.map((handle) => handle?.constructor?.name ?? 'unknown')

const countOf = (list, name) => list.filter((entry) => entry === name).length

describe('B-0: importing app.js has no startup side effects', () => {
    it('exports a configured Express app and a createApp factory', () => {
        expect(typeof appModule.default).toBe('function')
        expect(typeof appModule.createApp).toBe('function')
        // The factory returns a fresh instance every call, so a test can hold an
        // app in isolation from the shared default export.
        expect(appModule.createApp()).not.toBe(appModule.createApp())
    })

    it('does not open a listening port', () => {
        expect(newHandleNames.filter((name) => name === 'Server')).toEqual([])
        // TCPSERVERWRAP is the libuv resource behind `app.listen()`.
        const serverWrapsBefore = countOf(resourcesBefore, 'TCPSERVERWRAP')
        const serverWrapsAfter = countOf(resourcesAfter, 'TCPSERVERWRAP')
        expect(serverWrapsAfter).toBe(serverWrapsBefore)
    })

    it('does not connect to a database', () => {
        // 0 === disconnected. Importing the app must not change it.
        expect(readyStateBefore).toBe(0)
        expect(mongoose.connection.readyState).toBe(0)
        expect(mongoose.connections.filter((c) => c.readyState !== 0)).toEqual([])
    })

    it('does not require any environment variable to be set', () => {
        // test/setup.js deletes MONGODB_URI and the Cloudinary/Groq keys
        // before any module loads. Reaching this point at all proves app.js
        // reads no configuration at module scope.
        expect(process.env.MONGODB_URI).toBeUndefined()
        expect(process.env.CLOUDINARY_NAME).toBeUndefined()
    })

    it('serves requests in-process through Supertest', async () => {
        const response = await request(appModule.default).get('/')
        expect(response.status).toBe(200)
        expect(response.text).toBe('API Working')
    })

    it('registers every existing API namespace', () => {
        // Inspected on the router stack rather than by issuing requests: with no
        // database connected, a request that reaches a controller would sit in
        // mongoose's buffer until it times out, and a controller-issued 404 is
        // indistinguishable from an unmounted router.
        const app = appModule.createApp()
        const mountedRouters = app._router.stack.filter((layer) => layer.name === 'router')
        const namespaces = ['/api/user', '/api/product', '/api/cart', '/api/order', '/api/chatbot']

        for (const namespace of namespaces) {
            const isMounted = mountedRouters.some((layer) => layer.regexp.test(namespace))
            expect(isMounted, `${namespace} is not mounted`).toBe(true)
        }
        // BE-014 added one more: the root-mounted `/health` router. Counted
        // explicitly rather than by loosening the total, so a sixth *API*
        // namespace appearing unannounced still fails this test.
        const apiRouters = mountedRouters.filter((layer) => layer.regexp.source.includes('api'))
        expect(apiRouters).toHaveLength(namespaces.length)
        expect(mountedRouters).toHaveLength(namespaces.length + 1)
    })

    it('does not start a persistent timer', () => {
        // Node does not surface timers through _getActiveHandles(), so this is
        // measured with the documented process.getActiveResourcesInfo().
        //
        // The chat-session cleanup sweep used to be a module-scope setInterval
        // in services/AIclient.js, reached transitively through
        // chatbotRoute → chatbotController → AIclient. It is now started by
        // server.js during process startup instead.
        expect(countOf(resourcesAfter, 'Timeout')).toBe(countOf(resourcesBefore, 'Timeout'))
        expect(newHandleNames.filter((name) => name === 'Timeout')).toEqual([])
    })

    it('registers json body parsing and CORS ahead of the API routers', () => {
        const app = appModule.createApp()
        const names = app._router.stack.map((layer) => layer.name)
        expect(names).toContain('jsonParser')
        expect(names).toContain('corsMiddleware')

        // Measured against the first *API* router. `/health` is a router and is
        // mounted before both of these on purpose: it reads no body, and
        // putting it ahead of the rate limiter is what stops a probe from
        // spending the global request budget (BE-014).
        const firstApiRouter = app._router.stack.findIndex(
            (layer) => layer.name === 'router' && layer.regexp.source.includes('api'),
        )
        expect(firstApiRouter).toBeGreaterThan(-1)
        expect(names.indexOf('jsonParser')).toBeLessThan(firstApiRouter)
        expect(names.indexOf('corsMiddleware')).toBeLessThan(firstApiRouter)
    })
})

describe('BE-001 / DEVOPS-001: no session lives in module memory, and no sweep exists', () => {
    // FLIPPED in Phase 3, roadmap task 3.13.
    //
    // Phase 0 recorded this as "the sweep is started by the process, not by an
    // import": moving the `setInterval` out of module scope made `app.js`
    // importable, but it left the actual defect in place — sessions in two
    // module-level `Map`s, lost on every restart and on every serverless cold
    // start, with `activeSessions` having no expiry at all.
    //
    // There is no sweep now, because there is nothing in memory to sweep. The
    // behavioural half — a session surviving a cold start, and the TTL index
    // that expires it — is in test/correctness/chat-sessions.test.js, which has
    // a database; this file only ever measures what *importing* costs.

    it('no longer exports a cleanup sweep of any kind', async () => {
        const module = await import('../../services/AIclient.js')
        expect(module.startSessionCleanup).toBeUndefined()
        expect(module.stopSessionCleanup).toBeUndefined()
        expect(module.isSessionCleanupRunning).toBeUndefined()
        expect(module.SESSION_CLEANUP_INTERVAL_MS).toBeUndefined()
    })

    it('holds no module-level session map in either file', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')

        // Both files now describe the removed sweep in their header, so the
        // prose has to be stripped before the code is scanned for it.
        const withoutComments = (text) =>
            text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

        for (const file of ['services/AIclient.js', 'controllers/chatbotController.js']) {
            const source = withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))
            // Named rather than "any Map", because `buildCatalogIndex` builds a
            // perfectly good per-request Map and always did. What must not exist
            // is a Map that *outlives* the request.
            expect(source, `${file} still holds sessions in memory`)
                .not.toMatch(/^\s*(const|let|var)\s+\w*[Ss]essions\s*=\s*new Map\(\)/m)
            expect(source, `${file} still starts a timer`).not.toMatch(/setInterval/)
        }
    })

    it('no file in the application starts an interval at all', async () => {
        const { readFileSync, readdirSync, statSync } = await import('node:fs')
        const { join } = await import('node:path')

        // Comments are stripped first. Both files that used to hold the sweep
        // now *describe* it in their header, explaining what was removed and
        // why — prose that must not be mistaken for the thing it describes.
        const withoutComments = (source) =>
            source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                if (['node_modules', 'test', 'coverage', '.git'].includes(entry)) continue
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) walk(full)
                else if (entry.endsWith('.js') && /setInterval\(/.test(withoutComments(readFileSync(full, 'utf8')))) {
                    offenders.push(entry)
                }
            }
        }
        walk(process.cwd())
        expect(offenders).toEqual([])
    })
})
