// CHARACTERISATION — order placement and history as they behave today.
//
// Manifest flows: 1 (order total), 10 (order history immutability),
// plus the order-number allocation that flow 4 will later stress.
//
// Target-state assertions: test/target-state/order.target.test.js.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedProduct, seedCustomer, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'
import userModel from '../../models/userModel.js'

useTestDatabase()

const guestOrder = (body) => api().post('/api/order/guest/place').send(body)
const userOrder = (token, body) => api().post('/api/order/place').set('token', token).send(body)

describe('flow 1 — the server computes every price (SEC-002 — fixed)', () => {
    // FLIPPED IN PHASE 1, tasks 1.7 and 1.8.
    //
    // Phase 0 recorded the vulnerability in full: a $999 product ordered for
    // $0.01, an authenticated order behaving identically because the flaw was
    // duplicated across two controllers, `product.price` never read, and a
    // negative amount accepted. Each of those is inverted below.
    //
    // The legacy `amount` / `subtotal` / `delivery_fee` fields are still *sent*
    // by these tests on purpose: an older cached storefront bundle will keep
    // sending them, and the required outcome for such a request is a correctly
    // priced order rather than a rejection. They are accepted and ignored.

    it('a guest order for a $999 product persists at the server-computed total (SEC-002 — fixed)', async () => {
        const product = await seedProduct({ price: 999, inventory: { '': 5 } })

        const { body, status } = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 1 }],
            amount: 0.01,
            subtotal: 0.01,
            delivery_fee: 0,
            address: validAddress,
        })

        expect(status).toBe(201)
        expect(body.success).toBe(true)

        const stored = await orderModel.findById(body.order._id)
        expect(stored.amount).toBe(1002)        // 999 + 3, not 0.01
        expect(stored.subtotal).toBe(999)
        expect(stored.delivery_fee).toBe(3)
    })

    it('an authenticated order behaves identically, because there is one service (BE-007 — fixed)', async () => {
        const product = await seedProduct({ price: 2499, inventory: { '': 3 } })
        const { token } = await seedCustomer()

        const { body } = await userOrder(token, {
            items: [{ productId: String(product._id), size: '', quantity: 1 }],
            amount: 1,
            subtotal: 1,
            delivery_fee: 0,
            address: validAddress,
        })

        expect((await orderModel.findById(body.order._id)).amount).toBe(2502)
    })

    it('the server reads product.price while placing an order (SEC-002 — fixed)', async () => {
        const product = await seedProduct({ price: 500, inventory: { '': 5 } })

        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 3 }],
            amount: 7,
            address: validAddress,
        })

        const stored = await orderModel.findById(body.order._id)
        expect(stored.subtotal).toBe(1500)      // 3 x 500, computed here
        expect(stored.amount).toBe(1503)
        expect(stored.amount).not.toBe(7)
    })

    it('multi-line quantity maths is correct across several products', async () => {
        const cheap = await seedProduct({ price: 129.5, inventory: { '': 10 } })
        const dear = await seedProduct({ price: 2499, inventory: { '': 10 } })

        const { body } = await guestOrder({
            items: [
                { productId: String(cheap._id), size: '', quantity: 3 },
                { productId: String(dear._id), size: '', quantity: 2 },
            ],
            address: validAddress,
        })

        const stored = await orderModel.findById(body.order._id)
        expect(stored.subtotal).toBe(5386.5)    // 3 x 129.5 + 2 x 2499
        expect(stored.amount).toBe(5389.5)
    })

    it('a negative amount is rejected with 400 (SEC-002 / BE-003 — fixed)', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const response = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 1 }],
            amount: -100,
            address: validAddress,
        })
        expect(response.status).toBe(400)
        expect(await orderModel.countDocuments({})).toBe(0)
    })

    it('subtotal and delivery_fee are computed, not defaulted to 0 when omitted', async () => {
        const product = await seedProduct({ price: 100, inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 1 }],
            address: validAddress,
        })

        const stored = await orderModel.findById(body.order._id)
        expect(stored.subtotal).toBe(100)
        expect(stored.delivery_fee).toBe(3)
    })

    it('a missing product fails safely and writes nothing', async () => {
        const response = await guestOrder({
            items: [{ productId: '5eedffffffffffffffffffff', size: '', quantity: 1 }],
            address: validAddress,
        })

        expect(response.status).toBe(404)
        expect(await orderModel.countDocuments({})).toBe(0)
    })

    it('an invalid variant fails safely and writes nothing', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 5 },
        })
        const response = await guestOrder({
            items: [{ productId: String(product._id), size: 'Purple', quantity: 1 }],
            address: validAddress,
        })

        expect(response.status).toBe(400)
        expect(await orderModel.countDocuments({})).toBe(0)
    })
})

