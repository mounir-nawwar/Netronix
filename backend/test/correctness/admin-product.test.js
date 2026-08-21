// PHASE 3 — the admin can correct a product instead of destroying it
// (ADM-002, ADM-004, ADM-003 API half).
//
// Roadmap task 3.14, admin plan A-3 and A-5.
//
// Nothing here contacts Cloudinary. `test/setup.js` deletes the Cloudinary
// variables, so the upload path is only exercised where a slot is *not* being
// replaced — which is the half these tests are about: an untouched slot must
// keep the URL it already has.

import { describe, it, expect, vi } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedCustomer, seedProduct } from '../helpers/api.js'
import productModel from '../../models/productModel.js'
import orderModel from '../../models/orderModel.js'

useTestDatabase()

const patch = (token, id, fields) => {
    const request = api().patch(`/api/product/${id}`).set('token', token)
    for (const [key, value] of Object.entries(fields)) request.field(key, String(value))
    return request
}

const variantProduct = () => seedProduct({
    name: 'Editable Laptop',
    price: 1999,
    variants: [
        { name: 'Size', options: ['14-inch', '16-inch'] },
        { name: 'Storage', options: ['512GB', '1TB'] },
    ],
    inventory: { '14-inch-512GB': 1, '14-inch-1TB': 2, '16-inch-512GB': 3, '16-inch-1TB': 4 },
    image: ['https://cdn.test/one.png', 'https://cdn.test/two.png'],
    tags: ['Laptops'],
})

