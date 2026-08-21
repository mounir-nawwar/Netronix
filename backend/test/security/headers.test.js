// SECURITY — transport hardening: helmet headers, CSP, body limits, CORS.
//
// Findings: SEC-013 (no security headers or CSP), SEC-011 (no body limit),
//           DEVOPS-004 (hardcoded CORS allowlist).
//
// Verification-suite items 11 (helmet headers on every response) and part of
// the Gate 1 CORS criterion.

import { describe, it, expect } from 'vitest'

import { api } from '../helpers/api.js'
import { createApp } from '../../app.js'
import request from 'supertest'
import { cspDirectives, parseCorsOrigins, DEFAULT_CORS_ORIGINS } from '../../config/security.js'

/** Parse a CSP header into { directive: [values] }. */
const parseCsp = (header) =>
    Object.fromEntries(
        header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
            const [name, ...values] = part.split(/\s+/)
            return [name, values]
        }),
    )

describe('SEC-013 — helmet headers are on every response', () => {
    it.each([
        ['get', '/'],
        ['get', '/api/product/list'],
        ['post', '/api/user/login'],
    ])('%s %s carries the security headers', async (method, path) => {
        const response = await api()[method](path).send({})

        expect(response.headers['x-content-type-options']).toBe('nosniff')
        expect(response.headers['content-security-policy']).toBeDefined()
        expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
        expect(response.headers['x-frame-options']).toBeDefined()
        expect(response.headers['strict-transport-security']).toBeDefined()
    })

    it('no longer advertises Express', async () => {
        const response = await api().get('/')
        expect(response.headers['x-powered-by']).toBeUndefined()
    })

    it('emits a correlation id on every response', async () => {
        const response = await api().get('/')
        expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    })
})

describe('SEC-013 — the CSP is compatible with the storefront it protects', () => {
    it('permits the Spline hero iframe, Cloudinary images and Google Fonts', async () => {
        const { headers } = await api().get('/')
        const csp = parseCsp(headers['content-security-policy'])

        expect(csp['frame-src']).toContain('https://my.spline.design')
        expect(csp['img-src']).toContain('https://res.cloudinary.com')
        expect(csp['style-src']).toContain('https://fonts.googleapis.com')
        expect(csp['font-src']).toContain('https://fonts.gstatic.com')
        expect(csp['script-src']).toContain('https://unpkg.com')
    })

    it("does not weaken script-src with 'unsafe-inline' or 'unsafe-eval' (SEC-004 defence in depth)", async () => {
        const { headers } = await api().get('/')
        const csp = parseCsp(headers['content-security-policy'])

        expect(csp['script-src']).not.toContain("'unsafe-inline'")
        expect(csp['script-src']).not.toContain("'unsafe-eval'")
        expect(csp['object-src']).toEqual(["'none'"])
    })

    it('includes the configured API origin in connect-src', () => {
        const directives = cspDirectives(['https://api.netronix.test'])
        expect(directives.connectSrc).toContain('https://api.netronix.test')
        expect(directives.connectSrc).toContain("'self'")
    })
})

describe('SEC-011 — the JSON body limit is 100 KB', () => {
    it('rejects an oversized JSON body with 413 and no internals', async () => {
        const response = await api()
            .post('/api/user/login')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(200 * 1024) }))

        expect(response.status).toBe(413)
        expect(JSON.stringify(response.body)).not.toMatch(/entity.too.large|PayloadTooLargeError|at Object\./)
    })

    it('accepts a normal body', async () => {
        const response = await api().post('/api/user/login').send({ email: 'a@b.test', password: 'x'.repeat(64) })
        expect(response.status).not.toBe(413)
    })

    it('answers malformed JSON with 400 rather than a raw SyntaxError', async () => {
        const response = await api()
            .post('/api/user/login')
            .set('Content-Type', 'application/json')
            .send('{"email": ')

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/SyntaxError|JSON at position|Unexpected end/)
    })
})

