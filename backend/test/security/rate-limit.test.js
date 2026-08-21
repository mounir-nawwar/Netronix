// SECURITY — rate limiting.
//
// Findings: SEC-005 (nothing throttled anywhere), SEC-011 (unthrottled guest
//           checkout drains inventory), SEC-023 (no chat message length cap).
//
// Verification-suite item 5, and the Gate 1 criterion "20 rapid login attempts
// produce 429".
//
// Determinism: `test/setup.js` clears every limiter store before each test, so
// a threshold assertion depends only on the requests that test makes. The
// policy itself is untouched — same windows, same maxima as production.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedProduct, validAddress } from '../helpers/api.js'
import { RATE_LIMITS } from '../../middleware/rateLimit.js'
import orderModel from '../../models/orderModel.js'

useTestDatabase()

const login = () => api().post('/api/user/login').send({ email: 'nobody@netronix.test', password: 'wrong-password' })

describe('SEC-005 — authentication endpoints allow 5 attempts per 15 minutes', () => {
    it('the 6th login attempt is 429', async () => {
        for (let attempt = 1; attempt <= RATE_LIMITS.auth.max; attempt += 1) {
            expect((await login()).status, `attempt ${attempt}`).not.toBe(429)
        }
        const blocked = await login()
        expect(blocked.status).toBe(429)
        expect(blocked.body.success).toBe(false)
    })

    it('GATE 1 — 20 rapid login attempts produce 429', async () => {
        const statuses = []
        for (let i = 0; i < 20; i += 1) statuses.push((await login()).status)

        expect(statuses).toContain(429)
        expect(statuses.indexOf(429)).toBe(RATE_LIMITS.auth.max)
        expect(statuses.slice(RATE_LIMITS.auth.max).every((s) => s === 429)).toBe(true)
    })

    it('applies to registration and to admin login as well', async () => {
        for (let i = 0; i < RATE_LIMITS.auth.max; i += 1) {
            await api().post('/api/user/register').send({ name: 'x', email: `r${i}@netronix.test`, password: 'password123' })
        }
        expect((await api().post('/api/user/admin').send({ email: 'a@b.test', password: 'password123' })).status).toBe(429)
    })

    it('advertises the limit in standard headers', async () => {
        const response = await login()
        expect(response.headers['ratelimit-limit'] ?? response.headers.ratelimit).toBeDefined()
    })
})

describe('SEC-005 / SEC-023 — the chatbot allows 10 messages per minute', () => {
    const message = (body) => api().post('/api/chatbot/message').send({ sessionId: 'no-such-session', message: 'hi', ...body })

    it('the 11th chat message is 429', async () => {
        for (let i = 0; i < RATE_LIMITS.chatbot.max; i += 1) {
            expect((await message()).status).not.toBe(429)
        }
        expect((await message()).status).toBe(429)
    })

    it('rejects a message longer than 1,000 characters with 400 before it can reach the model', async () => {
        const response = await message({ message: 'a'.repeat(5000) })
        expect(response.status).toBe(400)
    })

    it('accepts a message of exactly 1,000 characters', async () => {
        const response = await message({ message: 'a'.repeat(1000) })
        expect(response.status).not.toBe(400)
    })

    it('caps the init and end endpoints too', async () => {
        for (let i = 0; i < RATE_LIMITS.chatbot.max; i += 1) await api().post('/api/chatbot/init').send({})
        expect((await api().post('/api/chatbot/init').send({})).status).toBe(429)
    })
})

describe('SEC-011 — guest checkout allows 3 orders per hour', () => {
    it('the 4th guest order is 429 and writes nothing', async () => {
        const product = await seedProduct({ inventory: { Black: 50 } })
        const place = () => api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })

        for (let i = 0; i < RATE_LIMITS.guestOrder.max; i += 1) {
            expect((await place()).status).not.toBe(429)
        }

        const blocked = await place()
        expect(blocked.status).toBe(429)
        expect(await orderModel.countDocuments({})).toBe(RATE_LIMITS.guestOrder.max)
    })

    it('does not throttle the authenticated order route on the guest policy', async () => {
        const { seedCustomer } = await import('../helpers/api.js')
        const product = await seedProduct({ inventory: { Black: 50 } })
        const { token } = await seedCustomer()

        for (let i = 0; i < RATE_LIMITS.guestOrder.max + 1; i += 1) {
            const response = await api().post('/api/order/place').set('token', token).send({
                items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
                address: validAddress,
            })
            expect(response.status).not.toBe(429)
        }
    })
})

describe('SEC-005 — a global policy of 100 requests per minute', () => {
    it('the 101st request in a window is 429', async () => {
        for (let i = 0; i < RATE_LIMITS.global.max; i += 1) {
            expect((await api().get('/api/product/list')).status).not.toBe(429)
        }
        expect((await api().get('/api/product/list')).status).toBe(429)
    })

    it('a 429 body is the same shape as any other failure and leaks nothing', async () => {
        for (let i = 0; i <= RATE_LIMITS.auth.max; i += 1) await login()
        const blocked = await login()

        expect(blocked.body).toMatchObject({ success: false })
        expect(typeof blocked.body.message).toBe('string')
        expect(blocked.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
        expect(JSON.stringify(blocked.body)).not.toMatch(/at Object\.|node_modules|\/home\//)
    })
})
