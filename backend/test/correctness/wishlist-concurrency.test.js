import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct } from '../helpers/api.js'
import userModel from '../../models/userModel.js'

useTestDatabase()

describe('wishlist atomic updates', () => {
    it('keeps every distinct product added concurrently and deduplicates repeats', async () => {
        const { user, token } = await seedCustomer()
        const products = await Promise.all(Array.from({ length: 12 }, (_, index) =>
            seedProduct({ name: `Wishlist product ${index}` })))
        const ids = products.map((product) => String(product._id))
        const responses = await Promise.all(
            [...ids, ids[0], ids[0]].map((productId) =>
                api().post('/api/user/wishlist/add').set('token', token).send({ productId })),
        )
        expect(responses.every((response) => response.status === 200)).toBe(true)
        const stored = await userModel.findById(user._id).lean()
        expect(stored.wishlist.map(String).sort()).toEqual([...ids].sort())
    })

    it('does not lose an add while a different product is removed', async () => {
        const [firstProduct, secondProduct] = await Promise.all([
            seedProduct({ name: 'First wishlist product' }),
            seedProduct({ name: 'Second wishlist product' }),
        ])
        const first = firstProduct._id
        const second = secondProduct._id
        const { user, token } = await seedCustomer({ wishlist: [first] })
        await Promise.all([
            api().post('/api/user/wishlist/remove').set('token', token).send({ productId: String(first) }),
            api().post('/api/user/wishlist/add').set('token', token).send({ productId: String(second) }),
        ])
        const stored = await userModel.findById(user._id).lean()
        expect(stored.wishlist.map(String)).toEqual([String(second)])
    })

    it('refuses to create a dangling wishlist reference', async () => {
        const { user, token } = await seedCustomer()
        const missing = String(new mongoose.Types.ObjectId())
        const response = await api().post('/api/user/wishlist/add').set('token', token).send({ productId: missing })

        expect(response.status).toBe(404)
        expect((await userModel.findById(user._id).lean()).wishlist).toEqual([])
    })
})