describe('ADM-002 — partial product update', () => {
    it('changes only the field the request names', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        const response = await patch(token, product._id, { name: 'Corrected Name' })
        expect(response.status).toBe(200)

        const after = await productModel.findById(product._id)
        expect(after.name).toBe('Corrected Name')
        // Everything else is exactly as it was. A PATCH that defaulted its way
        // to a full document would have blanked all of this.
        expect(after.description).toBe(product.description)
        expect(after.price).toBe(1999)
        expect(after.brand).toBe(product.brand)
        expect(after.tags).toEqual(['Laptops'])
        expect(after.image).toEqual(['https://cdn.test/one.png', 'https://cdn.test/two.png'])
        expect(after.inventoryV2).toHaveLength(4)
    })

    it('does not overwrite checkout inventory during an unrelated edit', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()
        const realFindById = productModel.findById.bind(productModel)
        vi.spyOn(productModel, 'findById').mockImplementationOnce(async (...args) => {
            const stale = await realFindById(...args)
            await productModel.collection.updateOne(
                { _id: product._id, 'inventoryV2.variantId': 'Size=16-inch;Storage=1TB' },
                {
                    $inc: {
                        'inventoryV2.$.quantity': -1,
                        'inventory.16-inch-1TB': -1,
                        inventoryRevision: 1,
                    },
                },
            )
            return stale
        })

        const response = await patch(token, product._id, { name: 'Edited after checkout' })
        expect(response.status).toBe(200)

        const after = await productModel.findById(product._id).lean()
        expect(after.inventoryV2.find((entry) => entry.variantId === 'Size=16-inch;Storage=1TB').quantity).toBe(3)
        expect(after.inventory['16-inch-1TB']).toBe(3)
        vi.restoreAllMocks()
    })

    it('preserves ambiguous entries and orphan legacy keys on an unrelated edit', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({
            variants: [
                { name: 'Size', options: ['16-inch', '16'] },
                { name: 'Storage', options: ['1TB', 'inch-1TB'] },
            ],
            inventory: { '16-inch-1TB': 7, retired: 4 },
        })
        const before = await productModel.findById(product._id).lean()

        const response = await patch(token, product._id, { name: 'Safe rename' })
        expect(response.status).toBe(200)

        const after = await productModel.findById(product._id).lean()
        expect(after.inventory).toEqual(before.inventory)
        expect(after.inventoryV2).toEqual(before.inventoryV2)
        expect(after.inventoryV2.filter((entry) => entry.needsReview)).not.toHaveLength(0)
        expect(after.inventory.retired).toBe(4)
    })

    it('refuses a lossy variant edit while legacy inventory remains unresolved', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({
            variants: [
                { name: 'Size', options: ['16-inch', '16'] },
                { name: 'Storage', options: ['1TB', 'inch-1TB'] },
            ],
            inventory: { '16-inch-1TB': 7, retired: 4 },
        })
        const before = await productModel.findById(product._id).lean()

        const response = await patch(token, product._id, {
            variants: JSON.stringify([{ name: 'Size', options: ['16-inch'] }]),
            inventory: JSON.stringify({ '16-inch': 0 }),
            inventoryV2: JSON.stringify([{ options: { Size: '16-inch' }, quantity: 0 }]),
        })

        expect(response.status).toBe(409)
        const after = await productModel.findById(product._id).lean()
        expect(after.inventory).toEqual(before.inventory)
        expect(after.inventoryV2).toEqual(before.inventoryV2)
        expect(after.variants).toEqual(before.variants)
    })

    it('allows an explicit review action to replace unresolved legacy stock', async () => {
        const { token } = await seedAdmin()
        const product = await seedProduct({
            variants: [
                { name: 'Size', options: ['16-inch', '16'] },
                { name: 'Storage', options: ['1TB', 'inch-1TB'] },
            ],
            inventory: { '16-inch-1TB': 7, retired: 4 },
        })

        const response = await patch(token, product._id, {
            inventoryResolution: 'resolve',
            variants: JSON.stringify([{ name: 'Size', options: ['16-inch'] }]),
            inventory: JSON.stringify({ '16-inch': 7 }),
            inventoryV2: JSON.stringify([{ options: { Size: '16-inch' }, quantity: 7 }]),
        })

        expect(response.status).toBe(200)
        const after = await productModel.findById(product._id).lean()
        expect(after.inventory).toEqual({ '16-inch': 7 })
        expect(after.inventoryV2).toHaveLength(1)
        expect(after.inventoryV2[0]).toMatchObject({ quantity: 7 })
        expect(after.inventoryV2[0].needsReview).not.toBe(true)
    })

    it('keeps both money representations in step when the price changes (DB-004)', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        await patch(token, product._id, { price: '2499.99' })

        const after = await productModel.findById(product._id)
        expect(after.price).toBe(2499.99)
        expect(after.priceMinor).toBe(249999)
    })

    it('rebuilds the matrix when the axes change, preserving surviving combinations', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        await patch(token, product._id, {
            variants: JSON.stringify([
                { name: 'Size', options: ['16-inch'] },
                { name: 'Storage', options: ['512GB', '1TB', '2TB'] },
            ]),
            inventoryV2: JSON.stringify([
                { options: { Size: '16-inch', Storage: '512GB' }, quantity: 3 },
                { options: { Size: '16-inch', Storage: '1TB' }, quantity: 4 },
                { options: { Size: '16-inch', Storage: '2TB' }, quantity: 0 },
            ]),
        })

        const after = await productModel.findById(product._id)
        const byId = Object.fromEntries(after.inventoryV2.map((e) => [e.variantId, e.quantity]))

        // The two 14-inch combinations no longer exist; the 16-inch ones kept
        // the quantities they had, and the new 2TB row was added.
        expect(Object.keys(byId).sort()).toEqual([
            'Size=16-inch;Storage=1TB', 'Size=16-inch;Storage=2TB', 'Size=16-inch;Storage=512GB',
        ])
        expect(byId['Size=16-inch;Storage=512GB']).toBe(3)
        expect(byId['Size=16-inch;Storage=1TB']).toBe(4)
        expect(byId['Size=16-inch;Storage=2TB']).toBe(0)
    })

    it('keeps existing image URLs when no file is sent', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        await patch(token, product._id, { description: 'A corrected description.' })

        const after = await productModel.findById(product._id)
        expect(after.image).toEqual(['https://cdn.test/one.png', 'https://cdn.test/two.png'])
    })

    it('clears an image slot only when asked explicitly', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        await patch(token, product._id, { clearImages: JSON.stringify([1]) })

        const after = await productModel.findById(product._id)
        expect(after.image).toEqual(['https://cdn.test/two.png'])
    })

    it('edits showcase assignments, so the homepage is administrable (FE-004)', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        await patch(token, product._id, {
            showcase: JSON.stringify([{ slot: 'featured', order: 3 }]),
        })

        const after = await productModel.findById(product._id)
        expect(after.showcase.map((s) => ({ slot: s.slot, order: s.order })))
            .toEqual([{ slot: 'featured', order: 3 }])
    })

    it('leaves order history untouched (DB-005)', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()
        const order = await orderModel.create({
            orderNumber: 5000,
            items: [{
                productId: product._id, name: 'Editable Laptop', variantId: 'Size=16-inch;Storage=1TB',
                variantKey: '16-inch-1TB', size: '16-inch-1TB', quantity: 1,
                unitPrice: 1999, unitPriceMinor: 199900, price: 1999,
                lineTotal: 1999, lineTotalMinor: 199900, currency: 'USD',
            }],
            amount: 2002, amountMinor: 200200, subtotal: 1999, subtotalMinor: 199900,
            delivery_fee: 3, deliveryFeeMinor: 300, currency: 'USD',
            address: { firstName: 'A', lastName: 'B', street: 'S', city: 'Beirut', state: 'B', zipcode: '1', country: 'LB', phone: '+961 71 000 000', email: 'a@b.test' },
            status: 'Order Placed',
            statusHistory: [{ status: 'Order Placed', at: new Date(), by: 'test' }],
            paymentMethod: 'COD', payment: false, date: new Date(), isGuestOrder: true,
        })

        await patch(token, product._id, { name: 'Renamed', price: '1' })

        const after = await orderModel.findById(order._id)
        expect(after.items[0].name).toBe('Editable Laptop')
        expect(after.items[0].unitPriceMinor).toBe(199900)
    })
})

