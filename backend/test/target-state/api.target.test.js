// TARGET STATE — the behaviour the API must have after the remediation phases.
//
// Every test in this file is skipped and every one is expected to FAIL against
// current `main`. They are written out in full, not left as bare `todo` names,
// so that enabling one is a matter of deleting `.skip` rather than writing a
// test from a description.
//
// Each block records four things, as required by the Phase 0 definition of done:
//   Finding     — the register id being closed
//   Why skipped — why it cannot pass today
//   Enable in   — the roadmap phase and task that makes it pass
//   Assertion   — stated in the test body itself
//
// The matching current-behaviour tests live under test/characterisation/, and
// docs/test-manifest.md maps both halves to the 14 critical flows.

import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedProduct, seedCustomer, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'

useTestDatabase()

const guestOrder = (body) => api().post('/api/order/guest/place').send(body)

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 1: the server computes every price (SEC-002)', () => {
    // Finding:     SEC-002 (order totals client-controlled)
    // ENABLED in Phase 1, roadmap task 1.8 (after 1.7 extracted orderService).
    // Was: "`orderController` persists the client's `amount`, `subtotal` and
    // `delivery_fee` verbatim and never reads `product.price`".
    it('GATE 1 — ignores the client amount and persists the server-computed total', async () => {
        const product = await seedProduct({ price: 999, inventory: { Black: 5 } })

        const { body } = await guestOrder({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 0.01,
            subtotal: 0.01,
            delivery_fee: 0,
            address: validAddress,
        })

        const stored = await orderModel.findById(body.order._id)
        expect(stored.subtotal).toBe(999)
        expect(stored.delivery_fee).toBe(3)
        expect(stored.amount).toBe(1002)
    })

    // Finding:     SEC-002, BE-003
    // ENABLED in Phase 1, task 1.4 (validation) + 1.8 (server pricing).
    //
    // Note how this coexists with the test above, which sends `amount: 0.01`
    // and expects success. A legacy client's `amount` is accepted and ignored
    // so a cached bundle still checks out correctly; a *hostile* value —
    // negative, non-numeric, an object — is still a 400. Both are true at once
    // because the field is validated and then discarded, not trusted.
    it('rejects a negative or non-numeric amount with 400', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const response = await guestOrder({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: -100,
            address: validAddress,
        })
        expect(response.status).toBe(400)
    })

    // Finding:     BE-007, ARCH-001
    // ENABLED in Phase 1, task 1.7. Was: "`placeOrder` and `placeGuestOrder`
    // are ~90-line duplicates, so pricing would have to be fixed twice".
    it('applies identical pricing to guest and authenticated orders', async () => {
        const product = await seedProduct({ price: 250, inventory: { Black: 5 } })
        const { token } = await seedCustomer()
        const items = [{ productId: product._id, size: 'Black', quantity: 2 }]

        const guest = await guestOrder({ items, amount: 1, address: validAddress })
        const authenticated = await api().post('/api/order/place').set('token', token)
            .send({ items, amount: 1, address: validAddress })

        const [a, b] = await Promise.all([
            orderModel.findById(guest.body.order._id),
            orderModel.findById(authenticated.body.order._id),
        ])
        expect(a.amount).toBe(b.amount)
        expect(a.amount).toBe(503) // 2 × 250 + 3 delivery
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 2: the admin token carries no secret (SEC-001)', () => {
    // Finding:     SEC-001 (admin password embedded in the JWT payload)
    // ENABLED in Phase 1, roadmap task 1.5. Was: "`adminLogin` signs the string
    // `email + password`. A JWT is signed, not encrypted, so the password is
    // readable by anyone holding the token".
    it('GATE 1 — issues a claims object containing no substring of the admin password', async () => {
        const { credentials } = await seedAdmin()
        const { body } = await api().post('/api/user/admin').send(credentials)
        const payload = jwt.decode(body.token)

        expect(typeof payload).toBe('object')
        expect(JSON.stringify(payload)).not.toContain(credentials.password)
        expect(payload).toMatchObject({ role: 'admin' })
        // Phase 0 wrote `id`; the claim is the registered `sub`, which is what
        // `jwt.verify` and every JWT library already understand.
        expect(payload).toHaveProperty('sub')
        expect(payload).not.toHaveProperty('password')
    })

    // Finding:     SEC-001, SEC-012
    // ENABLED in Phase 1, task 1.5. Was: "there is no admin user record; the
    // console gates on a non-empty string".
    it('authorises admin routes by role rather than by credential equality', async () => {
        const { token } = await seedCustomer()
        const response = await api().post('/api/order/list').set('token', token).send({})
        expect(response.status).toBe(403)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 3: concurrent orders never oversell (DB-001)', () => {
    // Finding:     DB-001 (check/decrement not atomic), BE-006 (errors swallowed)
    // ENABLED in Phase 2, roadmap task 2.4. MANDATORY at Gate 2.
    // Was: "the check and the decrement are two separate passes with no
    // transaction", so asserting the failure would have meant writing a test
    // that depends on winning a race. The invariant is deterministic now that
    // reservation is a single conditional atomic update inside a transaction.
    //
    // ONE CHANGE FROM THE PHASE 0 TEXT, and it is not a weakening.
    // These two concurrency tests drive `POST /api/order/place` rather than the
    // guest endpoint. Phase 1 capped guest checkout at **3 orders per hour per
    // IP** (SEC-005/SEC-011) because it is unauthenticated and inventory-
    // mutating, and that limiter is deliberately left exactly as it is — see
    // "flow 13: rate limits engage" below, which still asserts the 4th guest
    // order is a 429. Ten and fifty concurrent *guest* orders are therefore not
    // a reachable state in this system, and a test that made them reachable
    // would only be measuring a limiter it had first had to defeat. The race the
    // invariant is about is between authenticated checkouts, so that is where it
    // is asserted. Every assertion below is the Phase 0 text verbatim.
    it('N concurrent orders against N-1 stock leave stock at zero, never negative', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { token } = await seedCustomer()
        const place = () => api().post('/api/order/place').set('token', token).send({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 10,
            address: validAddress,
        })

        const results = await Promise.allSettled(Array.from({ length: 10 }, place))
        const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.body.success)

        expect(succeeded).toHaveLength(5)
        const finalStock = (await productModel.findById(product._id)).inventory.Black
        expect(finalStock).toBe(0)
        expect(finalStock).toBeGreaterThanOrEqual(0)
        expect(await orderModel.countDocuments({})).toBe(5)
    })

    // Finding:     DB-001, DB-003. ENABLED in Phase 2, tasks 2.4 and 2.9.
    // The same invariant on the typed representation: the legacy bag above is
    // dual-written from it, and this is the field the reservation actually
    // guards on.
    it('never lets the typed variant quantity go negative under the same race', async () => {
        const product = await seedProduct({ inventory: { Black: 3 } })
        const { token } = await seedCustomer()
        const place = () => api().post('/api/order/place').set('token', token).send({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            address: validAddress,
        })

        await Promise.allSettled(Array.from({ length: 8 }, place))

        const stored = await productModel.findById(product._id)
        const entry = stored.inventoryV2.find((candidate) => candidate.legacyKey === 'Black')
        expect(entry.quantity).toBe(0)
        expect(entry.quantity).toBeGreaterThanOrEqual(0)
        expect(await orderModel.countDocuments({})).toBe(3)
    })

    // Finding:     DB-001, BE-006
    // Why skipped: a multi-line order decrements line by line with no rollback.
    // Enable in:   Phase 2, task 2.4.
    it('rolls back every decrement when any line in an order fails', async () => {
        const plentiful = await seedProduct({ inventory: { Black: 10 } })
        const scarce = await seedProduct({ inventory: { Black: 1 } })

        await guestOrder({
            items: [
                { productId: plentiful._id, size: 'Black', quantity: 1 },
                { productId: scarce._id, size: 'Black', quantity: 99 },
            ],
            amount: 10,
            address: validAddress,
        })

        expect((await productModel.findById(plentiful._id)).inventory.Black).toBe(10)
        expect((await productModel.findById(scarce._id)).inventory.Black).toBe(1)
        expect(await orderModel.countDocuments({})).toBe(0)
    })

    // Finding:     BE-006, DB-003
    // Why skipped: a variant-less product stores stock under the empty-string
    //              key, so the decrement is issued as `$inc: {"inventory.": -n}`,
    //              which MongoDB rejects (error 56, EmptyFieldName). The
    //              controller logs and continues, so stock never moves and the
    //              product can be oversold without limit.
    // Enable in:   Phase 2, tasks 2.4 and 2.9.
    it('decrements stock for a product that has no variants', async () => {
        const product = await seedProduct({ variants: [], inventory: { '': 5 } })
        await guestOrder({
            items: [{ productId: product._id, size: '', quantity: 2 }],
            amount: 10,
            address: validAddress,
        })
        const stored = await productModel.findById(product._id)
        expect(Object.values(stored.inventory)[0]).toBe(3)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 4: order numbers are unique (DB-002)', () => {
    // Finding:     DB-002 (order-number race, no unique index)
    // ENABLED in Phase 2, roadmap task 2.3 (after 2.1 added the index).
    // MANDATORY at Gate 2. Was: "allocation is
    // `findOne().sort('-orderNumber')` then `+1`, with no unique index to catch
    // a collision". Allocation is now one atomic `$inc`-equivalent on a counters
    // document, inside the caller's transaction.
    //
    // Driven through the authenticated route for the reason given in full on
    // flow 3 above: Phase 1's 3-per-hour guest limiter is not weakened here.
    it('50 concurrent orders receive 50 distinct order numbers', async () => {
        const product = await seedProduct({ inventory: { Black: 100 } })
        const { token } = await seedCustomer()
        const place = () => api().post('/api/order/place').set('token', token).send({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 10,
            address: validAddress,
        })

        await Promise.all(Array.from({ length: 50 }, place))

        const numbers = (await orderModel.find({}, { orderNumber: 1 }).lean()).map((o) => o.orderNumber)
        expect(numbers).toHaveLength(50)
        expect(new Set(numbers).size).toBe(50)
    })

    // Finding:     DB-002
    // Why skipped: no unique index exists on orderNumber.
    // Enable in:   Phase 2, task 2.3.
    it('enforces uniqueness at the database level', async () => {
        const indexes = await orderModel.collection.indexes()
        const orderNumberIndex = indexes.find((index) => 'orderNumber' in index.key)
        expect(orderNumberIndex?.unique).toBe(true)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 6: the cart honours the requested quantity (BE-004)', () => {
    // Finding:     BE-004 (addToCart ignores quantity)
    // Why skipped: `addToCart` does not destructure `quantity` and hardcodes +=1.
    // Enable in:   Phase 2, roadmap task 2.8.
    it('adding quantity 3 makes the server cart read 3', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await api().post('/api/cart/add').set('token', token)
            .send({ itemId: String(product._id), variantKey: 'Black', quantity: 3 })

        const { body } = await api().post('/api/cart/get').set('token', token).send({})
        expect(body.cartData[String(product._id)].Black).toBe(3)
    })

    // Finding:     BE-004
    // Why skipped: nothing checks stock when an item is added to the cart.
    // Enable in:   Phase 2, task 2.8.
    it('refuses to put more in the cart than exists in stock', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct({ inventory: { Black: 2 } })

        const response = await api().post('/api/cart/add').set('token', token)
            .send({ itemId: String(product._id), variantKey: 'Black', quantity: 5 })

        expect(response.status).toBe(409)
    })

    // Finding:     DB-011
    // Why skipped: a zeroed entry is left in place rather than removed.
    // Enable in:   Phase 2, task 2.11.
    it('prunes a cart entry when its quantity reaches zero', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await api().post('/api/cart/add').set('token', token)
            .send({ itemId: String(product._id), variantKey: 'Black', quantity: 1 })
        await api().post('/api/cart/update').set('token', token)
            .send({ itemId: String(product._id), variantKey: 'Black', quantity: 0 })

        const { body } = await api().post('/api/cart/get').set('token', token).send({})
        expect(body.cartData).toEqual({})
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 8: variant identity survives hyphens (DB-003)', () => {
    // Finding:     DB-003, ARCH-002, ARCH-003
    // Why skipped: variants are identified by option values joined with "-",
    //              which is not reversible once a value contains a hyphen. The
    //              fix restructures inventory into an array of
    //              `{ options: Map, quantity, sku }` across five files.
    // Enable in:   Phase 2, roadmap task 2.9.
    it('resolves stock for a "16-inch" option in both directions', async () => {
        const product = await seedProduct({
            variants: [
                { name: 'Size', options: ['14-inch', '16-inch'] },
                { name: 'Storage', options: ['512GB', '1TB'] },
            ],
            inventory: { '14-inch-512GB': 4, '16-inch-1TB': 1 },
        })

        const { body } = await api().post('/api/product/check-inventory')
            .send({ productId: String(product._id) })

        // The restructured shape must let a consumer recover the option values
        // that produced a combination, not just match a flattened string.
        const combination = body.product.inventory.find(
            (entry) => entry.options.Size === '16-inch' && entry.options.Storage === '1TB',
        )
        expect(combination.quantity).toBe(1)
    })

    // Finding:     DB-003
    // Why skipped: no validation rejects ambiguous option values today.
    // Enable in:   Phase 2, task 2.9 (or its interim mitigation).
    it('never lets two distinct combinations resolve to the same identity', async () => {
        const product = await seedProduct({
            variants: [
                { name: 'A', options: ['16-inch', '16'] },
                { name: 'B', options: ['1TB', 'inch-1TB'] },
            ],
            inventory: {},
        })
        const { body } = await api().post('/api/product/check-inventory')
            .send({ productId: String(product._id) })
        const identities = body.product.inventory.map((entry) => JSON.stringify(entry.options))
        expect(new Set(identities).size).toBe(identities.length)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 10: order history is immutable (DB-005)', () => {
    // Finding:     DB-005 (no snapshot), BE-002 (N+1 enrichment), FE-017
    // Why skipped: an order line is `{ productId, size, quantity }`; both listing
    //              endpoints re-read the current product to fill in name and price.
    // Enable in:   Phase 2, roadmap task 2.2.
    it('shows the price paid, not the price today', async () => {
        const product = await seedProduct({ price: 1000, inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        await api().post('/api/order/place').set('token', token).send({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 1003,
            address: validAddress,
        })
        await productModel.findByIdAndUpdate(product._id, { price: 1, name: 'Renamed' })

        const { body } = await api().post('/api/order/userorders').set('token', token).send({})
        const line = body.orders[0].items[0]
        expect(line.unitPrice).toBe(1000)
        expect(line.name).toBe(product.name)
    })

    // Finding:     DB-005, DB-007
    // Why skipped: a deleted product degrades the line to bare ids.
    // Enable in:   Phase 2, tasks 2.2 and 2.10.
    it('survives the product being deleted', async () => {
        const product = await seedProduct({ price: 250, inventory: { Black: 5 } })
        const { token } = await seedCustomer()

        await api().post('/api/order/place').set('token', token).send({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 253,
            address: validAddress,
        })
        await productModel.findByIdAndDelete(product._id)

        const { body } = await api().post('/api/order/userorders').set('token', token).send({})
        expect(body.orders[0].items[0].name).toBe(product.name)
        expect(body.orders[0].items[0].unitPrice).toBe(250)
    })

    // Finding:     DB-012 (no idempotency on order creation)
    // Why skipped: replaying a request creates a second order.
    // Enable in:   Phase 2, roadmap task 2.5.
    it('returns the original order when a request is replayed with the same idempotency key', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const payload = {
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 103,
            address: validAddress,
        }

        const first = await api().post('/api/order/guest/place').set('Idempotency-Key', 'abc-123').send(payload)
        const second = await api().post('/api/order/guest/place').set('Idempotency-Key', 'abc-123').send(payload)

        expect(second.body.order._id).toBe(first.body.order._id)
        expect(await orderModel.countDocuments({})).toBe(1)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 12: token lifetime and revocation (SEC-003)', () => {
    // Finding:     SEC-003 (JWTs never expire, no revocation)
    // ENABLED in Phase 1, roadmap task 1.6. Was: "`createToken` passes an empty
    // options object, so no `exp` is ever set and a leaked token is valid
    // forever".
    it('issues customer tokens that carry an expiry', async () => {
        const { user } = await seedCustomer()
        const { body } = await api().post('/api/user/login')
            .send({ email: user.email, password: 'test-customer-password' })

        const payload = jwt.decode(body.token)
        expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    // Finding:     SEC-003
    // ENABLED in Phase 1, task 1.6. Was: "there is no tokenVersion or
    // equivalent revocation path".
    //
    // The endpoint is `/api/user/logout` rather than the `/logout-all` this was
    // written against: there is one revocation path, not two, because
    // incrementing `tokenVersion` invalidates every token for the user — which
    // is exactly what this asserts.
    it('rejects a token issued before the user revoked their sessions', async () => {
        const { token, user } = await seedCustomer()
        await api().post('/api/user/logout').set('token', token).send({})

        const response = await api().post('/api/cart/get').set('token', token).send({})
        expect(response.status).toBe(401)
        expect(user).toBeTruthy()
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 13: rate limits engage (SEC-005)', () => {
    // Finding:     SEC-005, SEC-011, SEC-023
    // ENABLED in Phase 1, roadmap task 1.1. Was: "no rate limiter is installed
    // on any route".
    it('returns 429 after 5 failed logins in 15 minutes', async () => {
        const attempt = () => api().post('/api/user/login')
            .send({ email: 'nobody@netronix.test', password: 'wrong' })

        for (let i = 0; i < 5; i += 1) await attempt()
        expect((await attempt()).status).toBe(429)
    })

    // Finding:     SEC-005, SEC-011
    // ENABLED in Phase 1, task 1.1. Was: "guest checkout is unauthenticated and
    // unthrottled".
    it('returns 429 after 3 guest orders in an hour', async () => {
        const product = await seedProduct({ inventory: { Black: 50 } })
        const place = () => guestOrder({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 10,
            address: validAddress,
        })

        for (let i = 0; i < 3; i += 1) await place()
        expect((await place()).status).toBe(429)
    })

    // Finding:     SEC-005, SEC-023, BE-013
    // ENABLED in Phase 1, task 1.1. Was: "the chatbot is unauthenticated,
    // unthrottled, has no message length cap, and bills OpenAI per request".
    // Split into two tests when it was enabled. As written in Phase 0 both
    // assertions shared one 60-second window, and the twelfth request in that
    // window is a 429 whatever its body — the limiter runs ahead of validation,
    // which is the correct order. Both assertions are preserved verbatim; they
    // simply each get their own window.
    it('returns 429 after 10 chatbot messages in a minute', async () => {
        for (let i = 0; i < 10; i += 1) {
            await api().post('/api/chatbot/message').send({ sessionId: 'x', message: 'hi' })
        }
        expect((await api().post('/api/chatbot/message').send({ sessionId: 'x', message: 'hi' })).status).toBe(429)
    })

    it('returns 400 for an oversized chat message', async () => {
        expect((await api().post('/api/chatbot/init').send({ message: 'a'.repeat(5000) })).status).toBe(400)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 14: input validation (SEC-006, BE-003)', () => {
    // Finding:     SEC-006 (NoSQL operator injection), BE-003 (no validation)
    // ENABLED in Phase 1, roadmap task 1.4. Was: "`validator` is used exactly
    // once in the whole API; every other value reaches its controller
    // unchecked".
    it('GATE 1 — rejects an operator object in the login email with 400', async () => {
        const response = await api().post('/api/user/login')
            .send({ email: { $ne: null }, password: 'anything' })
        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
    })

    it('rejects a missing password with 400 rather than a TypeError', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'someone@netronix.test' })
        expect(response.status).toBe(400)
        expect(response.body.message).not.toMatch(/Cannot read properties/)
    })

    it('rejects a malformed ObjectId with a clean 400, not a CastError', async () => {
        const response = await api().post('/api/product/single').send({ productId: 'not-an-object-id' })
        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/CastError|Cast to ObjectId/)
    })

    // Finding:     SEC-017, DB-008. ENABLED in Phase 1, task 1.4.
    it('rejects an order status outside the allowed set with 400', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { body } = await guestOrder({
            items: [{ productId: product._id, size: 'Black', quantity: 1 }],
            amount: 10,
            address: validAddress,
        })

        const { token } = await seedAdmin()
        const response = await api().post('/api/order/status').set('token', token)
            .send({ orderId: body.order._id, status: 'Eaten By A Goat' })
        expect(response.status).toBe(400)
    })

    // Finding:     SEC-018. ENABLED in Phase 1, task 1.4.
    it('rejects a variantKey containing a dot rather than writing a nested path', async () => {
        const product = await seedProduct({ inventory: { Black: 1 } })
        const { token } = await seedAdmin()
        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'a.b', quantity: 5 })
        expect(response.status).toBe(400)
    })

    // Finding:     ADM-009. ENABLED in Phase 1, task 1.4.
    it('rejects a negative product price with 400', async () => {
        const { token } = await seedAdmin()
        const response = await api().post('/api/product/add').set('token', token)
            .field('name', 'Cheap').field('price', '-10')
        expect(response.status).toBe(400)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — cross-cutting HTTP hygiene', () => {
    // Finding:     SEC-013 (no security headers or CSP)
    // ENABLED in Phase 1, roadmap task 1.2.
    it('sets helmet security headers on every response', async () => {
        const response = await api().get('/')
        expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff')
        expect(response.headers).toHaveProperty('content-security-policy')
        expect(response.headers).not.toHaveProperty('x-powered-by')
    })

    // Finding:     SEC-010 (every response returns 200), SEC-009
    // ENABLED in Phase 1, roadmap task 1.10.
    it('uses real status codes and leaks no internal error text', async () => {
        const unauthorised = await api().post('/api/cart/get').send({})
        expect(unauthorised.status).toBe(401)

        const malformed = await api().post('/api/cart/get').set('token', 'not-a-jwt').send({})
        expect(malformed.status).toBe(401)
        expect(malformed.body.message).not.toMatch(/jwt malformed|CastError|at Object\./)
    })

    // Finding:     SEC-004 (chatbot XSS sink)
    // ENABLED in Phase 1, roadmap task 1.3. Was: "`AIclient` instructs the
    // model to emit raw <a> tags and the client renders the reply through
    // React's raw-HTML escape hatch".
    it('GATE 1 — never returns HTML in a chatbot reply', async () => {
        const init = await api().post('/api/chatbot/init').send({})
        const response = await api().post('/api/chatbot/message')
            .send({ sessionId: init.body.sessionId, message: 'recommend a laptop' })

        expect(JSON.stringify(response.body)).not.toContain('<')
        expect(response.body).toHaveProperty('links')
    })

    // Finding:     BE-009 (no pagination)
    // Enable in:   Phase 2, roadmap task 2.12.
    it('paginates the product list', async () => {
        for (let i = 0; i < 30; i += 1) await seedProduct()
        const { body } = await api().get('/api/product/list?page=1&limit=10')
        expect(body.products).toHaveLength(10)
        expect(body).toMatchObject({ page: 1, total: 30 })
    })

    // Finding:     BE-014 (no health endpoint)
    // Activated:   Phase 4, roadmap task 4.14. The full matrix — 503 on a
    //              disconnected connection, on a rejecting ping and on a slow
    //              one, and nothing internal in the body — is
    //              `test/observability/health.test.js`.
    it('exposes a health endpoint', async () => {
        const response = await api().get('/health')
        expect(response.status).toBe(200)
        expect(response.body).toMatchObject({ status: 'ok' })
    })
})
