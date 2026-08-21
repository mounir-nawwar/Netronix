// SECURITY — request validation, endpoint by endpoint.
//
// Findings: SEC-006 (NoSQL operator injection), SEC-017 (any string was an
//           order status), SEC-018 (client key interpolated into a Mongo field
//           path), SEC-019 (password policy was "length >= 8"), BE-003,
//           ADM-009.
//
// Verification-suite items 6 and 15, and Gate 1 criteria 5 and 7.
//
// ENDPOINT COVERAGE. `ENDPOINTS` is every route the API exposes, each marked
// with whether it takes client input that needs validating. The final describe
// block asserts that list against Express's routing table *and* asserts that
// every input-taking route actually has `validateRequest` mounted on it — so a
// new endpoint cannot ship without either validation or an explicit exemption.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedAdmin, seedProduct, validAddress } from '../helpers/api.js'
import productModel from '../../models/productModel.js'
import orderModel from '../../models/orderModel.js'
import userModel from '../../models/userModel.js'
import app from '../../app.js'
import { PASSWORD_MAX_BYTES, ORDER_STATUSES } from '../../validators/common.js'

useTestDatabase()

const OPERATOR_PAYLOADS = [
    ['$ne', { $ne: null }],
    ['$regex', { $regex: '^admin' }],
    ['$gt', { $gt: '' }],
    ['$in', { $in: ['a@b.test'] }],
    ['$where', { $where: '1==1' }],
    ['nested $ne', { nested: { $ne: null } }],
]

describe('SEC-006 — operator objects are refused before any query runs', () => {
    it.each(OPERATOR_PAYLOADS)('GATE 1 — login with an %s email returns 400', async (_label, payload) => {
        await seedCustomer()

        const response = await api().post('/api/user/login').send({ email: payload, password: 'anything-at-all' })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        // A 401 here would mean the object reached `findOne`, matched a user,
        // and only failed at the password comparison — which is what used to
        // happen, and is how the user base was enumerable.
        expect(response.body.message).not.toBe('Invalid email or password')
    })

    it.each(OPERATOR_PAYLOADS)('registration with an %s email returns 400', async (_label, payload) => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: payload, password: 'password123' })
        expect(response.status).toBe(400)
    })

    it('an operator object anywhere in the body is refused, not just in known fields', async () => {
        const response = await api().post('/api/product/single').send({ productId: { $ne: null } })
        expect(response.status).toBe(400)
    })

    it('a dotted key is refused', async () => {
        const response = await api().post('/api/product/single').send({ 'a.b': 1, productId: 'x' })
        expect(response.status).toBe(400)
    })

    it('the ReDoS route through registration is closed', async () => {
        // `registerUser` ran its duplicate-address lookup *before* validating,
        // so `{"$regex":"(a+)+$"}` was an evaluated-server-side ReDoS with no
        // rate limit in front of it.
        const started = Date.now()
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: { $regex: '(a+)+$' }, password: 'password123' })

        expect(response.status).toBe(400)
        expect(Date.now() - started).toBeLessThan(2000)
        expect(await userModel.countDocuments({})).toBe(0)
    })

    it('a legitimate string email still works', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'Real', email: 'real@netronix.test', password: 'password123' })
        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
    })
})

describe('BE-003 — missing and malformed fields fail cleanly', () => {
    it('GATE 1 — a missing password returns 400, not a TypeError', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'someone@netronix.test' })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/Cannot read properties/)
    })

    it('a malformed ObjectId returns 400 with no CastError', async () => {
        const response = await api().post('/api/product/single').send({ productId: 'not-an-object-id' })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/CastError|Cast to ObjectId/)
    })

    it.each([
        ['/api/product/single', { productId: 'nope' }],
        ['/api/product/check-inventory', { productId: '12345' }],
    ])('%s rejects a malformed id', async (path, body) => {
        expect((await api().post(path).send(body)).status).toBe(400)
    })

    it('an unknown field is refused rather than silently ignored', async () => {
        const response = await api().post('/api/product/single')
            .send({ productId: '5eedffffffffffffffffffff', somethingElse: true })
        expect(response.status).toBe(400)
    })
})

