// GATE 2 — the data-integrity invariants, asserted one at a time.
//
// The target-state file carries the assertions Phase 0 wrote in advance. This
// file carries the rest of Gate 2: the parts of each criterion that the Phase 0
// text stated in prose rather than in code — that a rollback releases the
// *counter* and the *cart* as well as the stock, that an idempotency key is
// scoped so one caller cannot be handed another's order, that archiving hides a
// product without orphaning history, that a status cannot go backwards, and that
// listing orders issues no query per line.
//
// Findings: DB-001, DB-002, DB-003, DB-004, DB-005, DB-006, DB-007, DB-008,
//           DB-009, DB-011, DB-012, BE-002, BE-004, BE-009, BE-010, ADM-003.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedProduct, seedCustomer, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'
import userModel from '../../models/userModel.js'
import counterModel, { ORDER_NUMBER_SEQUENCE, peekSequenceValue } from '../../models/counterModel.js'
import { TRANSITIONS, FULFILMENT_SEQUENCE, TERMINAL_STATUSES } from '../../services/orderStatus.js'
import { ORDER_STATUSES } from '../../models/orderModel.js'

useTestDatabase()

const guestOrder = (body, headers = {}) => {
    const request = api().post('/api/order/guest/place')
    for (const [name, value] of Object.entries(headers)) request.set(name, value)
    return request.send(body)
}
const userOrder = (token, body, headers = {}) => {
    const request = api().post('/api/order/place').set('token', token)
    for (const [name, value] of Object.entries(headers)) request.set(name, value)
    return request.send(body)
}

/** Count the operations Mongoose issues, per collection. */
function countQueries() {
    const counts = {}
    mongoose.set('debug', (collection, method) => {
        counts[collection] ??= []
        counts[collection].push(method)
    })
    return {
        stop() {
            mongoose.set('debug', false)
            return counts
        },
    }
}

afterEach(() => { mongoose.set('debug', false) })