describe('ADM-002 — the boundary holds', () => {
    it('refuses a non-admin', async () => {
        const { token } = await seedCustomer()
        const product = await variantProduct()

        const response = await patch(token, product._id, { name: 'Hijacked' })
        expect(response.status).toBe(403)
        expect((await productModel.findById(product._id)).name).toBe('Editable Laptop')
    })

    it('refuses an anonymous request', async () => {
        const product = await variantProduct()
        const response = await api().patch(`/api/product/${product._id}`).field('name', 'Hijacked')
        expect(response.status).toBe(401)
    })

    it.each([
        ['a negative price', { price: '-10' }],
        ['a non-numeric price', { price: 'lots' }],
        ['an unknown field', { category: 'Laptops' }],
        ['an empty name', { name: '   ' }],
    ])('rejects %s and changes nothing', async (_label, fields) => {
        const { token } = await seedAdmin()
        const product = await variantProduct()

        const response = await patch(token, product._id, fields)
        expect(response.status).toBe(400)

        const after = await productModel.findById(product._id)
        expect(after.name).toBe('Editable Laptop')
        expect(after.price).toBe(1999)
    })

    it('rejects a request that changes nothing at all', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()
        const response = await api().patch(`/api/product/${product._id}`).set('token', token).send({})
        expect(response.status).toBe(400)
    })

    it('is a 404 for a product that does not exist', async () => {
        const { token } = await seedAdmin()
        const response = await patch(token, '5eed00000000000000009999', { name: 'Ghost' })
        expect(response.status).toBe(404)
    })

    it('rejects a malformed id as a 400, not a CastError (SEC-009)', async () => {
        const { token } = await seedAdmin()
        const response = await patch(token, 'not-an-id', { name: 'Ghost' })
        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/CastError/)
    })

    it('rejects malformed variant JSON with a clean 400, not a SyntaxError', async () => {
        const { token } = await seedAdmin()
        const product = await variantProduct()
        const response = await patch(token, product._id, { variants: '{not json' })
        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/SyntaxError/)
    })
})

