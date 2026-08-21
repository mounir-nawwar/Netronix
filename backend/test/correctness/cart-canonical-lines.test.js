// FINAL CORRECTION — a new cart line keeps the combination that was chosen.
//
// The cart stored `{ productId: { legacyHyphenKey: quantity } }`, and the legacy
// key is a hyphen join. For a catalog that really contains
// `["16-inch","16"] × ["1TB","inch-1TB"]` — every value of which this catalog
// sells — both `16-inch + 1TB` and `16 + inch-1TB` produce the key
// `16-inch-1TB`. So the two combinations were **the same cart line**: adding the
// second overwrote the first, and checkout had to reconstruct the options from
// the key and refuse when it could not.
//
// Refusing the reconstruction (the previous pass) stops the wrong thing being
// bought. It does not let the customer buy the right thing. The identity has to
// be kept at the moment it is known, which is when the customer selects it.
//
// The representation is additive, in the same shape as every other Phase 2
// rollout in this repository: `cartLines` carries the canonical identity and the
// **option pairs themselves**, and the legacy `cartData` map is still written
// beside it so a cached client bundle keeps working.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct } from '../helpers/api.js'
import userModel from '../../models/userModel.js'
import { canonicalVariantId } from '../../lib/variant.js'

useTestDatabase()

/** Both combinations join to the same legacy key. Every value is one we sell. */
const COLLIDING_VARIANTS = [
    { name: 'Screen', options: ['16-inch', '16'] },
    { name: 'Storage', options: ['1TB', 'inch-1TB'] },
]

const A = { Screen: '16-inch', Storage: '1TB' }
const B = { Screen: '16', Storage: 'inch-1TB' }
const COLLISION_KEY = '16-inch-1TB'

/**
 * Each colliding combination with its own stock row.
 *
 * Written as `inventoryV2` because the legacy bag *cannot* express it — one key,
 * two combinations — which is the same fact, seen from the inventory side.
 */
const collidingProduct = () => seedProduct({
    variants: COLLIDING_VARIANTS,
    inventoryV2: [
        { variantId: canonicalVariantId(A), legacyKey: COLLISION_KEY, options: A, quantity: 9 },
        { variantId: canonicalVariantId(B), legacyKey: COLLISION_KEY, options: B, quantity: 9 },
    ],
})

/** The same product as a pre-migration database holds it: one ambiguous key. */
const legacyCollidingProduct = () => seedProduct({
    variants: COLLIDING_VARIANTS,
    inventory: { '16-inch-1TB': 9 },
})

const add = (token, body) => api().post('/api/cart/add').set('token', token).send(body)
const update = (token, body) => api().post('/api/cart/update').set('token', token).send(body)
const get = (token) => api().post('/api/cart/get').set('token', token).send({})
const merge = (token, body) => api().post('/api/cart/merge').set('token', token).send(body)

const linesOf = async (userId) => (await userModel.findById(userId).lean()).cartLines ?? []

const optionsOf = (line) => (line.variantOptions instanceof Map
    ? Object.fromEntries(line.variantOptions)
    : line.variantOptions)

