// PHASE 0–2 PRE-COMMIT — concurrent cart writes must not overwrite each other.
//
// `addToCart` and `updateCart` both did: load the user, take `cartData`, change
// one entry in it, and write the **whole map** back with
// `findByIdAndUpdate(userId, { cartData })`. Two tabs — or a phone and a laptop,
// or one impatient double-click on two different products — both read the same
// map and the second write erased the first's line. The customer saw an item
// they had just added disappear, with no error anywhere.
//
// The fix is to write the one entry rather than the whole map: an
// aggregation-pipeline update that rebuilds only the affected product's variant
// object, with the stock check expressed in the filter so it is part of the same
// atomic operation. `mergeCart` legitimately replaces the whole map, so it takes
// the other standard remedy — a version it must still be holding, with a bounded
// retry.
//
// The empty field name is why this is a pipeline and not `$inc`: a variant-less
// product's key is `''`, and `cartData.<id>.` is not a legal field path
// (MongoDB error 56). That is the same trap `orderService.reserve` documents.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct } from '../helpers/api.js'
import userModel from '../../models/userModel.js'

useTestDatabase()

const add = (token, body) => api().post('/api/cart/add').set('token', token).send(body)
const update = (token, body) => api().post('/api/cart/update').set('token', token).send(body)
const merge = (token, cart) => api().post('/api/cart/merge').set('token', token).send({ cart })

const cartOf = async (userId) => (await userModel.findById(userId).lean()).cartData ?? {}

describe('two simultaneous additions', () => {
    it('keeps both when they are different products', async () => {
        const [a, b] = await Promise.all([
            seedProduct({ inventory: { '': 10 } }),
            seedProduct({ inventory: { '': 10 } }),
        ])
        const { user, token } = await seedCustomer()

        const responses = await Promise.all([
            add(token, { itemId: String(a._id), variantKey: '', quantity: 1 }),
            add(token, { itemId: String(b._id), variantKey: '', quantity: 1 }),
        ])
        for (const response of responses) expect(response.status).toBe(200)

        const cart = await cartOf(user._id)
        expect(cart[String(a._id)]).toEqual({ '': 1 })
        expect(cart[String(b._id)]).toEqual({ '': 1 })
    })

    it('keeps both when they are different variants of one product', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 10, White: 10 },
        })
        const { user, token } = await seedCustomer()

        await Promise.all([
            add(token, { itemId: String(product._id), variantKey: 'Black', quantity: 2 }),
            add(token, { itemId: String(product._id), variantKey: 'White', quantity: 3 }),
        ])

        expect(await cartOf(user._id)).toEqual({ [String(product._id)]: { Black: 2, White: 3 } })
    })

    it('sums them when they are the same line, losing neither', async () => {
        const product = await seedProduct({ inventory: { '': 20 } })
        const { user, token } = await seedCustomer()

        await Promise.all(Array.from({ length: 5 }, () =>
            add(token, { itemId: String(product._id), variantKey: '', quantity: 1 })))

        expect(await cartOf(user._id)).toEqual({ [String(product._id)]: { '': 5 } })
    })
})

describe('simultaneous quantity changes', () => {
    it('applies each to its own line', async () => {
        const [a, b] = await Promise.all([
            seedProduct({ inventory: { '': 10 } }),
            seedProduct({ inventory: { '': 10 } }),
        ])
        const { user, token } = await seedCustomer({
            cartData: { [String(a._id)]: { '': 1 }, [String(b._id)]: { '': 1 } },
        })

        await Promise.all([
            update(token, { itemId: String(a._id), variantKey: '', quantity: 4 }),
            update(token, { itemId: String(b._id), variantKey: '', quantity: 7 }),
        ])

        expect(await cartOf(user._id)).toEqual({
            [String(a._id)]: { '': 4 },
            [String(b._id)]: { '': 7 },
        })
    })

    it('does not resurrect a line another request removed', async () => {
        const [a, b] = await Promise.all([
            seedProduct({ inventory: { '': 10 } }),
            seedProduct({ inventory: { '': 10 } }),
        ])
        const { user, token } = await seedCustomer({
            cartData: { [String(a._id)]: { '': 2 }, [String(b._id)]: { '': 2 } },
        })

        await update(token, { itemId: String(a._id), variantKey: '', quantity: 0 })
        await Promise.all([
            update(token, { itemId: String(b._id), variantKey: '', quantity: 5 }),
        ])

        const cart = await cartOf(user._id)
        expect(cart[String(a._id)]).toBeUndefined()
        expect(cart[String(b._id)]).toEqual({ '': 5 })
    })
})