// ---------------------------------------------------------------------------
describe('GATE 2 #2 — a failed order rolls back everything, not just the stock', () => {
    it('releases the counter, the cart and the order together with the inventory', async () => {
        const plentiful = await seedProduct({ price: 100, inventory: { Black: 10 } })
        const scarce = await seedProduct({ price: 100, inventory: { Black: 1 } })
        const { token, user } = await seedCustomer({
            cartData: { [String(plentiful._id)]: { Black: 1 } },
        })

        // Warm the counter so there is a value to observe, then record it.
        await userOrder(token, {
            items: [{ productId: String(plentiful._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })
        const counterBefore = await peekSequenceValue(ORDER_NUMBER_SEQUENCE)
        const ordersBefore = await orderModel.countDocuments({})
        await userModel.findByIdAndUpdate(user._id, { cartData: { [String(plentiful._id)]: { Black: 4 } } })

        // The second line cannot be satisfied. The first already reserved.
        const response = await userOrder(token, {
            items: [
                { productId: String(plentiful._id), size: 'Black', quantity: 4 },
                { productId: String(scarce._id), size: 'Black', quantity: 99 },
            ],
            address: validAddress,
        })

        expect(response.status).toBe(409)

        // 1. inventory — both representations, both untouched
        const plentifulAfter = await productModel.findById(plentiful._id)
        expect(plentifulAfter.inventory.Black).toBe(9) // 10 - the successful order above
        expect(plentifulAfter.inventoryV2.find((e) => e.legacyKey === 'Black').quantity).toBe(9)
        expect((await productModel.findById(scarce._id)).inventory.Black).toBe(1)

        // 2. no order was inserted
        expect(await orderModel.countDocuments({})).toBe(ordersBefore)

        // 3. the counter did not move — the allocation was inside the transaction
        expect(await peekSequenceValue(ORDER_NUMBER_SEQUENCE)).toBe(counterBefore)

        // 4. the cart was not cleared
        const stored = await userModel.findById(user._id).lean()
        expect(stored.cartData).toEqual({ [String(plentiful._id)]: { Black: 4 } })
    })

    it('commits exactly once when the order succeeds', async () => {
        const product = await seedProduct({ price: 100, inventory: { Black: 5 } })
        const { token, user } = await seedCustomer({ cartData: { x: { y: 1 } } })

        const response = await userOrder(token, {
            items: [{ productId: String(product._id), size: 'Black', quantity: 2 }],
            address: validAddress,
        })

        expect(response.status).toBe(201)
        expect(await orderModel.countDocuments({})).toBe(1)
        expect((await productModel.findById(product._id)).inventory.Black).toBe(3)
        expect((await userModel.findById(user._id).lean()).cartData).toEqual({})
        expect(await peekSequenceValue(ORDER_NUMBER_SEQUENCE)).toBe(1000)
    })
})

// ---------------------------------------------------------------------------
describe('GATE 2 #5 — idempotency keys (DB-012, SEC-011 remainder)', () => {
    const KEY = 'idem-key-0001'

    const payload = (product) => ({
        items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
        address: validAddress,
    })

    it('a sequential replay returns the original order and decrements stock once', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        const first = await userOrder(token, payload(product), { 'Idempotency-Key': KEY })
        const second = await userOrder(token, payload(product), { 'Idempotency-Key': KEY })

        expect(first.status).toBe(201)
        expect(second.body.order._id).toBe(first.body.order._id)
        expect(second.body.replayed).toBe(true)
        expect(first.body.replayed).toBe(false)
        expect(await orderModel.countDocuments({})).toBe(1)
        expect((await productModel.findById(product._id)).inventory.Black).toBe(4)
    })

    it('a concurrent replay creates exactly one order and decrements once', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        const results = await Promise.allSettled(
            Array.from({ length: 6 }, () => userOrder(token, payload(product), { 'Idempotency-Key': KEY })),
        )

        const bodies = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.body)
        const ids = new Set(bodies.filter((body) => body.order).map((body) => body.order._id))

        expect(await orderModel.countDocuments({})).toBe(1)
        expect(ids.size).toBe(1)
        expect((await productModel.findById(product._id)).inventory.Black).toBe(4)
    })

    it('the same key with a different request is a 409, not a silent success', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        await userOrder(token, payload(product), { 'Idempotency-Key': KEY })
        const conflicting = await userOrder(token, {
            ...payload(product),
            items: [{ productId: String(product._id), size: 'Black', quantity: 3 }],
        }, { 'Idempotency-Key': KEY })

        expect(conflicting.status).toBe(409)
        expect(await orderModel.countDocuments({})).toBe(1)
    })

    it('a different address with the same key is also a conflict', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        await userOrder(token, payload(product), { 'Idempotency-Key': KEY })
        const elsewhere = await userOrder(token, {
            ...payload(product),
            address: { ...validAddress, street: 'Somewhere else entirely' },
        }, { 'Idempotency-Key': KEY })

        expect(elsewhere.status).toBe(409)
    })

    it('one customer\'s key never returns another customer\'s order', async () => {
        // The scope is the principal, not the key. Without it, `abc-123` from
        // two unrelated callers would hand the second one the first one's
        // order — delivery address included.
        const product = await seedProduct({ inventory: { Black: 5 } })
        const alice = await seedCustomer()
        const bob = await seedCustomer()

        const hers = await userOrder(alice.token, payload(product), { 'Idempotency-Key': KEY })
        const his = await userOrder(bob.token, payload(product), { 'Idempotency-Key': KEY })

        expect(his.status).toBe(201)
        expect(his.body.order._id).not.toBe(hers.body.order._id)
        expect(his.body.replayed).toBe(false)
        expect(await orderModel.countDocuments({})).toBe(2)
    })

    it('a guest key and a customer key with the same value do not collide', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        const guest = await guestOrder(payload(product), { 'Idempotency-Key': KEY })
        const customer = await userOrder(token, payload(product), { 'Idempotency-Key': KEY })

        expect(guest.status).toBe(201)
        expect(customer.status).toBe(201)
        expect(customer.body.order._id).not.toBe(guest.body.order._id)
    })

    it('stores a one-way scope that reveals nothing about the caller or the address', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { body } = await guestOrder(payload(product), { 'Idempotency-Key': KEY })

        const stored = await orderModel.findById(body.order._id).lean()
        expect(stored.idempotencyScope).toMatch(/^guest:[0-9a-f]{64}$/)
        // Nothing from the delivery address is recoverable from the scope, and
        // no client-supplied price is part of the fingerprint.
        const scopeAndPrint = stored.idempotencyScope + stored.idempotencyFingerprint
        for (const value of [validAddress.street, validAddress.email, validAddress.phone]) {
            expect(scopeAndPrint).not.toContain(value)
        }
        expect(stored.idempotencyFingerprint).toMatch(/^[0-9a-f]{64}$/)
    })

    it.each([
        ['too short', 'ab'],
        ['too long', 'k'.repeat(201)],
        ['illegal characters', 'key with spaces'],
        ['a dollar sign', 'key$ne'],
        ['a slash', 'key/with/slash'],
    ])('refuses a malformed key (%s) with 400 and writes nothing', async (_label, key) => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        const response = await userOrder(token, payload(product), { 'Idempotency-Key': key })

        expect(response.status).toBe(400)
        expect(await orderModel.countDocuments({})).toBe(0)
        expect((await productModel.findById(product._id)).inventory.Black).toBe(5)
    })

    it('accepts the shapes real clients actually generate', async () => {
        // A UUID, a dotted prefix and a colon-scoped key are all normal, so the
        // allowlist admits `-`, `.`, `_`, `:` and `@`. The bound that matters is
        // the ceiling, which is what keeps an unbounded header out of an index.
        const product = await seedProduct({ inventory: { Black: 20 } })
        const { token } = await seedCustomer()

        for (const key of [
            '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
            'checkout.attempt.1',
            'netronix:order:42',
            'user@example.test',
        ]) {
            const response = await userOrder(token, payload(product), { 'Idempotency-Key': key })
            expect(response.status, key).toBe(201)
        }
        expect(await orderModel.countDocuments({})).toBe(4)
    })

    it('an absent key is still legal, and is documented as such', async () => {
        // The deployed storefront does not send one. Making the header
        // mandatory would break every cached bundle, so an order without a key
        // behaves exactly as it did — and is excluded from the unique index by
        // its partial filter, so two of them do not collide.
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        const first = await userOrder(token, payload(product))
        const second = await userOrder(token, payload(product))

        expect(first.status).toBe(201)
        expect(second.status).toBe(201)
        expect(await orderModel.countDocuments({})).toBe(2)
    })
})