describe('ADM-004 — the whole inventory matrix in one atomic request', () => {
    const nineCombinations = () => seedProduct({
        name: 'Matrix Product',
        variants: [
            { name: 'GPU', options: ['RTX-4070', 'RTX-4080', 'RTX-4090'] },
            { name: 'RAM', options: ['16GB', '32GB', '64GB'] },
        ],
        inventory: {
            'RTX-4070-16GB': 0, 'RTX-4070-32GB': 0, 'RTX-4070-64GB': 0,
            'RTX-4080-16GB': 0, 'RTX-4080-32GB': 0, 'RTX-4080-64GB': 0,
            'RTX-4090-16GB': 0, 'RTX-4090-32GB': 0, 'RTX-4090-64GB': 0,
        },
    })

    const bulk = (token, id, entries) =>
        api().post(`/api/product/${id}/inventory`).set('token', token).send({ entries })

    it('saves nine combinations in one request', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()

        const entries = ['RTX-4070', 'RTX-4080', 'RTX-4090'].flatMap((gpu, g) =>
            ['16GB', '32GB', '64GB'].map((ram, r) => ({
                variantOptions: { GPU: gpu, RAM: ram },
                quantity: g * 3 + r + 1,
            })))

        const response = await bulk(token, product._id, entries)
        expect(response.status).toBe(200)

        const after = await productModel.findById(product._id)
        const byId = Object.fromEntries(after.inventoryV2.map((e) => [e.variantId, e.quantity]))
        expect(byId['GPU=RTX-4070;RAM=16GB']).toBe(1)
        expect(byId['GPU=RTX-4090;RAM=64GB']).toBe(9)
        // The legacy bag is kept in step by the same write (DB-003).
        expect(after.inventory['RTX-4090-64GB']).toBe(9)
    })

    it('resolves a hyphenated combination losslessly (DB-003)', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()

        await bulk(token, product._id, [{ variantKey: 'RTX-4090-32GB', quantity: 7 }])

        const after = await productModel.findById(product._id)
        const entry = after.inventoryV2.find((e) => e.variantId === 'GPU=RTX-4090;RAM=32GB')
        expect(entry.quantity).toBe(7)
    })

    it('writes nothing at all when any entry names a combination that does not exist', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()

        const response = await bulk(token, product._id, [
            { variantOptions: { GPU: 'RTX-4070', RAM: '16GB' }, quantity: 5 },
            { variantOptions: { GPU: 'RTX-5090', RAM: '16GB' }, quantity: 5 },
        ])

        expect(response.status).toBe(400)
        // The first entry was valid, and under the old one-request-per-row
        // implementation it would already have been committed.
        const after = await productModel.findById(product._id)
        expect(after.inventoryV2.every((e) => e.quantity === 0)).toBe(true)
    })

    it('rejects a negative quantity and writes nothing', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()

        const response = await bulk(token, product._id, [
            { variantOptions: { GPU: 'RTX-4070', RAM: '16GB' }, quantity: 5 },
            { variantOptions: { GPU: 'RTX-4080', RAM: '16GB' }, quantity: -1 },
        ])

        expect(response.status).toBe(400)
        const after = await productModel.findById(product._id)
        expect(after.inventoryV2.every((e) => e.quantity === 0)).toBe(true)
    })

    it('rejects the same combination twice', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()

        const response = await bulk(token, product._id, [
            { variantOptions: { GPU: 'RTX-4070', RAM: '16GB' }, quantity: 1 },
            { variantKey: 'RTX-4070-16GB', quantity: 2 },
        ])
        expect(response.status).toBe(400)
    })

    it('leaves combinations the request does not name exactly as they were', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()
        await bulk(token, product._id, [{ variantOptions: { GPU: 'RTX-4080', RAM: '32GB' }, quantity: 4 }])

        await bulk(token, product._id, [{ variantOptions: { GPU: 'RTX-4070', RAM: '16GB' }, quantity: 2 }])

        const after = await productModel.findById(product._id)
        const byId = Object.fromEntries(after.inventoryV2.map((e) => [e.variantId, e.quantity]))
        expect(byId['GPU=RTX-4080;RAM=32GB']).toBe(4)
        expect(byId['GPU=RTX-4070;RAM=16GB']).toBe(2)
    })

    it('does not restore stock checkout consumed after the admin read', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()
        await productModel.collection.updateOne(
            { _id: product._id, 'inventoryV2.variantId': 'GPU=RTX-4070;RAM=16GB' },
            { $set: { 'inventoryV2.$.quantity': 5, 'inventory.RTX-4070-16GB': 5 } },
        )
        const realFindById = productModel.findById.bind(productModel)
        vi.spyOn(productModel, 'findById').mockImplementationOnce(async (...args) => {
            const stale = await realFindById(...args)
            await productModel.collection.updateOne(
                { _id: product._id, 'inventoryV2.variantId': 'GPU=RTX-4070;RAM=16GB' },
                { $inc: { 'inventoryV2.$.quantity': -1, 'inventory.RTX-4070-16GB': -1, inventoryRevision: 1 } },
            )
            return stale
        })

        const response = await bulk(token, product._id, [
            { variantOptions: { GPU: 'RTX-4080', RAM: '32GB' }, quantity: 7 },
        ])

        expect([200, 409]).toContain(response.status)
        const after = await productModel.findById(product._id).lean()
        const byId = Object.fromEntries(after.inventoryV2.map((e) => [e.variantId, e.quantity]))
        expect(byId['GPU=RTX-4070;RAM=16GB']).toBe(4)
        if (response.status === 200) expect(byId['GPU=RTX-4080;RAM=32GB']).toBe(7)
        vi.restoreAllMocks()
    })

    it('single-row admin update rejects a stale read after checkout reserves stock', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()
        await productModel.collection.updateOne(
            { _id: product._id, 'inventoryV2.variantId': 'GPU=RTX-4070;RAM=16GB' },
            { $set: { 'inventoryV2.$.quantity': 5, 'inventory.RTX-4070-16GB': 5 } },
        )
        const realFindById = productModel.findById.bind(productModel)
        vi.spyOn(productModel, 'findById').mockImplementationOnce(async (...args) => {
            const stale = await realFindById(...args)
            await productModel.collection.updateOne(
                { _id: product._id, 'inventoryV2.variantId': 'GPU=RTX-4070;RAM=16GB' },
                { $inc: { 'inventoryV2.$.quantity': -1, 'inventory.RTX-4070-16GB': -1, inventoryRevision: 1 } },
            )
            return stale
        })

        const response = await api().post('/api/product/update-inventory').set('token', token).send({
            productId: String(product._id),
            variantKey: 'RTX-4070-16GB',
            quantity: 8,
        })
        expect(response.status).toBe(409)
        const after = await productModel.findById(product._id).lean()
        expect(after.inventoryV2.find((entry) => entry.variantId === 'GPU=RTX-4070;RAM=16GB').quantity).toBe(4)
        expect(after.inventory['RTX-4070-16GB']).toBe(4)
        vi.restoreAllMocks()
    })

    it('refuses a non-admin', async () => {
        const { token } = await seedCustomer()
        const product = await nineCombinations()
        const response = await bulk(token, product._id, [{ variantKey: 'RTX-4070-16GB', quantity: 5 }])
        expect(response.status).toBe(403)
    })

    it('rejects an empty entry list', async () => {
        const { token } = await seedAdmin()
        const product = await nineCombinations()
        expect((await bulk(token, product._id, [])).status).toBe(400)
    })
})