// ---------------------------------------------------------------------------
describe('the two colliding combinations are two cart lines', () => {
    it('can both be added, and neither overwrites the other', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 2 }).expect(200)
        await add(token, { itemId: String(product._id), variantOptions: B, quantity: 3 }).expect(200)

        const lines = await linesOf(user._id)
        expect(lines).toHaveLength(2)

        const byId = Object.fromEntries(lines.map((line) => [line.variantId, line]))
        expect(byId[canonicalVariantId(A)].quantity).toBe(2)
        expect(byId[canonicalVariantId(B)].quantity).toBe(3)

        // The option pairs themselves, not a re-encoding of them.
        expect(optionsOf(byId[canonicalVariantId(A)])).toEqual(A)
        expect(optionsOf(byId[canonicalVariantId(B)])).toEqual(B)

        // And they really do share a legacy key, which is the whole point.
        expect(byId[canonicalVariantId(A)].variantKey).toBe(COLLISION_KEY)
        expect(byId[canonicalVariantId(B)].variantKey).toBe(COLLISION_KEY)
    })

    it('adds to the right one when the same combination comes back', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 1 }).expect(200)
        await add(token, { itemId: String(product._id), variantOptions: B, quantity: 1 }).expect(200)
        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 4 }).expect(200)

        const byId = Object.fromEntries((await linesOf(user._id)).map((line) => [line.variantId, line]))
        expect(byId[canonicalVariantId(A)].quantity).toBe(5)
        expect(byId[canonicalVariantId(B)].quantity).toBe(1)
    })

    it('serves both back from get, with their options', async () => {
        const product = await collidingProduct()
        const { token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 2 })
        await add(token, { itemId: String(product._id), variantOptions: B, quantity: 3 })

        const response = await get(token)
        expect(response.status).toBe(200)
        expect(response.body.cartLines).toHaveLength(2)

        const served = Object.fromEntries(response.body.cartLines.map((line) => [line.variantId, line]))
        expect(served[canonicalVariantId(A)].variantOptions).toEqual(A)
        expect(served[canonicalVariantId(B)].variantOptions).toEqual(B)
        expect(response.body.unresolvable).toEqual([])
    })

    it('updates one without touching the other', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 2 })
        await add(token, { itemId: String(product._id), variantOptions: B, quantity: 3 })

        await update(token, { itemId: String(product._id), variantOptions: A, quantity: 7 }).expect(200)

        const byId = Object.fromEntries((await linesOf(user._id)).map((line) => [line.variantId, line]))
        expect(byId[canonicalVariantId(A)].quantity).toBe(7)
        expect(byId[canonicalVariantId(B)].quantity).toBe(3)
    })

    it('removes one without removing the other', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 2 })
        await add(token, { itemId: String(product._id), variantOptions: B, quantity: 3 })

        await update(token, { itemId: String(product._id), variantOptions: A, quantity: 0 }).expect(200)

        const lines = await linesOf(user._id)
        expect(lines).toHaveLength(1)
        expect(lines[0].variantId).toBe(canonicalVariantId(B))
        expect(lines[0].quantity).toBe(3)
    })

    it('survives a merge that carries both', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 1 })

        await merge(token, {
            lines: [
                { productId: String(product._id), variantOptions: A, quantity: 2 },
                { productId: String(product._id), variantOptions: B, quantity: 4 },
            ],
        }).expect(200)

        const byId = Object.fromEntries((await linesOf(user._id)).map((line) => [line.variantId, line]))
        expect(byId[canonicalVariantId(A)].quantity).toBe(3)
        expect(byId[canonicalVariantId(B)].quantity).toBe(4)
    })
})

// ---------------------------------------------------------------------------
describe('checkout is handed the options the customer selected', () => {
    it('buys each combination from its own stock row', async () => {
        const product = await seedProduct({
            variants: COLLIDING_VARIANTS,
            inventoryV2: [
                { variantId: canonicalVariantId(A), legacyKey: COLLISION_KEY, options: A, quantity: 5 },
                { variantId: canonicalVariantId(B), legacyKey: COLLISION_KEY, options: B, quantity: 5 },
            ],
        })
        const { token } = await seedCustomer()

        const response = await api().post('/api/order/place').set('token', token).send({
            items: [
                { productId: String(product._id), variantOptions: A, quantity: 1 },
                { productId: String(product._id), variantOptions: B, quantity: 2 },
            ],
            address: {
                firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
                street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
                zipcode: '2022', country: 'Lebanon', phone: '+961 71 000 000',
            },
            paymentMethod: 'COD',
        })

        expect(response.status, JSON.stringify(response.body)).toBe(201)

        const productModel = (await import('../../models/productModel.js')).default
        const after = await productModel.findById(product._id).lean()
        const stock = Object.fromEntries(after.inventoryV2.map((entry) => [entry.variantId, entry.quantity]))
        expect(stock[canonicalVariantId(A)]).toBe(4)
        expect(stock[canonicalVariantId(B)]).toBe(3)
    })
})

// ---------------------------------------------------------------------------
describe('legacy key-only records', () => {
    it('an unambiguous one still reads, and still works', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 5, White: 5 },
        })
        // Written the way the previous shape wrote it: no `cartLines` at all.
        const { user, token } = await seedCustomer({
            cartData: { [String(product._id)]: { Black: 2 } },
        })

        const response = await get(token)
        expect(response.body.cartData[String(product._id)]).toEqual({ Black: 2 })
        expect(response.body.unresolvable).toEqual([])

        // It is served as a line, with the options recovered because the key is
        // unambiguous — recovering a *unique* answer is not guessing.
        const line = response.body.cartLines.find((entry) => entry.variantKey === 'Black')
        expect(line).toBeTruthy()
        expect(line.variantOptions).toEqual({ Colour: 'Black' })
        expect(line.quantity).toBe(2)

        // And it can still be changed by its legacy key.
        await update(token, { itemId: String(product._id), variantKey: 'Black', quantity: 4 }).expect(200)
        expect((await get(token)).body.cartData[String(product._id)]).toEqual({ Black: 4 })
        expect(user).toBeTruthy()
    })

    it('an ambiguous one stays quarantined, with the recovery path', async () => {
        const product = await legacyCollidingProduct()
        const { token } = await seedCustomer({
            cartData: { [String(product._id)]: { [COLLISION_KEY]: 2 } },
        })

        const response = await get(token)

        // Still there — nobody deletes a customer's line for them.
        expect(response.body.cartData[String(product._id)]).toEqual({ [COLLISION_KEY]: 2 })
        expect(response.body.unresolvable).toEqual([
            expect.objectContaining({
                productId: String(product._id),
                variantKey: COLLISION_KEY,
                reason: 'AMBIGUOUS_VARIANT',
            }),
        ])

        // Served as a line with **no** invented identity.
        const line = response.body.cartLines.find((entry) => entry.variantKey === COLLISION_KEY)
        expect(line.variantId).toBeNull()
        expect(line.variantOptions).toBeNull()
        expect(line.unresolvable).toBe('AMBIGUOUS_VARIANT')

        // And it can be removed, which is the way out.
        await update(token, { itemId: String(product._id), variantKey: COLLISION_KEY, quantity: 0 }).expect(200)
        expect((await get(token)).body.cartLines).toHaveLength(0)
    })

    it('a legacy guest cart still merges', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 5 },
        })
        const { user, token } = await seedCustomer()

        await merge(token, { cart: { [String(product._id)]: { Black: 2 } } }).expect(200)

        const lines = await linesOf(user._id)
        expect(lines).toHaveLength(1)
        expect(lines[0].quantity).toBe(2)
        expect(optionsOf(lines[0])).toEqual({ Colour: 'Black' })
    })
})