describe('SEC-019 — the password policy has both a floor and a ceiling', () => {
    it('refuses a password shorter than 8 characters', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'short@netronix.test', password: '1234567' })
        expect(response.status).toBe(400)
    })

    it(`refuses a password longer than ${PASSWORD_MAX_BYTES} bytes, where bcrypt would truncate`, async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'long@netronix.test', password: 'a'.repeat(PASSWORD_MAX_BYTES + 1) })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).toMatch(/bcrypt/)
    })

    it('counts bytes, not characters, at the bcrypt boundary', async () => {
        // Four bytes each, so 19 of them is 76 bytes — over the limit despite
        // being only 19 "characters".
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'multibyte@netronix.test', password: '😀'.repeat(19) })
        expect(response.status).toBe(400)
    })

    it('accepts a password at exactly the boundary', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: 'boundary@netronix.test', password: 'a'.repeat(PASSWORD_MAX_BYTES) })
        expect(response.status).toBe(201)
    })
})

describe('SEC-017 — order status is constrained to the existing set', () => {
    async function anOrder() {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { body } = await api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
        })
        return body.order._id
    }

    it('rejects a status outside the allowed set with 400 and does not write', async () => {
        const { token } = await seedAdmin()
        const orderId = await anOrder()

        const response = await api().post('/api/order/status').set('token', token)
            .send({ orderId, status: 'Eaten By A Goat' })

        expect(response.status).toBe(400)
        expect((await orderModel.findById(orderId)).status).toBe('Order Placed')
    })

    // Every order starts at `Order Placed`, so that is the one member of the
    // enum that is not a *transition* from it. Phase 2 added the transition
    // table (DB-008): the enum still says which statuses exist, and the table
    // now says which are reachable from where. Both halves are asserted.
    const REACHABLE_FROM_PLACED = ORDER_STATUSES.filter((status) => status !== 'Order Placed')

    it.each(REACHABLE_FROM_PLACED)('accepts the real status %s', async (status) => {
        const { token } = await seedAdmin()
        const orderId = await anOrder()

        const response = await api().post('/api/order/status').set('token', token).send({ orderId, status })

        expect(response.status).toBe(200)
        expect((await orderModel.findById(orderId)).status).toBe(status)
    })

    it('refuses to re-apply the status an order already has, and changes nothing', async () => {
        const { token } = await seedAdmin()
        const orderId = await anOrder()

        const response = await api().post('/api/order/status').set('token', token)
            .send({ orderId, status: 'Order Placed' })

        // 409, not 400: the request is well-formed and the status is real; what
        // is wrong is the state it is being applied to. Almost always a
        // double-submitted form, and answering "done" to that hides it.
        expect(response.status).toBe(409)
        const stored = await orderModel.findById(orderId)
        expect(stored.status).toBe('Order Placed')
        expect(stored.statusHistory).toHaveLength(1)
    })

    it('rejects a non-string status', async () => {
        const { token } = await seedAdmin()
        const orderId = await anOrder()
        expect((await api().post('/api/order/status').set('token', token)
            .send({ orderId, status: { $ne: null } })).status).toBe(400)
    })
})

