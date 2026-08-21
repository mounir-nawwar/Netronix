// CHARACTERISATION — the cart API as it behaves today.
//
// Manifest flow: 6 (cart quantity round-trip, BE-004).
// Target-state assertions: test/target-state/cart.target.test.js.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct } from '../helpers/api.js'
import userModel from '../../models/userModel.js'

useTestDatabase()

const addToCart = (token, body) => api().post('/api/cart/add').set('token', token).send(body)
const updateCart = (token, body) => api().post('/api/cart/update').set('token', token).send(body)
const getCart = (token) => api().post('/api/cart/get').set('token', token).send({})

describe('flow 6 — the server honours the quantity the client sends (BE-004 — fixed)', () => {
    // FLIPPED IN PHASE 2, task 2.8.
    //
    // Phase 0 recorded the defect: `addToCart` destructured only
    // `{ userId, itemId, variantKey }` and hardcoded `+= 1`, while the
    // storefront kept the number the customer chose in local state. The two
    // carts diverged silently and only disagreed at checkout.

    it('adding quantity 3 stores 3 (BE-004 — fixed)', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        const response = await addToCart(token, { itemId: String(product._id), variantKey: '', quantity: 3 })
        expect(response.body).toEqual({ success: true, message: 'Cart Updated' })

        const { body } = await getCart(token)
        expect(body.cartData[String(product._id)]).toEqual({ '': 3 })
    })

    it('sums repeated adds and refuses to exceed stock (BE-004 — fixed)', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct({ inventory: { '': 10 } })

        await addToCart(token, { itemId: String(product._id), variantKey: '', quantity: 4 })
        await addToCart(token, { itemId: String(product._id), variantKey: '', quantity: 6 })

        const full = await getCart(token)
        expect(full.body.cartData[String(product._id)]).toEqual({ '': 10 })

        // The eleventh unit does not exist.
        const overstock = await addToCart(token, { itemId: String(product._id), variantKey: '', quantity: 1 })
        expect(overstock.status).toBe(409)
        expect((await getCart(token)).body.cartData[String(product._id)]).toEqual({ '': 10 })
    })

    it('adding quantity 0 prunes the entry rather than storing a zero (DB-011 — fixed)', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await addToCart(token, { itemId: String(product._id), variantKey: '', quantity: 1 })
        await addToCart(token, { itemId: String(product._id), variantKey: '', quantity: 0 })

        // 1 + 0 is still 1: adding nothing removes nothing.
        expect((await getCart(token)).body.cartData[String(product._id)]).toEqual({ '': 1 })
    })

    it('increments by one on each repeated add when no quantity is sent', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await addToCart(token, { itemId: String(product._id), variantKey: 'Black' })
        await addToCart(token, { itemId: String(product._id), variantKey: 'Black' })
        await addToCart(token, { itemId: String(product._id), variantKey: 'Black' })

        const { body } = await getCart(token)
        expect(body.cartData[String(product._id)].Black).toBe(3)
    })

    it('keeps separate counts per variant key', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await addToCart(token, { itemId: String(product._id), variantKey: 'Black' })
        await addToCart(token, { itemId: String(product._id), variantKey: 'White' })
        await addToCart(token, { itemId: String(product._id), variantKey: 'Black' })

        const { body } = await getCart(token)
        expect(body.cartData[String(product._id)]).toEqual({ Black: 2, White: 1 })
    })
})