// ---------------------------------------------------------------------------
describe('the legacy projection is still written', () => {
    it('mirrors an unambiguous cart exactly', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 5, White: 5 },
        })
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: { Colour: 'Black' }, quantity: 2 })
        await add(token, { itemId: String(product._id), variantOptions: { Colour: 'White' }, quantity: 1 })

        const stored = await userModel.findById(user._id).lean()
        expect(stored.cartData[String(product._id)]).toEqual({ Black: 2, White: 1 })
    })

    it('sums the colliding lines rather than dropping one, and says so', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: A, quantity: 2 })
        await add(token, { itemId: String(product._id), variantOptions: B, quantity: 3 })

        // The legacy shape cannot represent two lines under one key. The total
        // is the least wrong projection: an old bundle shows the right count.
        const stored = await userModel.findById(user._id).lean()
        expect(stored.cartData[String(product._id)]).toEqual({ [COLLISION_KEY]: 5 })
    })
})

// ---------------------------------------------------------------------------
describe('the concurrency guarantees still hold', () => {
    it('keeps both of two simultaneous canonical additions', async () => {
        const product = await collidingProduct()
        const { user, token } = await seedCustomer()

        await Promise.all([
            add(token, { itemId: String(product._id), variantOptions: A, quantity: 1 }),
            add(token, { itemId: String(product._id), variantOptions: B, quantity: 1 }),
        ])

        expect(await linesOf(user._id)).toHaveLength(2)
    })

    it('never lets concurrent additions exceed the row they draw from', async () => {
        const product = await seedProduct({ inventory: { '': 3 } })
        const { user, token } = await seedCustomer()

        const responses = await Promise.all(Array.from({ length: 6 }, () =>
            add(token, { itemId: String(product._id), variantOptions: {}, quantity: 1 })))

        expect(responses.filter((r) => r.status === 200)).toHaveLength(3)
        const lines = await linesOf(user._id)
        expect(lines).toHaveLength(1)
        expect(lines[0].quantity).toBe(3)
    })
})

// ---------------------------------------------------------------------------
describe('everything else that touches a cart knows about lines', () => {
    const ADDRESS = {
        firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
        street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
        zipcode: '2022', country: 'Lebanon', phone: '+961 71 000 000',
    }

    it('placing an order empties both representations', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantOptions: {}, quantity: 1 }).expect(200)
        expect(await linesOf(user._id)).toHaveLength(1)

        const response = await api().post('/api/order/place').set('token', token).send({
            items: [{ productId: String(product._id), variantOptions: {}, quantity: 1 }],
            address: ADDRESS,
            paymentMethod: 'COD',
        })
        expect(response.status, JSON.stringify(response.body)).toBe(201)

        const after = await userModel.findById(user._id).lean()
        expect(after.cartData).toEqual({})
        expect(after.cartLines, 'the order cleared the legacy map but left the lines').toEqual([])
    })

    it('deleting a product removes its lines as well as its legacy entry', async () => {
        const doomed = await seedProduct({ inventory: { '': 5 } })
        const keep = await seedProduct({ inventory: { '': 5 } })
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(doomed._id), variantOptions: {}, quantity: 1 }).expect(200)
        await add(token, { itemId: String(keep._id), variantOptions: {}, quantity: 2 }).expect(200)

        const { seedAdmin } = await import('../helpers/api.js')
        const { token: adminToken } = await seedAdmin()
        await api().post('/api/product/remove').set('token', adminToken)
            .send({ id: String(doomed._id) }).expect(200)

        const after = await userModel.findById(user._id).lean()
        expect(after.cartData[String(doomed._id)]).toBeUndefined()
        expect(after.cartLines.map((line) => String(line.productId))).toEqual([String(keep._id)])
        expect(after.cartData[String(keep._id)]).toEqual({ '': 2 })
    })
})
