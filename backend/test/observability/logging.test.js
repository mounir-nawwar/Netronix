// BE-011 / SEC-016 / DEVOPS-005 — logging, redaction, correlation, telemetry.
//
// These assert against **real serialised pino output**, captured through a
// writable stream, rather than against the redaction configuration. Asserting
// that `REDACT_PATHS` contains `'token'` proves nothing: pino's path syntax has
// enough corners (`*`, bracket notation, depth) that a plausible-looking path
// can silently match nothing. The only thing worth testing is the bytes.

import { Writable } from 'node:stream'

import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { api, seedCustomer, TEST_CUSTOMER_PASSWORD } from '../helpers/api.js'
import { useTestDatabase } from '../helpers/db.js'
import { createLogger, REDACTED, REDACT_PATHS } from '../../lib/logger.js'
import { createRequestLogger } from '../../middleware/requestLogger.js'
import { initTelemetry, scrub } from '../../lib/telemetry.js'
import { createErrorHandler } from '../../middleware/errorHandler.js'
import { AppError } from '../../errors/AppError.js'

/** A logger whose output this test can read, at a level that emits everything. */
function capturing() {
    const lines = []
    const stream = new Writable({
        write(chunk, _encoding, done) {
            lines.push(JSON.parse(chunk.toString()))
            done()
        },
    })
    return { lines, logger: createLogger({ env: { LOG_LEVEL: 'trace' }, destination: stream }) }
}

useTestDatabase()

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.super-secret-token-value.signature'

describe('redaction', () => {
    it('redacts a top-level token, password, authorization and apiKey', () => {
        const { lines, logger } = capturing()

        logger.info({
            token: TOKEN,
            password: 'hunter2',
            authorization: `Bearer ${TOKEN}`,
            apiKey: 'sk-live-abcdef',
            secret: 'shhh',
            jwt: TOKEN,
        }, 'sensitive')

        const [line] = lines
        for (const key of ['token', 'password', 'authorization', 'apiKey', 'secret', 'jwt']) {
            expect(line[key], key).toBe(REDACTED)
        }
        expect(JSON.stringify(line)).not.toContain('super-secret-token-value')
        expect(JSON.stringify(line)).not.toContain('hunter2')
        expect(JSON.stringify(line)).not.toContain('sk-live-abcdef')
    })

    it('redacts nested values, which is where this project actually keeps them', () => {
        const { lines, logger } = capturing()

        logger.info({
            req: { headers: { token: TOKEN, authorization: `Bearer ${TOKEN}`, cookie: 'session=abc' } },
            body: { password: 'hunter2', email: 'a@b.test' },
            user: { token: TOKEN },
        }, 'nested')

        const serialised = JSON.stringify(lines[0])
        expect(serialised).not.toContain('super-secret-token-value')
        expect(serialised).not.toContain('hunter2')
        expect(serialised).not.toContain('session=abc')
        // A non-secret field on the same object is untouched — over-redaction
        // makes logs useless and is its own failure.
        expect(lines[0].body.email).toBe('a@b.test')
    })

    it('redacts environment secrets if a config object is ever logged', () => {
        const { lines, logger } = capturing()

        logger.info({
            config: {
                NODE_ENV: 'production',
                PORT: 4000,
                JWT_SECRET: 'a'.repeat(64),
                GROQ_API_KEY: 'sk-live-abcdef',
                MONGODB_URI: 'mongodb+srv://admin:hunter2@cluster0.mongodb.net',
                CLOUDINARY_API_KEY: '123456',
                CLOUDINARY_SECRET_KEY: 'shhh',
            },
        }, 'config')

        const serialised = JSON.stringify(lines[0])
        expect(serialised).not.toContain('hunter2')
        expect(serialised).not.toContain('sk-live-abcdef')
        expect(serialised).not.toContain('a'.repeat(64))
        // The non-secret ones survive, because that is the point of logging it.
        expect(lines[0].config.NODE_ENV).toBe('production')
        expect(lines[0].config.PORT).toBe(4000)
    })

    it('covers every documented path with a real value', () => {
        // Guards against a path that looks right and matches nothing.
        const { lines, logger } = capturing()
        const payload = {}
        for (const path of REDACT_PATHS.filter((p) => !p.includes('*') && !p.includes('['))) {
            const parts = path.split('.')
            let cursor = payload
            for (const part of parts.slice(0, -1)) {
                cursor[part] = cursor[part] ?? {}
                cursor = cursor[part]
            }
            cursor[parts[parts.length - 1]] = 'CANARY-VALUE'
        }
        logger.info(payload, 'canaries')
        expect(JSON.stringify(lines[0])).not.toContain('CANARY-VALUE')
    })
})

