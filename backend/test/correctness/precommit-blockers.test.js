import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'

import m002 from '../../migrations/002_order_snapshots.js'
import { requestFingerprint } from '../../services/idempotency.js'
import { TOKEN_AUDIENCE, TOKEN_ISSUER, verifyToken } from '../../services/tokenService.js'

function migrationDb({ product = null } = {}) {
    const events = []
    const order = { _id: 'order-1', items: [{ productId: 'missing', size: '', quantity: 1 }] }
    const orders = {
        find: () => ({ async *[Symbol.asyncIterator]() { yield order } }),
        updateOne: vi.fn(async () => { events.push('mutation') }),
    }
    const products = { findOne: vi.fn(async () => product) }
    return { events, db: { collection: (name) => name === 'orders' ? orders : products }, orders }
}

describe('002 durable reporting', () => {
    it('awaits an unresolvable-line report before mutating the order', async () => {
        const { events, db, orders } = migrationDb()
        let release
        const report = vi.fn(() => new Promise((resolve) => { release = () => { events.push('reported'); resolve() } }))
        const running = m002.up({ db, report, log: () => {} })
        await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
        expect(orders.updateOne).not.toHaveBeenCalled()
        release()
        await running
        expect(events).toEqual(['reported', 'mutation'])
    })

    it('does not mutate when a durable report rejects', async () => {
        const { db, orders } = migrationDb()
        await expect(m002.up({ db, report: () => Promise.reject(new Error('journal unavailable')), log: () => {} }))
            .rejects.toThrow('journal unavailable')
        expect(orders.updateOne).not.toHaveBeenCalled()
    })
})

describe('idempotency canonical line ordering', () => {
    it('fingerprints reordered duplicate identities identically', () => {
        const items = [
            { productId: 'p', variantKey: 'same', quantity: 1 },
            { productId: 'p', variantKey: 'same', quantity: 2 },
            { productId: 'q', variantKey: '', quantity: 1 },
        ]
        expect(requestFingerprint({ items, address: {} }))
            .toBe(requestFingerprint({ items: [items[2], items[1], items[0]], address: {} }))
    })

    it('fingerprints split and combined equivalent lines identically', () => {
        expect(requestFingerprint({
            items: [
                { productId: 'p', variantKey: 'same', quantity: 1 },
                { productId: 'p', variantKey: 'same', quantity: 2 },
            ],
            address: {},
        })).toBe(requestFingerprint({
            items: [{ productId: 'p', variantKey: 'same', quantity: 3 }],
            address: {},
        }))
    })
})

describe('token version claim validation', () => {
    const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '1h', issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE,
    })

    it.each([
        ['absent', { sub: 'user-1', role: 'customer' }],
        ['string', { sub: 'user-1', role: 'customer', v: '0' }],
        ['fractional', { sub: 'user-1', role: 'customer', v: 0.5 }],
        ['negative', { sub: 'user-1', role: 'customer', v: -1 }],
    ])('rejects a %s tokenVersion claim', (_label, payload) => {
        expect(() => verifyToken(sign(payload))).toThrow(/sign in again/i)
    })
})