// ---------------------------------------------------------------------------
describe('the add endpoint accepts everything the console sends (FE-004)', () => {
    it('accepts showcase assignments on creation', async () => {
        const { token } = await seedAdmin()

        const response = await api()
            .post('/api/product/add')
            .set('token', token)
            .field('name', 'Showcased Product')
            .field('description', 'Created with a homepage placement.')
            .field('price', '499')
            .field('brand', 'Netronix')
            .field('bestSeller', 'false')
            .field('variants', JSON.stringify([{ name: 'Colour', options: ['Black'] }]))
            .field('inventory', JSON.stringify({ Black: 3 }))
            .field('inventoryV2', JSON.stringify([{ options: { Colour: 'Black' }, quantity: 3 }]))
            .field('tags', JSON.stringify(['Accessories']))
            .field('showcase', JSON.stringify([{ slot: 'featured', order: 4 }]))

        expect(response.status).toBe(201)

        const created = await productModel.findOne({ name: 'Showcased Product' })
        expect(created.showcase.map((entry) => ({ slot: entry.slot, order: entry.order })))
            .toEqual([{ slot: 'featured', order: 4 }])
    })

    it('defaults to no placement when the field is absent', async () => {
        const { token } = await seedAdmin()

        const response = await api()
            .post('/api/product/add')
            .set('token', token)
            .field('name', 'Unplaced Product')
            .field('description', 'No homepage placement.')
            .field('price', '99')
            .field('variants', JSON.stringify([]))
            .field('inventory', JSON.stringify({ '': 5 }))
            .field('tags', JSON.stringify(['Accessories']))

        expect(response.status).toBe(201)
        expect((await productModel.findOne({ name: 'Unplaced Product' })).showcase).toEqual([])
    })

    it('refuses a slot outside the vocabulary', async () => {
        const { token } = await seedAdmin()

        const response = await api()
            .post('/api/product/add')
            .set('token', token)
            .field('name', 'Bad Placement')
            .field('description', 'A slot that does not exist.')
            .field('price', '99')
            .field('variants', JSON.stringify([]))
            .field('inventory', JSON.stringify({ '': 1 }))
            .field('tags', JSON.stringify(['Accessories']))
            .field('showcase', JSON.stringify([{ slot: 'front-page-takeover', order: 0 }]))

        expect(response.status).toBe(400)
        expect(await productModel.findOne({ name: 'Bad Placement' })).toBeNull()
    })
})