describe('correlation', () => {
    it('puts the request id on every line for a request, and on the response header', async () => {
        const { lines, logger } = capturing()

        const app = express()
        app.use((req, res, next) => { req.id = 'test-correlation-id'; res.setHeader('X-Request-Id', req.id); next() })
        app.use(createRequestLogger({ logger }))
        app.get('/thing', (req, res) => {
            req.log.info({ event: 'handler.ran' }, 'inside the handler')
            res.json({ ok: true })
        })

        const response = await request(app).get('/thing')

        expect(response.headers['x-request-id']).toBe('test-correlation-id')
        expect(lines.length).toBeGreaterThanOrEqual(2)
        for (const line of lines) {
            expect(line.req?.id ?? line.reqId).toBe('test-correlation-id')
        }
        // The handler's own line joins up with the request's.
        expect(lines.some((line) => line.event === 'handler.ran')).toBe(true)
    })

    it('logs the path but never the query string, which can carry a token', async () => {
        const { lines, logger } = capturing()

        const app = express()
        app.use((req, res, next) => { req.id = 'q'; next() })
        app.use(createRequestLogger({ logger }))
        app.get('/thing', (req, res) => res.json({ ok: true }))

        await request(app).get(`/thing?token=${TOKEN}&page=2`)

        const serialised = JSON.stringify(lines)
        expect(serialised).toContain('/thing')
        expect(serialised).not.toContain('super-secret-token-value')
    })

    it('does not log the health probe', async () => {
        const { lines, logger } = capturing()

        const app = express()
        app.use((req, res, next) => { req.id = 'h'; next() })
        app.use(createRequestLogger({ logger }))
        app.get('/health', (req, res) => res.json({ status: 'ok' }))
        app.get('/other', (req, res) => res.json({ ok: true }))

        await request(app).get('/health')
        expect(lines).toHaveLength(0)

        await request(app).get('/other')
        expect(lines.length).toBeGreaterThan(0)
    })
})

describe('the error handler', () => {
    it('logs the id and the route, and neither the body nor the headers', async () => {
        const { lines, logger } = capturing()

        const app = express()
        app.use((req, res, next) => { req.id = 'err-id'; next() })
        app.post('/api/user/login', () => { throw new AppError('Invalid request', { status: 400 }) })
        app.use(createErrorHandler({ logger }))

        await request(app).post('/api/user/login').set('token', TOKEN).send({ password: 'hunter2' })

        const serialised = JSON.stringify(lines)
        expect(serialised).toContain('err-id')
        expect(serialised).toContain('/api/user/login')
        expect(serialised).not.toContain('super-secret-token-value')
        expect(serialised).not.toContain('hunter2')
    })
})

describe('no token reaches any log during a real login', () => {
    it('logs nothing containing the issued token', async () => {
        const captured = []
        const sink = (...args) => captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
        vi.spyOn(console, 'log').mockImplementation(sink)
        vi.spyOn(console, 'warn').mockImplementation(sink)
        vi.spyOn(console, 'error').mockImplementation(sink)
        const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

        try {
            const { user } = await seedCustomer()
            const { body } = await api().post('/api/user/login')
                .send({ email: user.email, password: TEST_CUSTOMER_PASSWORD })

            expect(body.token).toBeTruthy()
            const everything = captured.join('\n') + stdout.mock.calls.map((call) => String(call[0])).join('\n')
            expect(everything).not.toContain(body.token)
        } finally {
            vi.restoreAllMocks()
        }
    })
})

describe('DEVOPS-005 — telemetry is off, and makes no request', () => {
    it('is disabled with no DSN, and capturing an exception does nothing', () => {
        const telemetry = initTelemetry({ env: {} })

        expect(telemetry.enabled).toBe(false)
        expect(telemetry.reason).toMatch(/SENTRY_DSN/)
        expect(() => telemetry.captureException(new Error('boom'))).not.toThrow()
    })

    it('stays disabled when a DSN is set but no SDK is available', () => {
        const warnings = []
        const telemetry = initTelemetry({
            env: { SENTRY_DSN: 'https://public@o0.ingest.example.invalid/1' },
            logger: { warn: (message) => warnings.push(message) },
        })

        expect(telemetry.enabled).toBe(false)
        expect(warnings.join(' ')).toMatch(/no Sentry SDK/i)
    })

    it('initialises an injected SDK without sending anything itself', () => {
        const calls = { init: [], captured: [] }
        const sdk = {
            init: (options) => calls.init.push(options),
            captureException: (error, context) => calls.captured.push({ error, context }),
        }

        const telemetry = initTelemetry({
            env: { SENTRY_DSN: 'https://public@o0.ingest.example.invalid/1', NODE_ENV: 'test' },
            sdk,
        })

        expect(telemetry.enabled).toBe(true)
        expect(calls.init).toHaveLength(1)
        expect(calls.init[0]).toMatchObject({ sendDefaultPii: false, environment: 'test' })

        telemetry.captureException(new Error('boom'), { token: TOKEN, requestId: 'r1' })
        expect(calls.captured).toHaveLength(1)
        // The report is scrubbed before it would ever leave the process.
        expect(calls.captured[0].context.extra.token).toBe(REDACTED)
        expect(calls.captured[0].context.extra.requestId).toBe('r1')
    })

    it('scrubs nested and circular payloads', () => {
        const payload = { req: { headers: { token: TOKEN } }, user: { password: 'hunter2' } }
        payload.self = payload

        const scrubbed = scrub(payload)
        expect(JSON.stringify(scrubbed)).not.toContain('super-secret-token-value')
        expect(JSON.stringify(scrubbed)).not.toContain('hunter2')
    })

    it('declares no Sentry dependency, so `npm ci` installs nothing that can phone home', async () => {
        const { readFileSync } = await import('node:fs')
        const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
        const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
        expect(declared.filter((name) => name.includes('sentry'))).toEqual([])
    })

    it('the shipped default handle is disabled', async () => {
        const telemetry = (await import('../../lib/telemetry.js')).default
        expect(telemetry.enabled).toBe(false)
    })
})