// ---------------------------------------------------------------------------
describe('GATE 2 #9 — refs, archive, transitions, typed schemas (DB-007, DB-008, DB-009, ADM-003)', () => {
    it('archiving hides a product from every catalog surface but keeps history', async () => {
        const product = await seedProduct({ tags: ['Laptops'], bestSeller: true, inventory: { Black: 5 } })
        const { token: adminToken } = await seedAdmin()
        const { token } = await seedCustomer()

        await userOrder(token, {
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })

        const archived = await api().post('/api/product/archive').set('token', adminToken)
            .send({ id: String(product._id) })
        expect(archived.status).toBe(200)

        expect((await api().get('/api/product/list')).body.products).toHaveLength(0)
        expect((await api().get('/api/product/tags/Laptops')).body.products).toHaveLength(0)
        expect((await api().get('/api/product/best-sellers')).body.products).toHaveLength(0)
        expect((await api().get('/api/product/tags')).body.tags).toEqual([])

        // The order still knows what was bought, because it carries a snapshot.
        const history = await api().post('/api/order/userorders').set('token', token).send({})
        expect(history.body.orders[0].items[0].name).toBe(product.name)
        expect(history.body.orders[0].items[0].unitPriceMinor).toBe(10000)

        // And it cannot be bought again.
        const blocked = await userOrder(token, {
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })
        expect(blocked.status).toBe(409)
    })

    it('requires an authenticated admin to retrieve or enumerate archived products', async () => {
        const product = await seedProduct({ tags: ['Laptops'], bestSeller: true })
        const { token: adminToken } = await seedAdmin()
        const { token: customerToken } = await seedCustomer()

        await api().post('/api/product/archive').set('token', adminToken).send({ id: String(product._id) })

        for (const path of [
            '/api/product/list?includeArchived=true',
            '/api/product/tags/Laptops?includeArchived=true',
            '/api/product/tags?includeArchived=true',
            '/api/product/best-sellers?includeArchived=true',
        ]) {
            expect((await api().get(path)).status, path).toBe(401)
            expect((await api().get(path).set('token', customerToken)).status, path).toBe(403)
        }

        const publicSingle = await api().post('/api/product/single').send({ productId: String(product._id) })
        expect(publicSingle.body).toEqual({ success: true, product: null })

        const publicInventory = await api().post('/api/product/check-inventory')
            .send({ productId: String(product._id) })
        expect(publicInventory.status).toBe(404)

        const adminList = await api().get('/api/product/list?includeArchived=true').set('token', adminToken)
        expect(adminList.body.products).toHaveLength(1)
        expect(adminList.body.products[0].archived).toBe(true)

        const adminSingle = await api().post('/api/product/single').set('token', adminToken)
            .send({ productId: String(product._id) })
        expect(adminSingle.body.product).toMatchObject({ _id: String(product._id), archived: true })

        const restored = await api().post('/api/product/restore').set('token', adminToken)
            .send({ id: String(product._id) })
        expect(restored.status).toBe(200)
        expect((await api().get('/api/product/list')).body.products).toHaveLength(1)
        expect((await productModel.findById(product._id)).archived).toBe(false)
    })

    it('refuses a hard delete while an order references the product', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()
        const { token: adminToken } = await seedAdmin()

        await userOrder(token, {
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })

        const response = await api().post('/api/product/remove').set('token', adminToken)
            .send({ id: String(product._id) })

        expect(response.status).toBe(409)
        expect(response.body.message).toMatch(/archive/i)
        expect(await productModel.findById(product._id)).not.toBeNull()
    })

    it('a permitted hard delete prunes the references that would have dangled', async () => {
        const product = await seedProduct()
        const { token: adminToken } = await seedAdmin()
        const { user } = await seedCustomer({
            wishlist: [product._id],
            cartData: { [String(product._id)]: { '': 2 } },
        })

        const response = await api().post('/api/product/remove').set('token', adminToken)
            .send({ id: String(product._id) })
        expect(response.status).toBe(200)

        const stored = await userModel.findById(user._id).lean()
        expect(stored.wishlist).toEqual([])
        expect(stored.cartData).toEqual({})
    })

    it('order and wishlist references are real ObjectIds that populate', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token, user } = await seedCustomer()

        await userOrder(token, {
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })
        await api().post('/api/user/wishlist/add').set('token', token).send({ productId: String(product._id) })

        const order = await orderModel.findOne({ userId: user._id }).populate('items.productId')
        expect(order.items[0].productId.name).toBe(product.name)
        expect(order.userId).toBeInstanceOf(mongoose.Types.ObjectId)

        const stored = await userModel.findById(user._id).populate('wishlist')
        expect(stored.wishlist[0].name).toBe(product.name)
    })

    it('the wishlist adds and removes by id, which a string array could not do', async () => {
        const product = await seedProduct()
        const { token } = await seedCustomer()

        await api().post('/api/user/wishlist/add').set('token', token).send({ productId: String(product._id) })
        await api().post('/api/user/wishlist/add').set('token', token).send({ productId: String(product._id) })
        let listed = await api().post('/api/user/wishlist/get').set('token', token).send({})
        expect(listed.body.wishlist).toHaveLength(1)

        await api().post('/api/user/wishlist/remove').set('token', token).send({ productId: String(product._id) })
        listed = await api().post('/api/user/wishlist/get').set('token', token).send({})
        expect(listed.body.wishlist).toEqual([])
    })

    it('the status transition table is complete, forward-only, and terminal where it should be', async () => {
        // Asserted as a whole rather than by sample, so a status added later
        // cannot quietly acquire no rule at all.
        expect(Object.keys(TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort())
        for (const status of TERMINAL_STATUSES) expect(TRANSITIONS[status]).toEqual([])

        for (const [index, status] of FULFILMENT_SEQUENCE.entries()) {
            if (TERMINAL_STATUSES.includes(status)) continue
            expect(TRANSITIONS[status]).toEqual([...FULFILMENT_SEQUENCE.slice(index + 1), 'Cancelled'])
            // Nothing goes backwards.
            for (const earlier of FULFILMENT_SEQUENCE.slice(0, index + 1)) {
                expect(TRANSITIONS[status]).not.toContain(earlier)
            }
        }
    })

    it('records the actor and the time on an accepted transition', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }], address: validAddress,
        })
        const admin = await seedAdmin()

        const before = Date.now()
        await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: 'Packing' })
        await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: 'Shipped' })

        const stored = await orderModel.findById(body.order._id).lean()
        expect(stored.statusHistory.map((event) => event.status))
            .toEqual(['Order Placed', 'Packing', 'Shipped'])
        expect(stored.statusHistory[2].by).toBe(`admin:${String(admin.user._id)}`)
        expect(new Date(stored.statusHistory[2].at).getTime()).toBeGreaterThanOrEqual(before)
    })

    it.each([
        ['Delivered', 'Shipped'],
        ['Delivered', 'Order Placed'],
        ['Cancelled', 'Packing'],
    ])('refuses %s → %s with 409 and leaves the status and history unchanged', async (from, to) => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }], address: validAddress,
        })
        const admin = await seedAdmin()

        await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: from })
        const historyBefore = (await orderModel.findById(body.order._id).lean()).statusHistory

        const response = await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: to })

        expect(response.status).toBe(409)
        const after = await orderModel.findById(body.order._id).lean()
        expect(after.status).toBe(from)
        expect(after.statusHistory).toHaveLength(historyBefore.length)
    })

    it('cancellation is reachable from every non-terminal stage', async () => {
        for (const status of FULFILMENT_SEQUENCE) {
            if (TERMINAL_STATUSES.includes(status)) continue
            expect(TRANSITIONS[status]).toContain('Cancelled')
        }
    })

    it('the schema itself refuses negative stock and malformed nested data (DB-009)', async () => {
        const product = await seedProduct({ inventory: { Black: 1 } })

        product.inventoryV2[0].quantity = -1
        await expect(product.save()).rejects.toThrow(/quantity/)

        // A typed order line: `name` and the money fields are not optional.
        await expect(orderModel.create([{
            orderNumber: 9999,
            items: [{ productId: product._id, quantity: 1 }],
            amount: 1,
            address: validAddress,
            paymentMethod: 'COD',
        }])).rejects.toThrow()

        // A status outside the enum cannot be persisted even by a direct write.
        await expect(orderModel.create([{
            orderNumber: 9998,
            items: [{
                productId: product._id, name: 'x', quantity: 1,
                unitPrice: 1, unitPriceMinor: 100, lineTotal: 1, lineTotalMinor: 100,
            }],
            amount: 1,
            address: validAddress,
            paymentMethod: 'COD',
            status: 'Eaten By A Goat',
        }])).rejects.toThrow()
    })

    it('timestamps exist on all three collections (DB-009)', async () => {
        const product = await seedProduct()
        const { user } = await seedCustomer()
        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 1 }], address: validAddress,
        })

        for (const doc of [
            await productModel.findById(product._id).lean(),
            await userModel.findById(user._id).lean(),
            await orderModel.findById(body.order._id).lean(),
        ]) {
            expect(doc.createdAt).toBeInstanceOf(Date)
            expect(doc.updatedAt).toBeInstanceOf(Date)
        }
    })
})

