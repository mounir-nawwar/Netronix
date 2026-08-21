// PHASE 0–2 PRE-COMMIT — order status transitions (DB-008, SEC-017).
//
// Two confirmed blockers, one cause and one fix.
//
// **The race.** `updateStatus` was `findById` → `assertTransition` → mutate →
// `order.save()`. Two administrators opening the same order both read
// "Order Placed", both pass the transition check against that stale value, and
// both save: the second overwrites the first's status *and* the history entry
// the first appended. The audit trail loses an event that really happened,
// which is the one thing an audit trail must not do.
//
// **The legacy order.** `save()` validates the whole document. A pre-Phase-2
// line is `{ productId, size, quantity }` and the tightened `orderItemSchema`
// requires `name`, `unitPrice`, `unitPriceMinor`, `lineTotal` and
// `lineTotalMinor`. So an order placed before migration 002 could be *read*
// through the compatibility path but could not be moved from "Packing" to
// "Shipped" — a status change failed on five fields it never touched.
//
// Both are fixed by making the transition a single compare-and-set on the
// status that was read, expressed as one `$set` + `$push`.

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedProduct, seedCustomer, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import { applyStatusTransition } from '../../services/orderStatus.js'

useTestDatabase()

const ordersCollection = () => mongoose.connection.db.collection('orders')

/** Place a real order through the API and return its document. */
async function placeOrder() {
    const product = await seedProduct({ inventory: { '': 25 } })
    const { token } = await seedCustomer()
    const response = await api().post('/api/order/place').set('token', token).send({
        items: [{ productId: String(product._id), size: '', quantity: 1 }],
        address: validAddress,
        paymentMethod: 'COD',
    })
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    return orderModel.findById(response.body.order._id).lean()
}

/**
 * An order in its pre-Phase-2 shape, written through the driver so the tightened
 * schema cannot quietly repair it on the way in. This is what a database that
 * has not run migration 002 actually holds.
 */
async function insertLegacyOrder(overrides = {}) {
    const _id = new mongoose.Types.ObjectId()
    await ordersCollection().insertOne({
        _id,
        orderNumber: 1042,
        userId: String(new mongoose.Types.ObjectId()),
        // No name, no unitPrice, no unitPriceMinor, no lineTotal — the whole
        // point of the fixture.
        items: [{ productId: String(new mongoose.Types.ObjectId()), size: 'M', quantity: 2 }],
        amount: 103,
        address: validAddress,
        status: 'Packing',
        statusHistory: [{ status: 'Order Placed', at: new Date('2026-01-01'), by: 'migration' }],
        paymentMethod: 'COD',
        payment: false,
        date: new Date('2026-01-01'),
        ...overrides,
    })
    return _id
}

describe('the transition is a compare-and-set on the status that was read', () => {
    it('applies when the order is still in the expected state', async () => {
        const order = await placeOrder()

        const { matched } = await applyStatusTransition({
            orderId: order._id, from: 'Order Placed', to: 'Packing', by: 'admin:a',
        })

        expect(matched).toBe(true)
        const after = await orderModel.findById(order._id).lean()
        expect(after.status).toBe('Packing')
        expect(after.statusHistory).toHaveLength(2)
    })

    it('refuses when the order has moved on since it was read', async () => {
        const order = await placeOrder()

        // Administrator A wins.
        const first = await applyStatusTransition({
            orderId: order._id, from: 'Order Placed', to: 'Packing', by: 'admin:a',
        })
        expect(first.matched).toBe(true)

        // Administrator B is acting on the state they read a moment earlier.
        // Under read-modify-save this succeeded and erased A's history entry.
        const second = await applyStatusTransition({
            orderId: order._id, from: 'Order Placed', to: 'Shipped', by: 'admin:b',
        })

        expect(second.matched).toBe(false)

        const after = await orderModel.findById(order._id).lean()
        expect(after.status).toBe('Packing')
        expect(after.statusHistory).toHaveLength(2)
        expect(after.statusHistory.at(-1)).toMatchObject({ status: 'Packing', by: 'admin:a' })
    })

    it('appends exactly one event and never rewrites the ones before it', async () => {
        const order = await placeOrder()

        await applyStatusTransition({ orderId: order._id, from: 'Order Placed', to: 'Packing', by: 'admin:a' })
        await applyStatusTransition({ orderId: order._id, from: 'Packing', to: 'Shipped', by: 'admin:b' })

        const after = await orderModel.findById(order._id).lean()
        expect(after.statusHistory.map((event) => event.status))
            .toEqual(['Order Placed', 'Packing', 'Shipped'])
        expect(after.statusHistory.map((event) => event.by))
            .toEqual(['user:' + String(after.userId), 'admin:a', 'admin:b'])
    })

    it('refuses a status that is not in the enum, without writing', async () => {
        const order = await placeOrder()
        await expect(applyStatusTransition({
            orderId: order._id, from: 'Order Placed', to: 'Teleported', by: 'admin:a',
        })).rejects.toThrow(/not a known order status/i)

        const after = await orderModel.findById(order._id).lean()
        expect(after.status).toBe('Order Placed')
        expect(after.statusHistory).toHaveLength(1)
    })
})