describe('SEC-018 — inventory keys are checked against the product', () => {
    it('GATE 1 — a dotted variantKey returns 400 and writes nothing', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({ inventory: { Black: 1 } })

        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'a.b', quantity: 5 })

        expect(response.status).toBe(400)

        const stored = await productModel.findById(product._id).lean()
        expect(stored.inventory).toEqual({ Black: 1 })
        expect(stored.inventory.a).toBeUndefined()
    })

    it.each([
        ['a dollar-prefixed key', '$set'],
        ['a nested dollar key', 'a.$inc'],
        ['a traversal-looking key', '../../etc'],
        ['a key with a newline', 'Black\nWhite'],
    ])('rejects %s', async (_label, variantKey) => {
        const { token } = await seedAdmin()
        const product = await seedProduct({ inventory: { Black: 1 } })

        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey, quantity: 5 })

        expect(response.status).toBe(400)
        expect((await productModel.findById(product._id).lean()).inventory).toEqual({ Black: 1 })
    })

    it('rejects a well-formed key the product does not have', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 1 },
        })

        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'Purple', quantity: 5 })

        expect(response.status).toBe(400)
        expect((await productModel.findById(product._id).lean()).inventory).toEqual({ Black: 1 })
    })

    it('accepts a hyphenated key the product genuinely has', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({
            variants: [{ name: 'GPU', options: ['RTX-4090'] }],
            inventory: { 'RTX-4090': 2 },
        })

        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'RTX-4090', quantity: 9 })

        expect(response.status).toBe(200)
        expect((await productModel.findById(product._id)).inventory['RTX-4090']).toBe(9)
    })

    it('accepts a combination the variants generate but inventory has not stored yet', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 1 },
        })

        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'White', quantity: 4 })

        expect(response.status).toBe(200)
        expect((await productModel.findById(product._id)).inventory.White).toBe(4)
    })

    it('rejects a non-numeric quantity rather than silently storing 0', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({ inventory: { Black: 4 } })

        const response = await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'Black', quantity: 'lots' })

        expect(response.status).toBe(400)
        expect((await productModel.findById(product._id)).inventory.Black).toBe(4)
    })

    it('rejects a negative quantity', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({ inventory: { Black: 4 } })

        expect((await api().post('/api/product/update-inventory').set('token', token)
            .send({ productId: String(product._id), variantKey: 'Black', quantity: -5 })).status).toBe(400)
    })
})

describe('ADM-009 — product input is validated', () => {
    const addProduct = async (token, fields) => {
        const request = api().post('/api/product/add').set('token', token)
        for (const [key, value] of Object.entries(fields)) request.field(key, value)
        return request
    }

    const validFields = {
        name: 'A Product',
        description: 'A description.',
        price: '199.99',
        variants: JSON.stringify([]),
        inventory: JSON.stringify({ '': 5 }),
        tags: JSON.stringify(['Accessories']),
    }

    it('rejects a negative price with 400', async () => {
        const { token } = await seedAdmin()
        const response = await addProduct(token, { ...validFields, price: '-10' })

        expect(response.status).toBe(400)
        expect(await productModel.countDocuments({})).toBe(0)
    })

    it.each([['zero', '0'], ['non-numeric', 'lots'], ['infinite', 'Infinity'], ['empty', '']])(
        'rejects a %s price', async (_label, price) => {
            const { token } = await seedAdmin()
            expect((await addProduct(token, { ...validFields, price })).status).toBe(400)
        })

    it('rejects malformed variants JSON with a generic 400, not a SyntaxError', async () => {
        const { token } = await seedAdmin()
        const response = await addProduct(token, { ...validFields, variants: '{not json' })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/SyntaxError|JSON at position|Unexpected token/)
        expect(await productModel.countDocuments({})).toBe(0)
    })

    it('rejects variants JSON of the wrong shape', async () => {
        const { token } = await seedAdmin()
        expect((await addProduct(token, { ...validFields, variants: JSON.stringify([{ nope: 1 }]) })).status).toBe(400)
    })

    it('rejects an inventory key that is not a valid variant key', async () => {
        const { token } = await seedAdmin()
        expect((await addProduct(token, { ...validFields, inventory: JSON.stringify({ 'a.b': 1 }) })).status).toBe(400)
    })

    it('still requires at least one tag', async () => {
        const { token } = await seedAdmin()
        expect((await addProduct(token, { ...validFields, tags: JSON.stringify([]) })).status).toBe(400)
    })

    it('accepts a well-formed product', async () => {
        const { token } = await seedAdmin()
        const response = await addProduct(token, validFields)

        expect(response.status).toBe(201)
        const stored = await productModel.findOne({ name: 'A Product' })
        expect(stored.price).toBe(199.99)
        expect(stored.tags).toEqual(['Accessories'])
    })
})