describe('flow 10 — order history is a record of the purchase (DB-005 — fixed)', () => {
    // FLIPPED IN PHASE 2, task 2.2.
    //
    // Phase 0 recorded the defect in full: a line stored only
    // `{ productId, size, quantity }`, both listing endpoints re-read the
    // current product, changing a price rewrote every past order, and deleting
    // a product degraded the line to bare ids. Each of those is inverted below.

    it('an order line stores a full snapshot of what was bought (DB-005 — fixed)', async () => {
        const product = await seedProduct({ price: 300, inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 2 }],
            amount: 603,
            address: validAddress,
        })

        const stored = await orderModel.findById(body.order._id).lean()
        const line = stored.items[0]

        expect(line.name).toBe(product.name)
        expect(line.unitPrice).toBe(300)
        expect(line.unitPriceMinor).toBe(30000)
        expect(line.lineTotalMinor).toBe(60000)
        expect(line.quantity).toBe(2)
        expect(line.image).toBe(product.image[0])
        // `size` is still written under its pre-Phase-2 name (ARCH-003).
        expect(line.size).toBe('')
        expect(line.variantKey).toBe('')
        // Nothing written by the application is a reconstruction; only a
        // migration backfill carries that flag.
        expect(line._reconstructed).toBeUndefined()
    })

    it('shows the price and name paid, not the ones in the catalog today (DB-005 — fixed)', async () => {
        const product = await seedProduct({ price: 1000, inventory: { '': 5 } })
        const { token, user } = await seedCustomer()

        await userOrder(token, {
            items: [{ productId: product._id, size: '', quantity: 1 }],
            amount: 1003,
            address: validAddress,
        })

        await productModel.findByIdAndUpdate(product._id, { price: 1, name: 'Renamed After Purchase' })

        const { body } = await api().post('/api/order/userorders').set('token', token).send({})
        expect(body.success).toBe(true)

        const line = body.orders[0].items[0]
        expect(line.price).toBe(1000)
        expect(line.unitPriceMinor).toBe(100000)
        expect(line.name).toBe(product.name)
        // And the order still adds up, which it did not before.
        expect(body.orders[0].amount).toBe(1003)
        expect(user).toBeTruthy()
    })

    it('survives the product being deleted outright (DB-005 / DB-007 — fixed)', async () => {
        const product = await seedProduct({ price: 250, inventory: { '': 5 } })
        const { token } = await seedCustomer()

        await userOrder(token, {
            items: [{ productId: product._id, size: '', quantity: 1 }],
            amount: 253,
            address: validAddress,
        })
        // Deleted through the model rather than the API: the API now refuses a
        // hard delete while an order references the product (ADM-003), so this
        // is the harsher case of the two.
        await productModel.findByIdAndDelete(product._id)

        const { body } = await api().post('/api/order/userorders').set('token', token).send({})
        const line = body.orders[0].items[0]
        expect(line.name).toBe(product.name)
        expect(line.price).toBe(250)
    })

    it('the admin listing reads the same snapshot, with no per-line lookup (BE-002 — fixed)', async () => {
        const product = await seedProduct({ price: 42, inventory: { '': 5 } })
        await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }],
            amount: 45,
            address: validAddress,
        })

        const { body } = await api().post('/api/order/list').set('token', (await seedAdmin()).token).send({})
        expect(body.success).toBe(true)
        expect(body.orders[0].items[0].name).toBe(product.name)
        expect(body.orders[0].items[0].price).toBe(42)
    })

    it('users see only their own orders', async () => {
        const product = await seedProduct({ inventory: { '': 9 } })
        const alice = await seedCustomer()
        const bob = await seedCustomer()

        await userOrder(alice.token, {
            items: [{ productId: product._id, size: '', quantity: 1 }], amount: 10, address: validAddress,
        })

        const { body } = await api().post('/api/order/userorders').set('token', bob.token).send({})
        expect(body.orders).toEqual([])
    })
})