describe('a merge that races an addition', () => {
    it('loses neither the merged cart nor the concurrent line', async () => {
        const [inCart, guestOnly, added] = await Promise.all([
            seedProduct({ inventory: { '': 10 } }),
            seedProduct({ inventory: { '': 10 } }),
            seedProduct({ inventory: { '': 10 } }),
        ])
        const { user, token } = await seedCustomer({ cartData: { [String(inCart._id)]: { '': 1 } } })

        await Promise.all([
            merge(token, { [String(guestOnly._id)]: { '': 2 } }),
            add(token, { itemId: String(added._id), variantKey: '', quantity: 1 }),
        ])

        const cart = await cartOf(user._id)
        expect(cart[String(inCart._id)]).toEqual({ '': 1 })
        expect(cart[String(guestOnly._id)]).toEqual({ '': 2 })
        expect(cart[String(added._id)], 'the concurrent addition was overwritten by the merge').toEqual({ '': 1 })
    })
})

describe('the behaviour the atomic write must preserve', () => {
    it('still refuses to put more in the cart than exists', async () => {
        const product = await seedProduct({ inventory: { '': 2 } })
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantKey: '', quantity: 2 }).expect(200)
        const over = await add(token, { itemId: String(product._id), variantKey: '', quantity: 1 })

        expect(over.status).toBe(409)
        expect(await cartOf(user._id)).toEqual({ [String(product._id)]: { '': 2 } })
    })

    it('never lets concurrent additions exceed stock between them', async () => {
        const product = await seedProduct({ inventory: { '': 3 } })
        const { user, token } = await seedCustomer()

        const responses = await Promise.all(Array.from({ length: 6 }, () =>
            add(token, { itemId: String(product._id), variantKey: '', quantity: 1 })))

        const accepted = responses.filter((r) => r.status === 200).length
        expect(accepted).toBe(3)
        expect(await cartOf(user._id)).toEqual({ [String(product._id)]: { '': 3 } })
    })

    it('still deletes the key rather than writing zero (DB-011)', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { user, token } = await seedCustomer({ cartData: { [String(product._id)]: { '': 2 } } })

        await update(token, { itemId: String(product._id), variantKey: '', quantity: 0 }).expect(200)

        expect(await cartOf(user._id)).toEqual({})
    })

    it('keeps a sibling variant when one of them is removed', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 5, White: 5 },
        })
        const { user, token } = await seedCustomer({
            cartData: { [String(product._id)]: { Black: 1, White: 2 } },
        })

        await update(token, { itemId: String(product._id), variantKey: 'Black', quantity: 0 }).expect(200)

        expect(await cartOf(user._id)).toEqual({ [String(product._id)]: { White: 2 } })
    })

    it('still answers 404 for a line that is not in the cart', async () => {
        const product = await seedProduct()
        const { token } = await seedCustomer()
        const response = await update(token, { itemId: String(product._id), variantKey: '', quantity: 3 })
        expect(response.status).toBe(404)
    })

    it('still accepts a combination the catalog cannot resolve, as intent', async () => {
        const product = await seedProduct({ variants: [], inventory: { Black: 5 } })
        const { user, token } = await seedCustomer()

        await add(token, { itemId: String(product._id), variantKey: 'Withdrawn', quantity: 2 }).expect(200)

        expect(await cartOf(user._id)).toEqual({ [String(product._id)]: { Withdrawn: 2 } })
    })
})
