// SECURITY — error, status-code and log hygiene.
//
// Findings: SEC-009 (internal errors returned verbatim), SEC-010 (every
//           response was HTTP 200), SEC-016 (tokens and key prefixes logged),
//           SEC-014 (weak default JWT_SECRET), SEC-020.
//
// Verification-suite items 8, 9, 12 and 14, and Gate 1 criteria 9 and 10.

import { describe, it, expect, vi, afterEach } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedAdmin, seedProduct, validAddress } from '../helpers/api.js'
import { classifyError, GENERIC_MESSAGE, createErrorHandler } from '../../middleware/errorHandler.js'
import { AppError, ValidationError } from '../../errors/AppError.js'
import { loadEnv, EnvValidationError, MIN_JWT_SECRET_LENGTH, KNOWN_WEAK_JWT_SECRETS } from '../../config/env.js'

useTestDatabase()

/** Anything that must never appear in a response body. */
const LEAK_PATTERNS = [
    /CastError/,
    /Cast to ObjectId/,
    /SyntaxError/,
    /TypeError/,
    /ValidatorError/,
    /MongoServerError/,
    /jwt (malformed|expired)/,
    /JsonWebTokenError|TokenExpiredError/,
    /at Object\.|at async |at Function\./,   // stack frames
    /\/home\/|\/usr\/|node_modules/,          // filesystem paths
    /mongodb:\/\//,
]

const expectNoLeak = (response) => {
    const serialised = JSON.stringify(response.body)
    for (const pattern of LEAK_PATTERNS) {
        expect(serialised, `leaked ${pattern} in ${serialised}`).not.toMatch(pattern)
    }
}

describe('SEC-010 — real status codes replace the blanket 200', () => {
    it.each([
        ['400 for a malformed body', 400, () => api().post('/api/product/single').send({ productId: 'nope' })],
        ['401 for a missing token', 401, () => api().post('/api/cart/get').send({})],
        ['401 for bad credentials', 401, () => api().post('/api/user/login').send({ email: 'a@b.test', password: 'wrong-password' })],
        ['404 for an unknown route', 404, () => api().get('/no-such-route')],
    ])('%s', async (_label, status, request) => {
        expect((await request()).status).toBe(status)
    })

    it('403 for a customer token on an admin route', async () => {
        const { token } = await seedCustomer()
        expect((await api().post('/api/order/list').set('token', token).send({})).status).toBe(403)
    })

    it('404 when an admin updates a status on an order that does not exist', async () => {
        const { token } = await seedAdmin()
        const response = await api().post('/api/order/status').set('token', token)
            .send({ orderId: '5eedffffffffffffffffffff', status: 'Shipped' })
        expect(response.status).toBe(404)
    })

    it('409 when an order exceeds available stock', async () => {
        const product = await seedProduct({ inventory: { Black: 2 } })
        const response = await api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: 'Black', quantity: 5 }],
            address: validAddress,
        })
        expect(response.status).toBe(409)
    })

    it('429 when a limiter engages', async () => {
        for (let i = 0; i < 6; i += 1) {
            await api().post('/api/user/login').send({ email: 'a@b.test', password: 'wrong-password' })
        }
        expect((await api().post('/api/user/login').send({ email: 'a@b.test', password: 'wrong-password' })).status).toBe(429)
    })

    it('201 when something is created', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'New', email: 'created@netronix.test', password: 'password123' })
        expect(response.status).toBe(201)
    })

    it('a successful response is still 200 with the envelope both clients expect', async () => {
        await seedProduct({ name: 'Listed' })
        const response = await api().get('/api/product/list')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.products).toHaveLength(1)
    })
})

