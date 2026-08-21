// PHASE 0–2 PRE-COMMIT — a bounded list is only safe if the client walks it.
//
// Phase 2 bounded every listing at 100 (BE-009) and kept the legacy array name
// beside the envelope so a deployed client would not break. What it did not do
// is give the clients a way to *see* the rest: the storefront and the admin
// console each issue one request and render `items`, so a catalog of 150
// products silently became a catalog of 100 and an order list of 150 silently
// became 100. Nothing reported the truncation — the envelope's `total` and
// `pages` were right there in the response and nobody read them.
//
// This file pins the server half of the contract with more than a hundred of
// each: the bound is real, the envelope is honest, and every record is
// reachable by walking. The client half is asserted in the storefront and admin
// suites.

import { describe, it, expect, beforeAll } from 'vitest'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedCustomer, validAddress } from '../helpers/api.js'
import { MAX_LIMIT, DEFAULT_LIMIT } from '../../lib/pagination.js'

useTestDatabase()

const PRODUCT_COUNT = 150
const ORDER_COUNT = 120

const col = (name) => mongoose.connection.db.collection(name)

async function seedManyProducts(count = PRODUCT_COUNT) {
    const docs = Array.from({ length: count }, (unused, index) => ({
        _id: new mongoose.Types.ObjectId(),
        name: `Bulk Product ${String(index).padStart(3, '0')}`,
        description: 'One of many.',
        price: 10 + index,
        priceMinor: (10 + index) * 100,
        currency: 'USD',
        brand: 'Netronix',
        image: ['data:image/svg+xml;base64,PHN2Zy8+'],
        variants: [],
        inventory: { '': 3 },
        inventoryV2: [{ variantId: '', legacyKey: '', options: {}, quantity: 3 }],
        tags: ['Accessories'],
        bestSeller: false,
        archived: false,
        showcase: [],
        date: 1785585600000 + index,
    }))
    await col('products').insertMany(docs)
    return docs
}

async function seedManyOrders(userId, count = ORDER_COUNT) {
    const docs = Array.from({ length: count }, (unused, index) => ({
        _id: new mongoose.Types.ObjectId(),
        orderNumber: 5000 + index,
        userId,
        items: [{
            productId: new mongoose.Types.ObjectId(),
            name: `Line ${index}`,
            quantity: 1,
            unitPrice: 10, unitPriceMinor: 1000, lineTotal: 10, lineTotalMinor: 1000,
            currency: 'USD',
        }],
        amount: 13, subtotal: 10, delivery_fee: 3,
        amountMinor: 1300, subtotalMinor: 1000, deliveryFeeMinor: 300,
        currency: 'USD',
        address: validAddress,
        status: 'Order Placed',
        statusHistory: [{ status: 'Order Placed', at: new Date(), by: 'test' }],
        paymentMethod: 'COD', payment: false,
        date: new Date(1785585600000 + index * 1000),
        isGuestOrder: false,
        schemaVersion: 2,
    }))
    await col('orders').insertMany(docs)
    return docs
}

describe('the catalog listing', () => {
    it('refuses a limit above the bound rather than quietly truncating it', async () => {
        await seedManyProducts()

        const response = await api().get('/api/product/list').query({ limit: 1000 })

        // Explicit beats silent: a client asking for 1000 and receiving 100
        // without being told has no way to know it is missing anything.
        expect(response.status).toBe(400)
    })

    it('serves exactly the bound when the bound is asked for', async () => {
        await seedManyProducts()

        const response = await api().get('/api/product/list').query({ limit: MAX_LIMIT })

        expect(response.status).toBe(200)
        expect(response.body.items).toHaveLength(MAX_LIMIT)
        expect(response.body.limit).toBe(MAX_LIMIT)
        expect(response.body.total).toBe(PRODUCT_COUNT)
    })

    it('says how much there is, so a client can know it has not seen it all', async () => {
        await seedManyProducts()

        const response = await api().get('/api/product/list')

        expect(response.body.items).toHaveLength(DEFAULT_LIMIT)
        expect(response.body.total).toBe(PRODUCT_COUNT)
        expect(response.body.pages).toBe(2)
        expect(response.body.page).toBe(1)
    })

    it('reaches every product by walking, with no repeats and no gaps', async () => {
        const seeded = await seedManyProducts()

        const seen = []
        let page = 1
        let pages = 1
        do {
            const response = await api().get('/api/product/list').query({ page, limit: 50 })
            expect(response.status).toBe(200)
            pages = response.body.pages
            seen.push(...response.body.items.map((product) => product._id))
            page += 1
        } while (page <= pages && page < 20)

        expect(seen).toHaveLength(PRODUCT_COUNT)
        expect(new Set(seen).size).toBe(PRODUCT_COUNT)
        expect(new Set(seen)).toEqual(new Set(seeded.map((doc) => String(doc._id))))
    })

    it('keeps the legacy array name in step with the envelope', async () => {
        await seedManyProducts()
        const response = await api().get('/api/product/list').query({ page: 2, limit: 100 })

        expect(response.body.products).toEqual(response.body.items)
        expect(response.body.items).toHaveLength(PRODUCT_COUNT - 100)
    })
})

describe('the order listings', () => {
    it('bounds and paginates a customer\'s own history', async () => {
        const { user, token } = await seedCustomer()
        await seedManyOrders(user._id)

        const first = await api().post('/api/order/userorders').set('token', token).send({})
        expect(first.body.items).toHaveLength(DEFAULT_LIMIT)
        expect(first.body.total).toBe(ORDER_COUNT)
        expect(first.body.pages).toBe(2)

        const second = await api().post('/api/order/userorders').set('token', token).send({}).query({ page: 2 })
        expect(second.body.items).toHaveLength(ORDER_COUNT - DEFAULT_LIMIT)

        const ids = new Set([...first.body.items, ...second.body.items].map((order) => order._id))
        expect(ids.size).toBe(ORDER_COUNT)
    })

    it('bounds and paginates the admin list', async () => {
        const { user } = await seedCustomer()
        await seedManyOrders(user._id)
        const { token } = await seedAdmin()

        const first = await api().post('/api/order/list').set('token', token).send({})
        expect(first.body.items).toHaveLength(DEFAULT_LIMIT)
        expect(first.body.total).toBe(ORDER_COUNT)

        const second = await api().post('/api/order/list').set('token', token).send({}).query({ page: 2 })
        expect(second.body.items).toHaveLength(ORDER_COUNT - DEFAULT_LIMIT)
    })
})
