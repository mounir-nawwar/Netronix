// PHASE 0–2 PRE-COMMIT — variant identity is never guessed and never duplicated
// (DB-003, ARCH-002, ARCH-003).
//
// Two confirmed blockers that interlock.
//
// **Duplicates multiply stock decrements.** Product validation checked the
// *shape* of `inventoryV2` and nothing else: not that each combination's
// canonical identity is unique, not that its option values belong to a declared
// axis, not that the matrix is complete. `orderService.reserve` then decrements
// with `$map` over **every** row whose `variantId` matches, while
// `resolveVariant` reads the **first**. So a product with the same combination
// listed twice sold one unit and took two off the shelf, and the two rows
// disagreed from then on.
//
// **Ambiguity is guessed.** `labelFor` resolved a legacy key with
// `.find(candidate => candidate.legacyKey === key)` — the first match. For a
// catalog that really contains `["16-inch","16"] × ["1TB","inch-1TB"]`, both
// combinations produce the key `16-inch-1TB`, so a cart line was labelled with
// whichever happened to be first. `resolveVariant` refuses that ambiguity; the
// label helper quietly resolved it anyway, which is worse than refusing because
// it looks like an answer.

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedCustomer, seedProduct, validAddress } from '../helpers/api.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'
import { labelFor, canonicalVariantId, normaliseInventoryV2, VariantResolutionError } from '../../lib/variant.js'

useTestDatabase()

const col = (name) => mongoose.connection.db.collection(name)

/**
 * The collision, written down. Both `16-inch` + `1TB` and `16` + `inch-1TB`
 * join to `16-inch-1TB`, and every value in it is one this catalog really sells.
 */
const COLLIDING_VARIANTS = [
    { name: 'Screen', options: ['16-inch', '16'] },
    { name: 'Storage', options: ['1TB', 'inch-1TB'] },
]

const addProduct = (token, fields) => {
    const request = api().post('/api/product/add').set('token', token)
        .field('name', fields.name ?? 'Test Product')
        .field('description', fields.description ?? 'A product.')
        .field('price', String(fields.price ?? 100))
        .field('brand', 'Netronix')
        .field('variants', JSON.stringify(fields.variants ?? []))
        .field('inventory', JSON.stringify(fields.inventory ?? {}))
        .field('tags', JSON.stringify(['Accessories']))
    if (fields.inventoryV2 !== undefined) request.field('inventoryV2', JSON.stringify(fields.inventoryV2))
    return request
}

// ---------------------------------------------------------------------------
describe('normaliseInventoryV2', () => {
    const variants = [{ name: 'Colour', options: ['Black', 'White'] }]

    it('refuses two entries naming the same combination', () => {
        expect(() => normaliseInventoryV2(variants, [
            { options: { Colour: 'Black' }, quantity: 3 },
            { options: { Colour: 'Black' }, quantity: 9 },
        ])).toThrow(VariantResolutionError)
    })

    it('refuses a duplicate that only differs in the order the axes were named', () => {
        const twoAxes = [{ name: 'Colour', options: ['Black'] }, { name: 'Size', options: ['L'] }]
        expect(() => normaliseInventoryV2(twoAxes, [
            { options: { Colour: 'Black', Size: 'L' }, quantity: 1 },
            { options: { Size: 'L', Colour: 'Black' }, quantity: 2 },
        ])).toThrow(/more than once/i)
    })

    it('refuses an option value the axis does not declare', () => {
        expect(() => normaliseInventoryV2(variants, [
            { options: { Colour: 'Chartreuse' }, quantity: 1 },
        ])).toThrow(/Chartreuse/)
    })

    it('refuses an axis the product does not declare', () => {
        expect(() => normaliseInventoryV2(variants, [
            { options: { Colour: 'Black', Loudness: '11' }, quantity: 1 },
        ])).toThrow(/Loudness/)
    })

    it('completes a partial matrix with zero rather than leaving a hole', () => {
        const entries = normaliseInventoryV2(variants, [{ options: { Colour: 'Black' }, quantity: 4 }])
        expect(entries.map((e) => [e.variantId, e.quantity]))
            .toEqual([['Colour=Black', 4], ['Colour=White', 0]])
    })

    it('derives the identity and the legacy key rather than trusting the caller', () => {
        const [entry] = normaliseInventoryV2(variants, [{ options: { Colour: 'Black' }, quantity: 1 }])
        expect(entry.variantId).toBe(canonicalVariantId({ Colour: 'Black' }))
        expect(entry.legacyKey).toBe('Black')
    })

    it('handles a product with no axes at all', () => {
        const entries = normaliseInventoryV2([], [{ options: {}, quantity: 7 }])
        expect(entries).toEqual([expect.objectContaining({ variantId: '', legacyKey: '', quantity: 7 })])
    })
})

// ---------------------------------------------------------------------------
describe('the add endpoint refuses a matrix that cannot be trusted', () => {
    it('rejects a duplicated combination', async () => {
        const { token } = await seedAdmin()
        const response = await addProduct(token, {
            name: 'Duplicated', variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 3 },
            inventoryV2: [
                { options: { Colour: 'Black' }, quantity: 3 },
                { options: { Colour: 'Black' }, quantity: 5 },
            ],
        })

        expect(response.status).toBe(400)
        expect(await productModel.countDocuments({ name: 'Duplicated' })).toBe(0)
    })

    it('rejects an option value that is not on the axis', async () => {
        const { token } = await seedAdmin()
        const response = await addProduct(token, {
            name: 'Off-axis', variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 3 },
            inventoryV2: [{ options: { Colour: 'Vermilion' }, quantity: 3 }],
        })
        expect(response.status).toBe(400)
    })

    it('still accepts a well-formed matrix, completed', async () => {
        const { token } = await seedAdmin()
        const response = await addProduct(token, {
            name: 'Well formed', variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 3, White: 1 },
            inventoryV2: [{ options: { Colour: 'Black' }, quantity: 3 }],
        })

        expect(response.status).toBe(201)
        const created = await productModel.findOne({ name: 'Well formed' }).lean()
        expect(created.inventoryV2.map((e) => [e.variantId, e.quantity]))
            .toEqual([['Colour=Black', 3], ['Colour=White', 0]])
    })
})