describe('BE-003 — cart input is validated', () => {
    it('refuses an itemId that is not a product id at all', async () => {
        const { token } = await seedCustomer()
        const response = await api().post('/api/cart/add').set('token', token)
            .send({ itemId: 'not-a-product-id', variantKey: 'x' })

        expect(response.status).toBe(400)
    })

    it('answers a missing cart entry with 404 rather than a TypeError', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        const response = await api().post('/api/cart/update').set('token', token)
            .send({ itemId: String(product._id), variantKey: 'Nope', quantity: 2 })

        expect(response.status).toBe(404)
        expect(JSON.stringify(response.body)).not.toMatch(/Cannot set properties/)
    })

    it('refuses a negative quantity', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()
        expect((await api().post('/api/cart/update').set('token', token)
            .send({ itemId: String(product._id), variantKey: '', quantity: -1 })).status).toBe(400)
    })
})

describe('BE-003 — order input is validated', () => {
    it('refuses an empty item list', async () => {
        expect((await api().post('/api/order/guest/place')
            .send({ items: [], address: validAddress })).status).toBe(400)
    })

    it('refuses a zero or fractional quantity', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        for (const quantity of [0, -1, 1.5]) {
            const response = await api().post('/api/order/guest/place').send({
                items: [{ productId: String(product._id), size: 'Black', quantity }],
                address: validAddress,
            })
            expect(response.status, `quantity ${quantity}`).toBe(400)
        }
    })

    it('refuses an incomplete address', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        const { city, ...withoutCity } = validAddress

        expect((await api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: withoutCity,
        })).status).toBe(400)
    })

    // `amount`, `subtotal` and `delivery_fee` are accepted-and-ignored for an
    // older cached bundle; anything *else* money-shaped is refused, so a new
    // one cannot appear later and be quietly tolerated.
    //
    // One field per test rather than a loop: the guest-order limiter is 3 per
    // hour, so a four-iteration loop would hit 429 on its last pass and report
    // a rate-limit as a validation failure.
    it.each(['total', 'lineTotal', 'price', 'discount'])(
        'refuses the unknown pricing-shaped field %s', async (field) => {
            const product = await seedProduct({ inventory: { Black: 5 } })

            const response = await api().post('/api/order/guest/place').send({
                items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
                address: validAddress,
                [field]: 1,
            })
            expect(response.status).toBe(400)
        })

    it('refuses an unknown payment method', async () => {
        const product = await seedProduct({ inventory: { Black: 5 } })
        expect((await api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: 'Black', quantity: 1 }],
            address: validAddress,
            paymentMethod: 'FREE',
        })).status).toBe(400)
    })
})