describe('two administrators transitioning the same order', () => {
    it('lets exactly one of them win and keeps every event that happened', async () => {
        const order = await placeOrder()
        const { token } = await seedAdmin()

        const both = await Promise.all([
            api().post('/api/order/status').set('token', token)
                .send({ orderId: String(order._id), status: 'Packing' }),
            api().post('/api/order/status').set('token', token)
                .send({ orderId: String(order._id), status: 'Shipped' }),
        ])

        const accepted = both.filter((response) => response.status === 200)
        const rejected = both.filter((response) => response.status === 409)

        // Whether the two requests interleave is up to the scheduler. What must
        // hold either way is that nothing is lost: every accepted transition is
        // in the history exactly once, and a rejected one wrote nothing.
        expect(accepted.length + rejected.length).toBe(2)
        expect(accepted.length).toBeGreaterThanOrEqual(1)

        const after = await orderModel.findById(order._id).lean()
        expect(after.statusHistory).toHaveLength(1 + accepted.length)
        expect(after.status).toBe(after.statusHistory.at(-1).status)

        for (const response of rejected) {
            expect(response.body.success).toBe(false)
        }
    })

    it('reports the state it actually found when it refuses', async () => {
        const order = await placeOrder()
        const { token } = await seedAdmin()

        await api().post('/api/order/status').set('token', token)
            .send({ orderId: String(order._id), status: 'Delivered' }).expect(200)

        const late = await api().post('/api/order/status').set('token', token)
            .send({ orderId: String(order._id), status: 'Shipped' })

        expect(late.status).toBe(409)
        expect(late.body.message).toMatch(/delivered/i)
    })
})

describe('an order placed before the snapshot migration', () => {
    it('can still have its status advanced', async () => {
        const orderId = await insertLegacyOrder()
        const { token } = await seedAdmin()

        const response = await api().post('/api/order/status').set('token', token)
            .send({ orderId: String(orderId), status: 'Shipped' })

        expect(response.status, JSON.stringify(response.body)).toBe(200)

        const after = await ordersCollection().findOne({ _id: orderId })
        expect(after.status).toBe('Shipped')
        expect(after.statusHistory).toHaveLength(2)
        expect(after.statusHistory.at(-1)).toMatchObject({ status: 'Shipped' })
    })

    it('leaves its legacy lines exactly as they were', async () => {
        const orderId = await insertLegacyOrder()
        const before = await ordersCollection().findOne({ _id: orderId })
        const { token } = await seedAdmin()

        await api().post('/api/order/status').set('token', token)
            .send({ orderId: String(orderId), status: 'Shipped' }).expect(200)

        const after = await ordersCollection().findOne({ _id: orderId })
        // No repair, no backfill, no invented price: a status change changes
        // the status.
        expect(after.items).toEqual(before.items)
        expect(after.amount).toBe(before.amount)
        expect(after).not.toHaveProperty('items.0.unitPriceMinor')
    })

    it('still refuses a transition the fulfilment sequence disallows', async () => {
        const orderId = await insertLegacyOrder({ status: 'Delivered' })
        const { token } = await seedAdmin()

        const response = await api().post('/api/order/status').set('token', token)
            .send({ orderId: String(orderId), status: 'Packing' })

        expect(response.status).toBe(409)
        const after = await ordersCollection().findOne({ _id: orderId })
        expect(after.status).toBe('Delivered')
    })
})
