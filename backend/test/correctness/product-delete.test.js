// PHASE 0–2 PRE-COMMIT — hard delete is one operation or none (DB-007, ADM-003).
//
// `removeProduct` did three separate things: count the orders referencing the
// product, delete the product, then pull it out of every cart and wishlist.
//
//   * Between the count and the delete, a checkout could create an order for
//     the product. The count said zero, the delete went ahead, and the order
//     was left pointing at a product that no longer exists — the exact drift
//     DB-007 is about, reintroduced by the endpoint meant to prevent it.
//   * The cleanup ran *after* the delete and outside any transaction, so a
//     failure there left the product gone and its id still in every cart.
//
// Both are closed by doing the whole thing in one transaction, and by **writing
// to the product first**: a concurrent checkout reserves stock by updating the
// product document, so marking it makes that checkout and this deletion contend
// for the same document instead of passing each other unnoticed.

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedCustomer, seedProduct, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'
import userModel from '../../models/userModel.js'

useTestDatabase()

const remove = (token, id) => api().post('/api/product/remove').set('token', token).send({ id: String(id) })

const place = (token, productId, quantity = 1) => api().post('/api/order/place').set('token', token).send({
    items: [{ productId: String(productId), size: '', quantity }],
    address: validAddress,
    paymentMethod: 'COD',
})

describe('a product an order references', () => {
    it('is refused, with the product and the carts untouched', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { token: customer } = await seedCustomer()
        await place(customer, product._id).expect(201)

        const { user, token: buyer } = await seedCustomer({
            cartData: { [String(product._id)]: { '': 2 } },
            wishlist: [product._id],
        })
        const { token: admin } = await seedAdmin()

        const response = await remove(admin, product._id)

        expect(response.status).toBe(409)
        expect(await productModel.exists({ _id: product._id })).toBeTruthy()

        const after = await userModel.findById(user._id).lean()
        expect(after.cartData[String(product._id)]).toEqual({ '': 2 })
        expect(after.wishlist.map(String)).toContain(String(product._id))
        expect(buyer).toBeTruthy()
    })

    it('leaves no trace of the attempt on the product', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { token: customer } = await seedCustomer()
        await place(customer, product._id).expect(201)
        const { token: admin } = await seedAdmin()

        await remove(admin, product._id).expect(409)

        const after = await productModel.findById(product._id).lean()
        expect(after.deleteInProgressAt).toBeUndefined()
    })
})

describe('a product nothing references', () => {
    it('is deleted and removed from every cart and wishlist in one go', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const keep = await seedProduct({ inventory: { '': 5 } })

        const { user: a } = await seedCustomer({
            cartData: { [String(product._id)]: { '': 1 }, [String(keep._id)]: { '': 1 } },
            wishlist: [product._id, keep._id],
        })
        const { user: b } = await seedCustomer({
            cartData: { [String(product._id)]: { '': 3 } },
            wishlist: [product._id],
        })
        const { token: admin } = await seedAdmin()

        await remove(admin, product._id).expect(200)

        expect(await productModel.exists({ _id: product._id })).toBeNull()

        for (const user of [a, b]) {
            const after = await userModel.findById(user._id).lean()
            expect(after.cartData[String(product._id)]).toBeUndefined()
            expect(after.wishlist.map(String)).not.toContain(String(product._id))
        }

        // And nothing else was disturbed.
        const first = await userModel.findById(a._id).lean()
        expect(first.cartData[String(keep._id)]).toEqual({ '': 1 })
        expect(first.wishlist.map(String)).toContain(String(keep._id))
    })

    it('still answers 404 for a product that is not there', async () => {
        const { token: admin } = await seedAdmin()
        const response = await remove(admin, new mongoose.Types.ObjectId())
        expect(response.status).toBe(404)
    })
})

describe('a deletion racing a checkout', () => {
    it('never leaves an order pointing at a product that was deleted', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { token: customer } = await seedCustomer()
        const { token: admin } = await seedAdmin()

        const [order, deletion] = await Promise.all([
            place(customer, product._id),
            remove(admin, product._id),
        ])

        const orders = await orderModel.countDocuments({ 'items.productId': product._id })
        const stillThere = Boolean(await productModel.exists({ _id: product._id }))

        // Whichever way the race goes, the invariant is the same: an order for
        // this product and the product's absence are mutually exclusive.
        expect(orders > 0 && !stillThere).toBe(false)

        // And both requests answered honestly.
        expect([200, 201, 404, 409]).toContain(order.status)
        expect([200, 404, 409]).toContain(deletion.status)
    })
})
