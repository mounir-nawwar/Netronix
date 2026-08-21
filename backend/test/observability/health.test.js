// BE-014 — `GET /health`, both branches.
//
// `GET /` answered "API Working" whatever state the process was in, including
// with MongoDB unreachable. That is the exact condition a health check exists
// to detect, and the old one could not: a load balancer reading it would keep
// routing traffic to an instance that could not serve a request.
//
// Driven entirely through Supertest against the in-process app — no port is
// opened. The unavailable branch is produced by injecting a connection object,
// not by disconnecting the shared one, because tearing down the suite's own
// replica set to test a 503 would take every other test with it.

import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { api } from '../helpers/api.js'
import { useTestDatabase } from '../helpers/db.js'
import { createApp } from '../../app.js'
import { createHealthRouter } from '../../routes/healthRoute.js'

// A real in-memory replica set, created and destroyed by this process, so the
// healthy branch is measured against an actual `ping` rather than a stub.
useTestDatabase()

/** An app carrying only the health router, on a fake connection. */
function appWithConnection(connection, options = {}) {
    const app = express()
    app.use(createHealthRouter({ connection, ...options }))
    return app
}

const connected = (ping) => ({ readyState: 1, db: { admin: () => ({ ping }) } })

describe('a healthy instance', () => {
    it('answers 200 with the database reported ok', async () => {
        const response = await api().get('/health')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            status: 'ok',
            live: true,
            ready: true,
            checks: { database: 'ok' },
        })
    })

    it('is reachable without a token', async () => {
        // No auth header of any kind. A probe cannot hold a credential.
        expect((await api().get('/health')).status).toBe(200)
    })
})

describe('an unhealthy instance', () => {
    it('answers 503 when the connection is not established', async () => {
        const app = appWithConnection({ readyState: 0 })
        const response = await request(app).get('/health')

        expect(response.status).toBe(503)
        expect(response.body).toMatchObject({
            status: 'degraded',
            live: true,
            ready: false,
            checks: { database: 'unavailable' },
        })
    })

    it('answers 503 when the ping rejects', async () => {
        const app = appWithConnection(connected(async () => { throw new Error('connection refused to 10.0.0.4:27017') }))
        const response = await request(app).get('/health')

        expect(response.status).toBe(503)
        expect(response.body.checks.database).toBe('unavailable')
    })

    it('answers 503 rather than hanging when the ping is slow', async () => {
        const app = appWithConnection(
            connected(() => new Promise(() => { })), // never settles
            { timeoutMs: 50 },
        )
        const response = await request(app).get('/health')

        expect(response.status).toBe(503)
        expect(response.body.checks.database).toBe('unavailable')
    })

    it('still reports liveness — the process is up, it is the dependency that is not', async () => {
        const response = await request(appWithConnection({ readyState: 0 })).get('/health')
        expect(response.body.live).toBe(true)
        expect(response.body.ready).toBe(false)
    })
})

describe('SEC-016 — the body exposes nothing internal', () => {
    it('leaks no connection string, host, driver message or version', async () => {
        const leaky = 'mongodb+srv://admin:hunter2@cluster0.abcde.mongodb.net'
        const app = appWithConnection(connected(async () => { throw new Error(`failed to connect to ${leaky}`) }))

        const response = await request(app).get('/health')
        const body = JSON.stringify(response.body)

        expect(body).not.toContain('mongodb')
        expect(body).not.toContain('hunter2')
        expect(body).not.toContain('cluster0')
        expect(body).not.toContain('27017')
        // A fixed vocabulary, and nothing else: no uptime, no counts, no
        // version — a health endpoint is unauthenticated, so its body is public.
        expect(Object.keys(response.body).sort()).toEqual(['checks', 'live', 'ready', 'status'])
        expect(Object.keys(response.body.checks)).toEqual(['database'])
        expect(['ok', 'unavailable']).toContain(response.body.checks.database)
    })
})

describe('placement in the middleware stack', () => {
    it('is mounted ahead of the global rate limiter', async () => {
        // A probe running every few seconds must not be able to spend the
        // global budget and then report the service as down for asking.
        const app = createApp()
        const names = app._router.stack.map((layer) => layer.name)
        const healthIndex = app._router.stack.findIndex(
            (layer) => layer.name === 'router' && !layer.regexp.source.includes('api'),
        )

        expect(healthIndex).toBeGreaterThan(-1)
        const limiterIndex = names.findIndex((name) => /limit/i.test(name))
        if (limiterIndex !== -1) expect(healthIndex).toBeLessThan(limiterIndex)
    })

    it('carries the correlation id header like every other response', async () => {
        const response = await api().get('/health')
        expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    })
})