describe('endpoint coverage — every route that takes input validates it', () => {
    /**
     * Every route the API exposes.
     *
     * `input: false` means the route reads nothing from the client beyond a
     * verified token, so there is nothing for a schema to check. Each is listed
     * explicitly rather than skipped silently.
     */
    const ENDPOINTS = [
        { route: 'post /api/user/register', input: true },
        { route: 'post /api/user/login', input: true },
        { route: 'post /api/user/admin', input: true },
        { route: 'get /api/user/admin/session', input: false },
        { route: 'post /api/user/logout', input: true },
        { route: 'post /api/user/wishlist/add', input: true },
        { route: 'post /api/user/wishlist/remove', input: true },
        { route: 'post /api/user/wishlist/get', input: true },
        { route: 'post /api/product/add', input: true },
        { route: 'post /api/product/remove', input: true },
        { route: 'post /api/product/archive', input: true },
        { route: 'post /api/product/restore', input: true },
        { route: 'post /api/product/single', input: true },
        // The four catalog reads take input as of Phase 2: bounded `page` and
        // `limit`, and the admin's `includeArchived` (BE-009, DB-007). Each is
        // validated, so `?limit=5000` is a 400 rather than a silent clamp.
        { route: 'get /api/product/list', input: true },
        { route: 'post /api/product/update-inventory', input: true },
        // Phase 3 (ADM-002, ADM-004). Both take a path parameter and a body,
        // and both are validated before the controller sees either.
        { route: 'patch /api/product/:id', input: true },
        { route: 'post /api/product/:id/inventory', input: true },
        { route: 'post /api/product/check-inventory', input: true },
        { route: 'get /api/product/tags/:tag', input: true },
        { route: 'get /api/product/tags', input: true },
        { route: 'get /api/product/best-sellers', input: true },
        { route: 'post /api/cart/get', input: true },
        { route: 'post /api/cart/add', input: true },
        { route: 'post /api/cart/update', input: true },
        // The guest cart handed over at login (FE-009). The payload comes from
        // browser storage, which anyone can edit, so it is bounded as well as
        // shape-checked.
        { route: 'post /api/cart/merge', input: true },
        { route: 'post /api/order/list', input: true },
        { route: 'post /api/order/status', input: true },
        { route: 'post /api/order/place', input: true },
        { route: 'post /api/order/guest/place', input: true },
        { route: 'post /api/order/userorders', input: true },
        { route: 'post /api/chatbot/init', input: true },
        { route: 'post /api/chatbot/message', input: true },
        { route: 'post /api/chatbot/end', input: true },
        // BE-014 — the health probe. Mounted at the application root, takes no
        // input of any kind, and deliberately sits ahead of the rate limiter
        // so a probe cannot exhaust the global budget.
        { route: 'get /health', input: false },
    ]

    /** Walk Express's routing table: `{ "post /api/user/login": [handlerNames] }`. */
    const routeTable = () => {
        const table = {}
        for (const layer of app._router.stack) {
            if (layer.name !== 'router' || !layer.handle?.stack) continue
            // A router mounted at the application root (`app.use(router)`)
            // has the regexp `^\/?(?=\/|$)`, which the replacements below
            // leave as a lookahead rather than as ''. Normalised here so
            // `/health` is keyed as `get /health` rather than as the raw
            // pattern.
            let mount = layer.regexp.source
                .replace('^\\/', '/')
                .replace('\\/?(?=\\/|$)', '')
                .replace(/\\\//g, '/')
            if (mount === '/?(?=/|$)' || layer.regexp.fast_slash) mount = ''

            for (const entry of layer.handle.stack) {
                if (!entry.route) continue
                const handlers = entry.route.stack.map((item) => item.name)
                for (const method of Object.keys(entry.route.methods)) {
                    table[`${method} ${mount}${entry.route.path}`] = handlers
                }
            }
        }
        return table
    }

    it('the endpoint list is complete and nothing is unaccounted for', () => {
        expect(Object.keys(routeTable()).sort()).toEqual(ENDPOINTS.map((e) => e.route).sort())
    })

    it.each(ENDPOINTS.filter((e) => e.input))('$route has validation middleware mounted', ({ route }) => {
        expect(routeTable()[route]).toContain('validateRequest')
    })

    it('the operator-key guard runs on every request, ahead of the API routers', () => {
        const names = app._router.stack.map((layer) => layer.name)
        expect(names).toContain('rejectOperatorKeys')

        // Compared against the first **API** router, not the first router of
        // any kind: `/health` is a router too, and it is mounted ahead of the
        // guard on purpose (it accepts no input, so there is no operator key
        // for it to smuggle).
        const firstApiRouter = app._router.stack.findIndex(
            (layer) => layer.name === 'router' && layer.regexp.source.includes('api'),
        )
        expect(firstApiRouter).toBeGreaterThan(-1)
        expect(names.indexOf('rejectOperatorKeys')).toBeLessThan(firstApiRouter)
    })
})