describe('inventory handling during checkout', () => {
    it('decrements stock for each ordered line of a product that has variants', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 5 },
        })
        await guestOrder({
            items: [{ productId: product._id, size: 'Black', quantity: 2 }], amount: 10, address: validAddress,
        })
        expect((await productModel.findById(product._id)).inventory.Black).toBe(3)
    })

    it('a variant-less product now decrements, because the failure is no longer swallowed (BE-006 — partly fixed)', async () => {
        // A product with no variants stores stock under the empty-string key,
        // because that is what `Product.jsx:83-90` joins to. `$inc` cannot
        // express an empty field name at all — MongoDB rejects it with error 56,
        // EmptyFieldName — and Phase 0's controller wrapped each decrement in a
        // try/catch that only logged, so the order was created and reported
        // successful while stock never moved. Overselling was unbounded.
        //
        // `orderService` handles the empty key explicitly instead of issuing an
        // update it knows will fail. **The encoding itself is unchanged**: the
        // key is still the empty string, and restructuring it into
        // `{ options, quantity, sku }` is DB-003, Phase 2 task 2.9.
        const product = await seedProduct({ variants: [], inventory: { '': 5 } })

        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 2 }], address: validAddress,
        })

        expect(body.success).toBe(true)
        expect((await productModel.findById(product._id)).inventory['']).toBe(3)
    })

    it('refuses an order that exceeds available stock, and leaves stock untouched', async () => {
        const product = await seedProduct({ inventory: { '': 2 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 5 }], amount: 10, address: validAddress,
        })

        // 409 Conflict, rather than Phase 0's HTTP 200 with success:false.
        expect(body.success).toBe(false)
        expect((await productModel.findById(product._id)).inventory['']).toBe(2)
        expect(await orderModel.countDocuments({})).toBe(0)
    })

    it('a zero-stock combination is now distinguished from a missing one', async () => {
        // Phase 0 used `!product.inventory[size]`, which treated a real
        // zero-stock combination and a combination the product does not have as
        // the same thing. `orderService` uses `Object.hasOwn`, so a genuine
        // zero-stock line is a 409 (out of stock) and an unknown key is a 400.
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 0 },
        })

        const outOfStock = await guestOrder({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }], address: validAddress,
        })
        expect(outOfStock.status).toBe(409)

        const unknownVariant = await guestOrder({
            items: [{ productId: String(product._id), size: 'Purple', quantity: 1 }], address: validAddress,
        })
        expect(unknownVariant.status).toBe(400)
    })

    it('CURRENT BEHAVIOUR: a multi-item order decrements the first line before rejecting the second (DB-001 — will change)', async () => {
        const plentiful = await seedProduct({ inventory: { '': 10 } })
        const scarce = await seedProduct({ inventory: { '': 1 } })

        const { body } = await guestOrder({
            items: [
                { productId: plentiful._id, size: '', quantity: 1 },
                { productId: scarce._id, size: '', quantity: 5 },
            ],
            amount: 10,
            address: validAddress,
        })

        // The pre-check loop runs over every line before any write, so this
        // particular ordering is rejected cleanly. The check and the decrement
        // are still two separate passes with no transaction around them, which
        // is what DB-001 is about.
        expect(body.success).toBe(false)
        expect((await productModel.findById(plentiful._id)).inventory['']).toBe(10)
    })

    it('rejects an order referencing a product that does not exist with 404', async () => {
        const response = await guestOrder({
            items: [{ productId: '5eedffffffffffffffffffff', size: '', quantity: 1 }],
            address: validAddress,
        })
        expect(response.status).toBe(404)
        expect(response.body.success).toBe(false)
    })
})