// ---------------------------------------------------------------------------
describe('GATE 2 #8 — money is exact integer minor units with an explicit currency', () => {
    it('round-trips 19.99 as 1999 through the API and back', async () => {
        const product = await seedProduct({ price: 19.99, inventory: { Black: 5 } })

        const stored = await productModel.findById(product._id).lean()
        expect(stored.priceMinor).toBe(1999)
        expect(stored.currency).toBe('USD')
        expect(stored.price).toBe(19.99) // legacy field kept, not dropped

        const served = await api().post('/api/product/single').send({ productId: String(product._id) })
        expect(served.body.product.priceMinor).toBe(1999)
        expect(served.body.product.currency).toBe('USD')
    })

    it.each([
        [0.01, 1],
        [19.99, 1999],
        [1299.99, 129999],
        [0.1, 10],
    ])('prices %s as %s minor units', async (price, minor) => {
        const product = await seedProduct({ price, inventory: { Black: 5 } })
        expect((await productModel.findById(product._id).lean()).priceMinor).toBe(minor)
    })

    it('computes a multi-line total with no float drift', async () => {
        const a = await seedProduct({ price: 19.99, inventory: { Black: 50 } })
        const b = await seedProduct({ price: 0.1, inventory: { Black: 50 } })

        const { body } = await guestOrder({
            items: [
                { productId: String(a._id), size: 'Black', quantity: 3 },
                { productId: String(b._id), size: 'Black', quantity: 3 },
            ],
            address: validAddress,
        })

        const stored = await orderModel.findById(body.order._id).lean()
        // 3 x 1999 + 3 x 10 = 6027, exactly. Accumulated as floats this is
        // 60.269999999999996.
        expect(stored.subtotalMinor).toBe(6027)
        expect(stored.amountMinor).toBe(6327)
        expect(stored.currency).toBe('USD')
        // The legacy major-unit fields agree, and are still written.
        expect(stored.subtotal).toBe(60.27)
        expect(stored.amount).toBe(63.27)
        // The lines add up to the subtotal.
        expect(stored.items.reduce((total, item) => total + item.lineTotalMinor, 0)).toBe(6027)
    })

    it('a product with only the legacy price still prices an order (dual-read)', async () => {
        const product = await seedProduct({ price: 250, inventory: { Black: 5 } })
        // Simulate an unmigrated document: strip the minor field directly.
        await productModel.collection.updateOne(
            { _id: product._id }, { $unset: { priceMinor: '', currency: '' } },
        )

        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: 'Black', quantity: 2 }],
            address: validAddress,
        })

        expect(body.success).toBe(true)
        const stored = await orderModel.findById(body.order._id).lean()
        expect(stored.subtotalMinor).toBe(50000)
        expect(stored.items[0].unitPriceMinor).toBe(25000)
    })

    it('an order written before the migration still lists, in both representations', async () => {
        const product = await seedProduct({ price: 42, inventory: { Black: 5 } })
        const { token, user } = await seedCustomer()

        // A pre-Phase-2 order document, written past the schema.
        await orderModel.collection.insertOne({
            userId: user._id,
            orderNumber: 900,
            items: [{ productId: product._id, size: 'Black', quantity: 2 }],
            amount: 87,
            subtotal: 84,
            delivery_fee: 3,
            address: validAddress,
            status: 'Delivered',
            paymentMethod: 'COD',
            payment: true,
            date: new Date(),
            isGuestOrder: false,
        })

        const { body } = await api().post('/api/order/userorders').set('token', token).send({})
        const order = body.orders[0]

        expect(order.amountMinor).toBe(8700)
        expect(order.subtotalMinor).toBe(8400)
        // The line has no snapshot, so it is filled from the catalog — and said
        // to be a reconstruction rather than presented as a record.
        expect(order.items[0].name).toBe(product.name)
        expect(order.items[0].unitPriceMinor).toBe(4200)
        expect(order.items[0]._reconstructed).toBe(true)
    })
})

