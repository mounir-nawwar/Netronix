// PHASE 0–2 PRE-COMMIT — the idempotency fingerprint must see the whole request.
//
// `requestFingerprint` reduced each line to
// `String(item.variantId ?? item.variantKey ?? item.size ?? '')`. A client that
// sends the **lossless** form — `variantOptions: { Colour: 'Black' }`, which is
// the form the redeployed storefront sends and the one the validator prefers —
// has none of those three fields, so every line fingerprinted to the empty
// string.
//
// The consequence is not a missed conflict, it is a wrong order: two checkout
// attempts under one key for two *different* combinations of the same product
// have identical fingerprints, so the second is treated as a retry of the first
// and the customer who ordered White is handed the order for Black.
//
// The fix canonicalises the options. `canonicalVariantId` is injective and
// order-independent, so naming the axes in a different order is still the same
// request, and naming a different combination is not.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'
import { requestFingerprint } from '../../services/idempotency.js'

useTestDatabase()

const KEY = 'checkout-attempt-0001'

const variantProduct = () => seedProduct({
    variants: [{ name: 'Colour', options: ['Black', 'White'] }, { name: 'Size', options: ['S', 'L'] }],
    inventory: { 'Black-S': 5, 'Black-L': 5, 'White-S': 5, 'White-L': 5 },
})

const order = (token, body, headers = {}) => {
    const request = api().post('/api/order/place').set('token', token)
    for (const [name, value] of Object.entries(headers)) request.set(name, value)
    return request.send({ paymentMethod: 'COD', address: validAddress, ...body })
}

const line = (product, options, quantity = 1) => ({
    items: [{ productId: String(product._id), variantOptions: options, quantity }],
})

describe('the fingerprint distinguishes variant option combinations', () => {
    it('is different for two different combinations of the same product', () => {
        const a = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 }],
            address: validAddress,
        })
        const b = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: { Colour: 'White' }, quantity: 1 }],
            address: validAddress,
        })
        expect(a).not.toBe(b)
    })

    it('is the same when the axes are named in a different order', () => {
        const a = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: { Colour: 'Black', Size: 'L' }, quantity: 1 }],
            address: validAddress,
        })
        const b = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: { Size: 'L', Colour: 'Black' }, quantity: 1 }],
            address: validAddress,
        })
        expect(a).toBe(b)
    })

    it('is the same when the cart lines are in a different order', () => {
        const items = [
            { productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 },
            { productId: 'p2', variantOptions: { Colour: 'White' }, quantity: 2 },
        ]
        expect(requestFingerprint({ items, address: validAddress }))
            .toBe(requestFingerprint({ items: [...items].reverse(), address: validAddress }))
    })

    it('reads a Map, which is how the option pairs come back off a document', () => {
        const asObject = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 }],
            address: validAddress,
        })
        const asMap = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: new Map([['Colour', 'Black']]), quantity: 1 }],
            address: validAddress,
        })
        expect(asMap).toBe(asObject)
    })

    it('still distinguishes the legacy key forms it always did', () => {
        const bySize = requestFingerprint({ items: [{ productId: 'p1', size: 'Black', quantity: 1 }], address: {} })
        const byOther = requestFingerprint({ items: [{ productId: 'p1', size: 'White', quantity: 1 }], address: {} })
        expect(bySize).not.toBe(byOther)
    })

    it('never confuses a legacy key with a canonical identity', () => {
        // A canonical identity always contains "=", which the legacy key
        // pattern does not permit, so the two namespaces cannot collide.
        const canonical = requestFingerprint({
            items: [{ productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 }], address: {},
        })
        const legacy = requestFingerprint({
            items: [{ productId: 'p1', size: 'Black', quantity: 1 }], address: {},
        })
        expect(canonical).not.toBe(legacy)
    })
})

describe('one key, two different combinations', () => {
    it('is a conflict, not a replay of the wrong order', async () => {
        const product = await variantProduct()
        const { token } = await seedCustomer()

        const black = await order(token, line(product, { Colour: 'Black', Size: 'S' }), { 'Idempotency-Key': KEY })
        expect(black.status, JSON.stringify(black.body)).toBe(201)

        const white = await order(token, line(product, { Colour: 'White', Size: 'S' }), { 'Idempotency-Key': KEY })

        expect(white.status).toBe(409)
        expect(await orderModel.countDocuments({})).toBe(1)

        // And the customer was not handed the other combination's order.
        expect(white.body.order).toBeUndefined()

        const after = await productModel.findById(product._id).lean()
        const stock = Object.fromEntries(after.inventoryV2.map((e) => [e.variantId, e.quantity]))
        expect(stock['Colour=Black;Size=S']).toBe(4)
        expect(stock['Colour=White;Size=S']).toBe(5)
    })

    it('a genuine retry of the same attempt still replays exactly once', async () => {
        const product = await variantProduct()
        const { token } = await seedCustomer()

        const first = await order(token, line(product, { Colour: 'Black', Size: 'L' }), { 'Idempotency-Key': KEY })
        const retry = await order(token, line(product, { Colour: 'Black', Size: 'L' }), { 'Idempotency-Key': KEY })

        expect(first.status).toBe(201)
        expect(first.body.replayed).toBe(false)
        expect(retry.body.replayed).toBe(true)
        expect(retry.body.order._id).toBe(first.body.order._id)
        expect(await orderModel.countDocuments({})).toBe(1)

        const after = await productModel.findById(product._id).lean()
        const stock = Object.fromEntries(after.inventoryV2.map((e) => [e.variantId, e.quantity]))
        expect(stock['Colour=Black;Size=L']).toBe(4)
    })

    it('a retry that names the axes in a different order is still the same attempt', async () => {
        const product = await variantProduct()
        const { token } = await seedCustomer()

        await order(token, line(product, { Colour: 'Black', Size: 'L' }), { 'Idempotency-Key': KEY })
        const retry = await order(token, line(product, { Size: 'L', Colour: 'Black' }), { 'Idempotency-Key': KEY })

        expect(retry.status).toBe(201)
        expect(retry.body.replayed).toBe(true)
        expect(await orderModel.countDocuments({})).toBe(1)
    })

    it('a new attempt under a new key is a second order', async () => {
        const product = await variantProduct()
        const { token } = await seedCustomer()

        await order(token, line(product, { Colour: 'Black', Size: 'S' }), { 'Idempotency-Key': KEY })
        const second = await order(token, line(product, { Colour: 'White', Size: 'S' }), { 'Idempotency-Key': 'checkout-attempt-0002' })

        expect(second.status).toBe(201)
        expect(second.body.replayed).toBe(false)
        expect(await orderModel.countDocuments({})).toBe(2)
    })
})