describe('order numbers and cart clearing', () => {
    it('allocates the first order number as 1000 and increments from the maximum', async () => {
        const product = await seedProduct({ inventory: { '': 9 } })
        const place = () => guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }], amount: 10, address: validAddress,
        })

        const first = await place()
        const second = await place()

        expect(first.body.order.orderNumber).toBe(1000)
        expect(second.body.order.orderNumber).toBe(1001)
    })

    it('an authenticated order clears the cart to an empty object, not an array', async () => {
        // Phase 0 wrote `cartData: []` onto an Object-typed path: it read as
        // empty, but the type was wrong and the storefront clears with `{}`.
        // `orderService` writes `{}`. The rest of BE-004 / DB-011 — quantity
        // handling and pruning zeroed entries — remains Phase 2.
        const product = await seedProduct({ inventory: { '': 5 } })
        const { token, user } = await seedCustomer({ cartData: { someProduct: { '': 2 } } })

        await userOrder(token, {
            items: [{ productId: String(product._id), size: '', quantity: 1 }], address: validAddress,
        })

        const stored = await userModel.findById(user._id).lean()
        expect(Array.isArray(stored.cartData)).toBe(false)
        expect(stored.cartData).toEqual({})
    })

    it('marks guest orders and leaves them without a userId', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }], amount: 10, address: validAddress,
        })
        const stored = await orderModel.findById(body.order._id).lean()
        expect(stored.isGuestOrder).toBe(true)
        expect(stored.userId).toBeUndefined()
    })

    it('defaults the payment method to COD and leaves payment unpaid', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }], amount: 10, address: validAddress,
        })
        expect(body.order.paymentMethod).toBe('COD')
        expect(body.order.payment).toBe(false)
        expect(body.order.status).toBe('Order Placed')
    })
})

describe('order status updates (DB-008)', () => {
    it('updates the status through the admin route', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }], amount: 10, address: validAddress,
        })

        await api().post('/api/order/status').set('token', (await seedAdmin()).token)
            .send({ orderId: body.order._id, status: 'Shipped' })

        expect((await orderModel.findById(body.order._id)).status).toBe('Shipped')
    })

    it('a status outside the allowed set is rejected with 400 (SEC-017 — fixed)', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: String(product._id), size: '', quantity: 1 }], address: validAddress,
        })

        const response = await api().post('/api/order/status').set('token', (await seedAdmin()).token)
            .send({ orderId: body.order._id, status: 'Eaten By A Goat' })

        expect(response.status).toBe(400)
        expect((await orderModel.findById(body.order._id)).status).toBe('Order Placed')
    })

    it('records who changed the status and when (DB-008 — fixed)', async () => {
        // FLIPPED IN PHASE 2, task 2.7. Was: "no status history is recorded".
        const product = await seedProduct({ inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }], amount: 10, address: validAddress,
        })
        const admin = await seedAdmin()
        await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: 'Delivered' })

        const stored = await orderModel.findById(body.order._id).lean()
        expect(stored.statusHistory).toHaveLength(2)
        expect(stored.statusHistory[0]).toMatchObject({ status: 'Order Placed' })
        expect(stored.statusHistory[1]).toMatchObject({
            status: 'Delivered',
            by: `admin:${String(admin.user._id)}`,
        })
        expect(new Date(stored.statusHistory[1].at).getTime()).toBeGreaterThan(0)
    })

    it('refuses a backwards transition and leaves the order untouched (DB-008 — fixed)', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 1 }], address: validAddress,
        })
        const admin = await seedAdmin()

        await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: 'Delivered' })
        const response = await api().post('/api/order/status').set('token', admin.token)
            .send({ orderId: body.order._id, status: 'Order Placed' })

        expect(response.status).toBe(409)
        const stored = await orderModel.findById(body.order._id).lean()
        expect(stored.status).toBe('Delivered')
        expect(stored.statusHistory).toHaveLength(2)
    })
})