// ---------------------------------------------------------------------------
describe('the model refuses to store a duplicated combination', () => {
    it('rejects on save', async () => {
        await expect(productModel.create({
            name: 'Raw duplicate', description: 'x', price: 10, image: ['a'],
            date: 1785585600000,
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 4 },
            inventoryV2: [
                { options: { Colour: 'Black' }, quantity: 2, variantId: 'Colour=Black', legacyKey: 'Black' },
                { options: { Colour: 'Black' }, quantity: 2, variantId: 'Colour=Black', legacyKey: 'Black' },
            ],
        })).rejects.toThrow(/more than once|duplicate/i)
    })
})

// ---------------------------------------------------------------------------
describe('a product that already holds duplicate rows cannot be sold twice over', () => {
    /** Written raw, because every validating path now refuses to produce this. */
    async function insertDuplicateRowProduct() {
        const _id = new ObjectId()
        await col('products').insertOne({
            _id,
            name: 'Legacy duplicate', description: 'x', price: 100, priceMinor: 10000,
            currency: 'USD', image: ['a'], tags: ['Accessories'], date: 1785585600000,
            archived: false,
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 5 },
            inventoryV2: [
                { options: { Colour: 'Black' }, quantity: 5, variantId: 'Colour=Black', legacyKey: 'Black' },
                { options: { Colour: 'Black' }, quantity: 5, variantId: 'Colour=Black', legacyKey: 'Black' },
            ],
        })
        return _id
    }

    it('refuses the order instead of decrementing both rows', async () => {
        const productId = await insertDuplicateRowProduct()
        const { token } = await seedCustomer()

        const response = await api().post('/api/order/place').set('token', token).send({
            items: [{ productId: String(productId), variantOptions: { Colour: 'Black' }, quantity: 1 }],
            address: validAddress, paymentMethod: 'COD',
        })

        expect(response.status).toBe(409)
        expect(await orderModel.countDocuments({})).toBe(0)

        const after = await col('products').findOne({ _id: productId })
        expect(after.inventoryV2.map((e) => e.quantity)).toEqual([5, 5])
    })
})

// ---------------------------------------------------------------------------
describe('an ambiguous legacy key is never resolved by picking one', () => {
    const collidingProduct = () => seedProduct({
        variants: COLLIDING_VARIANTS,
        inventory: { '16-inch-1TB': 4 },
    })

    it('labelFor returns the key itself rather than a guessed combination', async () => {
        const product = await collidingProduct()
        const label = labelFor(product, { variantKey: '16-inch-1TB' })

        // The honest answer: this key names two combinations, so no label for
        // either of them is the truth.
        expect(label).toBe('16-inch-1TB')
        expect(label).not.toMatch(/Screen:/)
        expect(label).not.toMatch(/Storage:/)
    })

    it('labelFor still labels a key that names exactly one combination', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black', 'White'] }],
            inventory: { Black: 1, White: 1 },
        })
        expect(labelFor(product, { variantKey: 'Black' })).toBe('Colour: Black')
    })

    it('checkout refuses the ambiguous line rather than choosing a combination', async () => {
        const product = await collidingProduct()
        const { token } = await seedCustomer()

        const response = await api().post('/api/order/place').set('token', token).send({
            items: [{ productId: String(product._id), size: '16-inch-1TB', quantity: 1 }],
            address: validAddress, paymentMethod: 'COD',
        })

        expect(response.status).toBe(409)
        expect(response.body.message).toMatch(/cannot be identified/i)
        expect(await orderModel.countDocuments({})).toBe(0)
    })

    it('the cart reports the line as unidentifiable, with the reason', async () => {
        const product = await collidingProduct()
        const { token } = await seedCustomer({
            cartData: { [String(product._id)]: { '16-inch-1TB': 2 } },
        })

        const response = await api().post('/api/cart/get').set('token', token).send({})

        expect(response.status).toBe(200)
        expect(response.body.cartData[String(product._id)]).toEqual({ '16-inch-1TB': 2 })
        expect(response.body.unresolvable).toEqual([
            expect.objectContaining({
                productId: String(product._id),
                variantKey: '16-inch-1TB',
                reason: 'AMBIGUOUS_VARIANT',
            }),
        ])
    })

    it('reports a key no combination produces as unknown, not ambiguous', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 1 },
        })
        const { token } = await seedCustomer({
            cartData: { [String(product._id)]: { Withdrawn: 1 } },
        })

        const response = await api().post('/api/cart/get').set('token', token).send({})
        expect(response.body.unresolvable[0].reason).toBe('UNKNOWN_VARIANT')
    })

    it('says nothing when every line resolves', async () => {
        const product = await seedProduct({ inventory: { '': 3 } })
        const { token } = await seedCustomer({ cartData: { [String(product._id)]: { '': 1 } } })

        const response = await api().post('/api/cart/get').set('token', token).send({})
        expect(response.body.unresolvable).toEqual([])
    })
})