describe('DEVOPS-004 — the CORS allowlist is env-driven and validated', () => {
    it('falls back to the previously hardcoded list when CORS_ORIGINS is unset', () => {
        expect(parseCorsOrigins(undefined).origins).toEqual(DEFAULT_CORS_ORIGINS)
        expect(parseCorsOrigins('').origins).toEqual(DEFAULT_CORS_ORIGINS)
    })

    it('parses a comma-separated list and drops anything that is not an absolute http(s) URL', () => {
        const { origins, rejected } = parseCorsOrigins('http://localhost:5173, https://shop.test , not-a-url, *')
        expect(origins).toEqual(['http://localhost:5173', 'https://shop.test'])
        expect(rejected).toEqual(['not-a-url', '*'])
    })

    it('permits a configured origin and refuses one that is not configured', async () => {
        const app = createApp({ env: { CORS_ORIGINS: 'http://localhost:5173' } })

        const allowed = await request(app).get('/').set('Origin', 'http://localhost:5173')
        expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')

        const refused = await request(app).get('/').set('Origin', 'https://evil.test')
        expect(refused.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('does not enable credentials mode while auth travels in a custom header (SEC-021)', async () => {
        const response = await api().get('/').set('Origin', 'http://localhost:5173')
        expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
describe('CORS covers every method the API actually routes (DEVOPS-004)', () => {
    // Added in Phase 3. `PATCH /api/product/:id` (ADM-002) was routed while
    // `corsOptions.methods` still listed only GET/POST/PUT/DELETE/OPTIONS, so a
    // browser's preflight was refused and the admin console's save failed with
    // `net::ERR_FAILED`. Nothing server-side could see it: Supertest sends no
    // preflight, so all 893 backend tests passed against a console that could
    // not save.
    //
    // This asserts the allow-list against Express's own routing table, the same
    // way the guarded-route and validated-endpoint tables are asserted — so a
    // method added to a route without being added here fails the suite.

    it('allows every HTTP method the router stack declares', async () => {
        const { corsOptions } = await import('../../config/security.js')
        const app = (await import('../../app.js')).createApp()

        const routed = new Set()
        for (const layer of app._router.stack) {
            if (layer.name !== 'router' || !layer.handle?.stack) continue
            for (const entry of layer.handle.stack) {
                if (!entry.route) continue
                for (const method of Object.keys(entry.route.methods)) routed.add(method.toUpperCase())
            }
        }

        const allowed = new Set(corsOptions(['http://localhost:5173']).methods)
        const missing = [...routed].filter((method) => !allowed.has(method))
        expect(missing, `these routed methods are not in the CORS allow-list: ${missing.join(', ')}`).toEqual([])
    })

    it('answers a PATCH preflight from an allowed origin', async () => {
        const response = await api()
            .options('/api/product/680897a3a9a5ffb06b2e52c8')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'PATCH')
            .set('Access-Control-Request-Headers', 'token,content-type')

        expect(response.status).toBeLessThan(400)
        expect(response.headers['access-control-allow-methods']).toMatch(/PATCH/)
        expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    })

    // Added in the Phase 0–2 pre-commit pass, for the same reason and the same
    // failure mode one level down: the storefront now sends `Idempotency-Key`
    // on checkout (DB-012). A request header that is not on the allow-list is
    // refused at preflight, so the order request would never leave the browser
    // — and, exactly as with PATCH, no server-side test would notice.
    it('allows every request header a client is expected to send', async () => {
        const { corsOptions } = await import('../../config/security.js')
        const allowed = corsOptions(['http://localhost:5173']).allowedHeaders.map((h) => h.toLowerCase())

        for (const header of ['content-type', 'token', 'idempotency-key']) {
            expect(allowed, `${header} is not on the CORS request-header allow-list`).toContain(header)
        }
    })

    it('answers a preflight that asks for the idempotency key', async () => {
        const response = await api()
            .options('/api/order/guest/place')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,idempotency-key')

        expect(response.status).toBeLessThan(400)
        expect(response.headers['access-control-allow-headers'].toLowerCase()).toMatch(/idempotency-key/)
    })

    it('still refuses a preflight from an origin that is not allowed', async () => {
        const response = await api()
            .options('/api/product/680897a3a9a5ffb06b2e52c8')
            .set('Origin', 'https://evil.test')
            .set('Access-Control-Request-Method', 'PATCH')

        expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
})