describe('cart update', () => {
    it('sets an exact quantity, which is the only way the client can reach one', async () => {
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await addToCart(token, { itemId: String(product._id), variantKey: '512GB' })
        await updateCart(token, { itemId: String(product._id), variantKey: '512GB', quantity: 7 })

        const { body } = await getCart(token)
        expect(body.cartData[String(product._id)]['512GB']).toBe(7)
    })

    it('quantity 0 deletes the key rather than zeroing it (DB-011 — fixed)', async () => {
        // FLIPPED IN PHASE 2, task 2.8/2.11. Removal used to write `0`, so the
        // key stayed for ever and a long-lived account accumulated them inside
        // the user document, toward MongoDB's 16 MB limit.
        const { token } = await seedCustomer()
        const product = await seedProduct()

        await addToCart(token, { itemId: String(product._id), variantKey: '512GB' })
        await updateCart(token, { itemId: String(product._id), variantKey: '512GB', quantity: 0 })

        const { body } = await getCart(token)
        // The product entry goes with its last variant, rather than being left
        // behind as an empty object.
        expect(body.cartData).toEqual({})
    })

    it('updating an item that is not in the cart is a clean 404 (BE-003 — fixed)', async () => {
        // Phase 0 assigned into `cartData[itemId][variantKey]` without checking,
        // so the resulting "Cannot set properties of undefined" reached the
        // client verbatim.
        const { token } = await seedCustomer()
        const product = await seedProduct()

        const response = await updateCart(token, {
            itemId: String(product._id), variantKey: 'Nope', quantity: 2,
        })

        expect(response.status).toBe(404)
        expect(JSON.stringify(response.body)).not.toMatch(/Cannot set properties of undefined/)
    })

    it('an update that exceeds stock is refused and changes nothing (BE-004 — fixed)', async () => {
        // FLIPPED IN PHASE 2, task 2.8. A cart could hold 500 of a product with
        // 1 in stock, right up to the moment the order failed.
        const { token } = await seedCustomer()
        const product = await seedProduct({ inventory: { '': 1 } })

        await addToCart(token, { itemId: String(product._id), variantKey: '' })
        const response = await updateCart(token, { itemId: String(product._id), variantKey: '', quantity: 500 })

        expect(response.status).toBe(409)
        const { body } = await getCart(token)
        expect(body.cartData[String(product._id)]['']).toBe(1)
    })

    it('a key the catalog cannot resolve is still accepted — checkout is the gate', async () => {
        // Deliberate. A cart is an intention, not a reservation: a stale
        // bookmark or a withdrawn combination must not produce a button that
        // silently does nothing. `orderService` fails closed on the same key.
        const { token } = await seedCustomer()
        const product = await seedProduct({ inventory: { '': 1 } })

        const added = await addToCart(token, { itemId: String(product._id), variantKey: 'NoSuchVariant', quantity: 4 })
        expect(added.status).toBe(200)

        const placed = await api().post('/api/order/place').set('token', token).send({
            items: [{ productId: String(product._id), size: 'NoSuchVariant', quantity: 4 }],
            address: {
                firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
                street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
                zipcode: '2022', country: 'Lebanon', phone: '+961 71 000 000',
            },
        })
        expect(placed.status).toBe(400)
    })

    it('the cart refuses an itemId that is not a product id (BE-003 — fixed)', async () => {
        const { token } = await seedCustomer()

        const response = await addToCart(token, { itemId: 'not-a-product-id', variantKey: 'x' })
        expect(response.status).toBe(400)

        const { body } = await getCart(token)
        expect(body.cartData).toEqual({})
    })
})

describe('cart persistence', () => {
    it('stores the cart on the user document', async () => {
        const { token, user } = await seedCustomer()
        const product = await seedProduct()

        await addToCart(token, { itemId: String(product._id), variantKey: '1TB' })

        const stored = await userModel.findById(user._id).lean()
        expect(stored.cartData).toEqual({ [String(product._id)]: { '1TB': 1 } })
    })

    it('returns an empty object for a new user', async () => {
        const { token } = await seedCustomer()
        // `toMatchObject`: the response also carries `unresolvable` since the
        // pre-commit pass (DB-003), which is additive and asserted where it
        // belongs, in `test/correctness/variant-integrity.test.js`.
        expect((await getCart(token)).body).toMatchObject({ success: true, cartData: {} })
    })

    it('a token for a deleted user is rejected at the boundary, not deep in a controller (SEC-003 — fixed)', async () => {
        // Phase 0 verified only the signature, so the request reached
        // `getUserCart` and failed on the missing document, returning
        // "Cannot read properties of null" to the client.
        const { token, user } = await seedCustomer()
        await userModel.findByIdAndDelete(user._id)

        const response = await getCart(token)
        expect(response.status).toBe(401)
        expect(JSON.stringify(response.body)).not.toMatch(/Cannot read properties of null/)
    })
})
