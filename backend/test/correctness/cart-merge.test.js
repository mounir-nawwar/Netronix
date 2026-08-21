// PHASE 3 — the guest cart survives signing in (FE-009).
//
// Roadmap task 3.11, frontend plan F-9. The server half.
//
// The defect: a guest cart lived only in `localStorage`, and the login path
// called `getUserCart`, which replaced local state wholesale. Everything the
// customer chose before signing in was discarded at exactly the moment they
// committed to the site, with no message and no way to get it back.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct } from '../helpers/api.js'
import userModel from '../../models/userModel.js'

useTestDatabase()

const merge = (token, cart) => api().post('/api/cart/merge').set('token', token).send({ cart })

const cartOf = async (userId) => (await userModel.findById(userId)).cartData ?? {}

describe('merging sums both carts', () => {
    it('adds the guest quantity to the quantity already on the server', async () => {
        const product = await seedProduct({ inventory: { '': 10 } })
        const { user, token } = await seedCustomer({
            cartData: { [product._id.toString()]: { '': 2 } },
        })

        const response = await merge(token, { [product._id.toString()]: { '': 3 } })

        expect(response.status).toBe(200)
        // Both carts are the same person's intent. Two of something in each is
        // five, not three and not two.
        expect(response.body.cartData[product._id.toString()]['']).toBe(5)
        expect((await cartOf(user._id))[product._id.toString()]['']).toBe(5)
    })

    it('keeps lines that exist on only one side', async () => {
        const onServer = await seedProduct({ inventory: { '': 10 } })
        const asGuest = await seedProduct({ inventory: { '': 10 } })
        const { user, token } = await seedCustomer({
            cartData: { [onServer._id.toString()]: { '': 1 } },
        })

        await merge(token, { [asGuest._id.toString()]: { '': 4 } })

        const cart = await cartOf(user._id)
        expect(cart[onServer._id.toString()]['']).toBe(1)
        expect(cart[asGuest._id.toString()]['']).toBe(4)
    })

    it('an empty guest cart changes nothing', async () => {
        const product = await seedProduct()
        const { user, token } = await seedCustomer({
            cartData: { [product._id.toString()]: { '': 2 } },
        })

        const response = await merge(token, {})

        expect(response.status).toBe(200)
        expect(await cartOf(user._id)).toEqual({ [product._id.toString()]: { '': 2 } })
    })
})

describe('merging caps at real inventory', () => {
    it('never exceeds what is in stock, and reports what it capped', async () => {
        const product = await seedProduct({ inventory: { '': 4 } })
        const { user, token } = await seedCustomer({
            cartData: { [product._id.toString()]: { '': 3 } },
        })

        const response = await merge(token, { [product._id.toString()]: { '': 3 } })

        expect(response.body.cartData[product._id.toString()]['']).toBe(4)
        expect((await cartOf(user._id))[product._id.toString()]['']).toBe(4)
        // `toMatchObject`: a capped entry also names the canonical `variantId`
        // since the lossless cart change, which is additive.
        expect(response.body.capped).toHaveLength(1)
        expect(response.body.capped[0]).toMatchObject(
            { productId: product._id.toString(), variantKey: '', requested: 6, available: 4 },
        )
    })

    it('caps a hyphenated combination against the row the customer actually chose (DB-003)', async () => {
        // The whole reason variant identity was restructured: splitting
        // "16-inch-1TB" on "-" cannot recover ["16-inch", "1TB"], so a cap
        // computed from the split key would cap against the wrong row, or none.
        const product = await seedProduct({
            variants: [
                { name: 'Size', options: ['14-inch', '16-inch'] },
                { name: 'Storage', options: ['512GB', '1TB'] },
            ],
            inventory: { '14-inch-512GB': 9, '14-inch-1TB': 9, '16-inch-512GB': 9, '16-inch-1TB': 2 },
        })
        const { token } = await seedCustomer()

        const response = await merge(token, { [product._id.toString()]: { '16-inch-1TB': 7, '14-inch-512GB': 1 } })

        expect(response.body.cartData[product._id.toString()]['16-inch-1TB']).toBe(2)
        expect(response.body.cartData[product._id.toString()]['14-inch-512GB']).toBe(1)
    })

    it('keeps the intent for a combination the catalog cannot resolve', async () => {
        // Same rule `addToCart` follows: a cart is an intention, not a
        // reservation, and checkout is the enforcement point. Silently dropping
        // the line here would lose the customer's choice with no explanation.
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 5 },
        })
        const { token } = await seedCustomer()

        const response = await merge(token, { [product._id.toString()]: { Withdrawn: 2 } })

        expect(response.status).toBe(200)
        expect(response.body.cartData[product._id.toString()].Withdrawn).toBe(2)
    })

    it('caps an archived product to nothing rather than resolving against it', async () => {
        const product = await seedProduct({ archived: true, inventory: { '': 5 } })
        const { token } = await seedCustomer()

        // Archived means "not purchasable", so the catalog cannot identify it
        // and the line survives as an intention — exactly like an unresolvable
        // combination. Checkout refuses it there.
        const response = await merge(token, { [product._id.toString()]: { '': 2 } })
        expect(response.status).toBe(200)
        expect(response.body.cartData[product._id.toString()]['']).toBe(2)
    })
})

describe('merging is one safe server operation', () => {
    it('rejects a malformed cart without writing anything', async () => {
        const product = await seedProduct()
        const { user, token } = await seedCustomer({
            cartData: { [product._id.toString()]: { '': 2 } },
        })

        for (const bad of [
            { 'not-an-object-id': { '': 1 } },
            { [product._id.toString()]: { '': -3 } },
            { [product._id.toString()]: { '': 'many' } },
            { [product._id.toString()]: 'nonsense' },
        ]) {
            const response = await merge(token, bad)
            expect(response.status, JSON.stringify(bad)).toBe(400)
        }

        expect(await cartOf(user._id)).toEqual({ [product._id.toString()]: { '': 2 } })
    })

    it('refuses an operator object in the cart map (SEC-006)', async () => {
        const { token } = await seedCustomer()
        const response = await merge(token, { $ne: null })
        expect(response.status).toBe(400)
    })

    it('rejects an implausibly large payload', async () => {
        const { user, token } = await seedCustomer()
        const cart = {}
        for (let i = 0; i < 250; i += 1) {
            cart[`5eed${String(i).padStart(20, '0')}`] = { '': 1 }
        }

        const response = await merge(token, cart)
        expect(response.status).toBe(400)
        expect(await cartOf(user._id)).toEqual({})
    })

    it('requires authentication', async () => {
        const response = await api().post('/api/cart/merge').send({ cart: {} })
        expect(response.status).toBe(401)
    })

    it('refuses unknown fields', async () => {
        const { token } = await seedCustomer()
        const response = await api()
            .post('/api/cart/merge')
            .set('token', token)
            .send({ cart: {}, userId: '5eed00000000000000000001' })
        expect(response.status).toBe(400)
    })
})