// ---------------------------------------------------------------------------
describe('GATE 2 #11 — no N+1, and the indexes exist (BE-002, DB-006, BE-010)', () => {
    it('listing 50 snapshot orders issues no product query at all', async () => {
        const product = await seedProduct({ price: 100, inventory: { Black: 200 } })
        const { token } = await seedCustomer()

        for (let i = 0; i < 50; i += 1) {
            await userOrder(token, {
                items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
                address: validAddress,
            })
        }

        const counter = countQueries()
        const { body } = await api().post('/api/order/userorders?limit=100').set('token', token).send({})
        const counts = counter.stop()

        expect(body.orders).toHaveLength(50)
        // The old code issued one `findById` per line: 50 orders, 50 queries.
        expect(counts.products ?? []).toEqual([])
        // The listing itself: one `find`, one `countDocuments`.
        expect((counts.orders ?? []).length).toBeLessThanOrEqual(2)
    })

    it('the admin listing is the same, across many orders', async () => {
        const product = await seedProduct({ price: 100, inventory: { Black: 200 } })
        const { token } = await seedCustomer()
        for (let i = 0; i < 20; i += 1) {
            await userOrder(token, {
                items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
                address: validAddress,
            })
        }
        const { token: adminToken } = await seedAdmin()

        const counter = countQueries()
        await api().post('/api/order/list').set('token', adminToken).send({})
        const counts = counter.stop()

        expect(counts.products ?? []).toEqual([])
    })

    it('every index the audit names exists', async () => {
        const orderIndexes = (await orderModel.collection.indexes()).map((index) => index.key)
        const productIndexes = (await productModel.collection.indexes()).map((index) => index.key)

        expect(orderIndexes).toContainEqual({ userId: 1, date: -1 })
        expect(orderIndexes).toContainEqual({ status: 1, date: -1 })
        expect(orderIndexes.some((key) => 'orderNumber' in key)).toBe(true)
        expect(productIndexes).toContainEqual({ tags: 1 })
        expect(productIndexes).toContainEqual({ bestSeller: 1 })
        expect(productIndexes).toContainEqual({ date: -1 })
    })

    it('the order-number index is unique, and the database enforces it', async () => {
        const orderNumberIndex = (await orderModel.collection.indexes())
            .find((index) => 'orderNumber' in index.key)
        expect(orderNumberIndex.unique).toBe(true)

        const product = await seedProduct({ inventory: { Black: 5 } })
        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }], address: validAddress,
        })
        const existing = await orderModel.findById(body.order._id).lean()

        await expect(orderModel.collection.insertOne({ ...existing, _id: undefined }))
            .rejects.toMatchObject({ code: 11000 })
    })

    it('the customer order query uses an index rather than scanning', async () => {
        const product = await seedProduct({ price: 100, inventory: { Black: 60 } })
        const { token, user } = await seedCustomer()
        for (let i = 0; i < 10; i += 1) {
            await userOrder(token, {
                items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
                address: validAddress,
            })
        }

        const explain = await orderModel.collection
            .find({ userId: user._id }).sort({ date: -1 }).explain('queryPlanner')
        expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain('IXSCAN')
    })
})