describe('SEC-009 — no response leaks anything internal', () => {
    it.each([
        ['a malformed ObjectId', () => api().post('/api/product/single').send({ productId: 'not-an-id' })],
        ['a malformed token', () => api().post('/api/cart/get').set('token', 'not-a-jwt').send({})],
        ['an expired-looking token', () => api().post('/api/cart/get').set('token', 'a.b.c').send({})],
        ['malformed JSON', () => api().post('/api/user/login').set('Content-Type', 'application/json').send('{"email":')],
        ['an operator object', () => api().post('/api/user/login').send({ email: { $ne: null }, password: 'x'.repeat(10) })],
        ['an unknown route', () => api().get('/api/no-such-thing')],
    ])('%s leaks nothing', async (_label, request) => {
        expectNoLeak(await request())
    })

    it('every failure body carries a correlation id and nothing else surprising', async () => {
        const response = await api().post('/api/cart/get').send({})

        expect(Object.keys(response.body).sort()).toEqual(['message', 'requestId', 'success'])
        expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
        expect(response.headers['x-request-id']).toBe(response.body.requestId)
    })

    it('a validation failure names the field and the rule, never the value', async () => {
        const secret = 'hunter2-is-my-actual-password'
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'not-an-email', password: secret })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toContain(secret)
        expect(response.body.errors).toHaveProperty('email')
    })

    it('an unexpected internal error becomes a generic 500', () => {
        const classified = classifyError(new Error('connect ECONNREFUSED 10.0.0.5:27017'))
        expect(classified.status).toBe(500)
        expect(classified.message).toBe(GENERIC_MESSAGE)
        expect(classified.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/)
    })

    it.each([
        ['CastError', Object.assign(new Error('Cast to ObjectId failed for value "x"'), { name: 'CastError' }), 400],
        ['entity.too.large', Object.assign(new Error('request entity too large'), { type: 'entity.too.large' }), 413],
        ['entity.parse.failed', Object.assign(new SyntaxError('Unexpected end of JSON input'), { type: 'entity.parse.failed' }), 400],
        ['duplicate key', Object.assign(new Error('E11000 duplicate key'), { code: 11000 }), 409],
    ])('%s is classified as %i with a safe message', (_label, error, status) => {
        const classified = classifyError(error)
        expect(classified.status).toBe(status)
        for (const pattern of LEAK_PATTERNS) expect(classified.message).not.toMatch(pattern)
    })

    it('an AppError keeps its own client-safe message and its details stay server-side', () => {
        const error = new ValidationError('Invalid request', { details: 'productId 5eed… failed the regex' })
        const classified = classifyError(error)

        expect(classified.message).toBe('Invalid request')
        expect(JSON.stringify(classified)).not.toContain('5eed')
    })
})

describe('SEC-016 — nothing secret reaches a log', () => {
    // BE-011 — the error handler writes pino-shaped calls now
    // (`log.warn(object, message)`), so the fake has to serialise the object
    // rather than `String()` it, which produced "[object Object]" and made
    // this assertion vacuously pass.
    const capture = () => {
        const lines = []
        const sink = (...args) => lines.push(
            args.map((arg) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' '),
        )
        return { lines, logger: { error: sink, warn: sink, info: sink, log: sink, fatal: sink } }
    }

    /** Structured clone with cycles tolerated — a logged `err` has them. */
    const safeStringify = (value) => {
        const seen = new WeakSet()
        return JSON.stringify(value, (key, item) => {
            if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack }
            if (item && typeof item === 'object') {
                if (seen.has(item)) return '[Circular]'
                seen.add(item)
            }
            return item
        })
    }

    afterEach(() => vi.restoreAllMocks())

    it('the error handler logs a correlation id and a route, never a body or a header', () => {
        const { lines, logger } = capture()
        const handler = createErrorHandler({ logger })

        const token = 'eyJhbGciOiJIUzI1NiJ9.super-secret-token-value.signature'
        const req = {
            id: 'abc', method: 'POST', originalUrl: '/api/user/login?x=1',
            headers: { token }, body: { email: 'a@b.test', password: 'hunter2' },
        }
        const res = { headersSent: false, status: () => res, json: () => res }

        handler(new AppError('Invalid request', { status: 400, details: 'field email' }), req, res, () => { })

        const logged = lines.join('\n')
        expect(logged).toContain('abc')
        expect(logged).toContain('/api/user/login')
        expect(logged).not.toContain(token)
        expect(logged).not.toContain('hunter2')
        expect(logged).not.toContain('a@b.test')
    })

    it('no console output during a full login flow contains the issued token', async () => {
        const captured = []
        const sink = (...args) => captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
        vi.spyOn(console, 'log').mockImplementation(sink)
        vi.spyOn(console, 'warn').mockImplementation(sink)
        vi.spyOn(console, 'error').mockImplementation(sink)

        const { user } = await seedCustomer()
        const { body } = await api().post('/api/user/login')
            .send({ email: user.email, password: 'test-customer-password' })
        await api().post('/api/cart/get').set('token', body.token).send({})
        await api().post('/api/cart/get').set('token', 'not-a-jwt').send({})

        vi.restoreAllMocks()

        const logged = captured.join('\n')
        expect(logged).not.toContain(body.token)
        expect(logged).not.toContain('test-customer-password')
        expect(logged).not.toContain(process.env.JWT_SECRET)
    })

    it('no source file logs a token, a password or a key prefix', async () => {
        const { readFileSync, readdirSync, statSync } = await import('node:fs')
        const { join } = await import('node:path')

        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                if (['node_modules', 'test', 'coverage', '.git'].includes(entry)) continue
                const full = join(dir, entry)
                if (statFileIsDirectory(full)) { walk(full); continue }
                if (!entry.endsWith('.js')) continue

                const source = readFileSync(full, 'utf8')
                for (const line of source.split('\n')) {
                    if (!/console\.(log|warn|error|info|debug)/.test(line)) continue
                    // A log line that interpolates a secret-bearing identifier.
                    if (/\$\{[^}]*(token|password|secret|apiKey|api_key)[^}]*\}/i.test(line)
                        || /,\s*(token|password|apiKey|secret)\b/i.test(line)
                        || /\.substring\(0,\s*\d+\)/.test(line)) {
                        offenders.push(`${full}: ${line.trim()}`)
                    }
                }
            }
        }
        const statFileIsDirectory = (p) => statSync(p).isDirectory()
        walk(process.cwd())

        expect(offenders).toEqual([])
    })
})

describe('SEC-014 — a weak JWT_SECRET refuses boot in every environment', () => {
    const base = { MONGODB_URI: 'mongodb://127.0.0.1:27017/e-commerce' }

    it.each([...KNOWN_WEAK_JWT_SECRETS])('refuses the known placeholder %s', (secret) => {
        expect(() => loadEnv({ env: { ...base, JWT_SECRET: secret }, silent: true })).toThrow(EnvValidationError)
    })

    it.each(['development', 'test', 'production'])('refuses it in NODE_ENV=%s too', (nodeEnv) => {
        // Phase 0 downgraded this to a warning outside production. It is a hard
        // failure everywhere now: a development instance signing tokens with a
        // string published in this repository is exactly the configuration that
        // gets promoted by accident.
        expect(() => loadEnv({
            env: { ...base, NODE_ENV: nodeEnv, JWT_SECRET: 'netronix_secret_key_replace_in_production' },
            silent: true,
        })).toThrow(EnvValidationError)
    })

    it(`refuses a secret shorter than ${MIN_JWT_SECRET_LENGTH} characters`, () => {
        expect(() => loadEnv({ env: { ...base, JWT_SECRET: 'a'.repeat(MIN_JWT_SECRET_LENGTH - 1) }, silent: true }))
            .toThrow(EnvValidationError)
    })

    it('never puts the offending value in the error message', () => {
        const secret = 'short-and-secret'
        try {
            loadEnv({ env: { ...base, JWT_SECRET: secret }, silent: true })
            throw new Error('should have refused')
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError)
            expect(error.message).toContain('JWT_SECRET')
            expect(error.message).not.toContain(secret)
        }
    })

    it('accepts a properly generated secret', () => {
        const { config } = loadEnv({ env: { ...base, JWT_SECRET: 'x'.repeat(48) }, silent: true })
        expect(config.JWT_SECRET).toHaveLength(48)
    })

    it('ADMIN_PASSWORD is no longer a runtime variable at all (SEC-001)', () => {
        const { config } = loadEnv({ env: { ...base, JWT_SECRET: 'x'.repeat(48), ADMIN_PASSWORD: 'anything' }, silent: true })
        expect(config).not.toHaveProperty('ADMIN_PASSWORD')
        expect(config).not.toHaveProperty('ADMIN_EMAIL')
    })

    it('setupEnv.js generates a secret instead of writing the placeholder', async () => {
        const { readFileSync } = await import('node:fs')
        const source = readFileSync(new URL('../../setupEnv.js', import.meta.url), 'utf8')

        // Comments are stripped before scanning: the file's header quotes the
        // old placeholder line in order to explain what was removed, and that
        // documentation should not be what this test reacts to.
        const code = source
            .split('\n')
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join('\n')

        expect(code).toContain('crypto.randomBytes')
        expect(code).not.toMatch(/JWT_SECRET=netronix_secret_key_replace_in_production/)
        expect(code).not.toMatch(/ADMIN_PASSWORD=/)
    })
})