// ---------------------------------------------------------------------------
describe('GATE 2 #9 (pagination) — every list endpoint is bounded (BE-009)', () => {
    beforeEach(async () => {
        for (let i = 0; i < 30; i += 1) {
            await seedProduct({ name: `Catalog Item ${String(i).padStart(2, '0')}`, date: 1785585600000 + i })
        }
    })

    it('page 2 at limit 10 returns records 11-20 of a deterministic order', async () => {
        const all = await api().get('/api/product/list?page=1&limit=30')
        const names = all.body.products.map((product) => product.name)

        const second = await api().get('/api/product/list?page=2&limit=10')
        expect(second.body.products.map((product) => product.name)).toEqual(names.slice(10, 20))
        expect(second.body).toMatchObject({ page: 2, limit: 10, total: 30, pages: 3 })
    })

    it('is bounded, and refuses an unusable page or limit with 400', async () => {
        expect((await api().get('/api/product/list?limit=101')).status).toBe(400)
        expect((await api().get('/api/product/list?page=-1')).status).toBe(400)
        expect((await api().get('/api/product/list?limit=0')).status).toBe(400)
        expect((await api().get('/api/product/list?page=1.5')).status).toBe(400)
    })

    it('excludes archived records from every paginated catalog surface', async () => {
        const { token: adminToken } = await seedAdmin()
        const target = await productModel.findOne({ name: 'Catalog Item 00' })
        await api().post('/api/product/archive').set('token', adminToken).send({ id: String(target._id) })

        const listed = await api().get('/api/product/list?limit=100')
        expect(listed.body.total).toBe(29)
        expect(listed.body.products.map((p) => p.name)).not.toContain('Catalog Item 00')
    })

    it('paginates orders, and keeps user and admin isolated', async () => {
        const product = await seedProduct({ price: 10, inventory: { Black: 40 } })
        const alice = await seedCustomer()
        const bob = await seedCustomer()

        for (let i = 0; i < 12; i += 1) {
            await userOrder(alice.token, {
                items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
                address: validAddress,
            })
        }
        await userOrder(bob.token, {
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })

        const hers = await api().post('/api/order/userorders?page=2&limit=5').set('token', alice.token).send({})
        expect(hers.body.orders).toHaveLength(5)
        expect(hers.body).toMatchObject({ page: 2, limit: 5, total: 12, pages: 3 })

        const his = await api().post('/api/order/userorders').set('token', bob.token).send({})
        expect(his.body.total).toBe(1)

        const { token: adminToken } = await seedAdmin()
        const all = await api().post('/api/order/list?limit=100').set('token', adminToken).send({})
        expect(all.body.total).toBe(13)

        // A customer cannot reach the admin listing at all.
        expect((await api().post('/api/order/list').set('token', alice.token).send({})).status).toBe(403)
    })

    it('keeps the field name the deployed clients already read', async () => {
        const { body } = await api().get('/api/product/list')
        expect(Array.isArray(body.products)).toBe(true)
        expect(body.products).toEqual(body.items)
        expect(body.success).toBe(true)
    })
})
