// PHASE 0–2 PRE-COMMIT — one currency, enforced (DB-004).
//
// `lib/money.js` declares `SUPPORTED_CURRENCIES = ['USD']` and says in its own
// header that this "is not multi-currency support… the `currency` field exists
// so that the number is unambiguous, not so that it can vary". Nothing used it.
// What the code actually did:
//
//   * both schemas accepted any three-character string;
//   * migration 004 wrote `currency: product.currency ?? 'USD'`, preserving a
//     legacy `LBP` *and* converting its price with `× 100` — which is wrong for
//     a zero-decimal currency;
//   * `buildLine` inherited `product.currency` onto the order line;
//   * `createOrder` then summed those lines into a total labelled `USD`.
//
// So a catalog containing one LBP product could produce an order whose total was
// a sum of two different currencies with a USD label on it. Nothing in the
// system could have detected that afterwards.
//
// The rule now: unsupported currency means the product cannot be sold and the
// migration will not convert it. It is quarantined and reported, never
// relabelled — silently calling an LBP price "USD" is worse than refusing.

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedProduct, validAddress } from '../helpers/api.js'
import { applyMigration, migrationReports } from '../../migrations/runner.js'
import { m004 } from '../../migrations/index.js'
import orderModel from '../../models/orderModel.js'
import productModel from '../../models/productModel.js'
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, isSupportedCurrency } from '../../lib/money.js'

useTestDatabase()

const col = (name) => mongoose.connection.db.collection(name)

const order = (token, items) => api().post('/api/order/place').set('token', token)
    .send({ items, address: validAddress, paymentMethod: 'COD' })

/** A product carrying a currency the system does not support, written raw. */
async function insertForeignProduct(currency = 'LBP') {
    const _id = new ObjectId()
    await col('products').insertOne({
        _id,
        name: `Priced in ${currency}`,
        description: 'A legacy product from before the single-currency rule.',
        price: 1500000,
        currency,
        brand: 'Netronix',
        image: ['data:image/svg+xml;base64,PHN2Zy8+'],
        variants: [],
        inventory: { '': 5 },
        inventoryV2: [{ variantId: '', legacyKey: '', options: {}, quantity: 5 }],
        tags: ['Accessories'],
        date: 1785585600000,
        archived: false,
    })
    return _id
}

describe('the supported set is one currency and the code says so', () => {
    it('exposes exactly USD', () => {
        expect(SUPPORTED_CURRENCIES).toEqual([DEFAULT_CURRENCY])
        expect(isSupportedCurrency('USD')).toBe(true)
        expect(isSupportedCurrency('usd')).toBe(true)
        expect(isSupportedCurrency('LBP')).toBe(false)
        expect(isSupportedCurrency('')).toBe(false)
        expect(isSupportedCurrency(undefined)).toBe(false)
    })
})

describe('the schemas refuse a currency the system cannot hold', () => {
    it('refuses to create a product in another currency', async () => {
        await expect(productModel.create({
            name: 'Foreign', description: 'x', price: 10, image: ['a'],
            currency: 'LBP', inventory: { '': 1 }, date: 1785585600000,
        })).rejects.toThrow(/currency/i)
    })

    it('refuses to create an order in another currency', async () => {
        await expect(orderModel.create({
            orderNumber: 9001,
            items: [{
                productId: new ObjectId(), name: 'x', unitPrice: 1, unitPriceMinor: 100,
                quantity: 1, lineTotal: 1, lineTotalMinor: 100,
            }],
            amount: 1, currency: 'LBP', address: validAddress, paymentMethod: 'COD',
        })).rejects.toThrow(/currency/i)
    })

    it('still defaults to USD when nothing is said', async () => {
        const product = await seedProduct()
        expect(product.currency).toBe(DEFAULT_CURRENCY)
    })
})

describe('a product in an unsupported currency cannot be sold', () => {
    it('refuses the order rather than mislabelling the line', async () => {
        const productId = await insertForeignProduct()
        const { token } = await seedCustomer()

        const response = await order(token, [{ productId: String(productId), size: '', quantity: 1 }])

        expect(response.status).toBe(409)
        expect(response.body.message).toMatch(/not available|cannot be sold|not currently priced/i)
        expect(await orderModel.countDocuments({})).toBe(0)

        // And nothing was reserved on the way to refusing.
        const after = await col('products').findOne({ _id: productId })
        expect(after.inventoryV2[0].quantity).toBe(5)
    })

    it('refuses the whole order when only one line is foreign, reserving nothing', async () => {
        const good = await seedProduct({ inventory: { '': 7 } })
        const foreignId = await insertForeignProduct()
        const { token } = await seedCustomer()

        const response = await order(token, [
            { productId: String(good._id), size: '', quantity: 1 },
            { productId: String(foreignId), size: '', quantity: 1 },
        ])

        expect(response.status).toBe(409)
        expect(await orderModel.countDocuments({})).toBe(0)
        // The transaction rolled the first line's reservation back with it.
        const afterGood = await productModel.findById(good._id).lean()
        expect(afterGood.inventoryV2.find((e) => e.variantId === '').quantity).toBe(7)
    })
})

describe('every line and total an order writes is canonical', () => {
    it('labels each line and the order itself USD', async () => {
        const product = await seedProduct({ inventory: { '': 5 } })
        const { token } = await seedCustomer()

        const response = await order(token, [{ productId: String(product._id), size: '', quantity: 2 }])
        expect(response.status, JSON.stringify(response.body)).toBe(201)

        const stored = await orderModel.findById(response.body.order._id).lean()
        expect(stored.currency).toBe(DEFAULT_CURRENCY)
        for (const line of stored.items) expect(line.currency).toBe(DEFAULT_CURRENCY)
    })
})

describe('migration 004 quarantines rather than converting', () => {
    it('does not write priceMinor for a product in another currency', async () => {
        const productId = await insertForeignProduct()
        await col('products').updateOne({ _id: productId }, { $unset: { priceMinor: '' } })

        await applyMigration(m004, { connection: mongoose.connection, direction: 'up' })

        const after = await col('products').findOne({ _id: productId })
        expect(after.priceMinor).toBeUndefined()
        // Not relabelled: calling an LBP price "USD" is the failure, not the fix.
        expect(after.currency).toBe('LBP')
        expect(after.currencyQuarantined).toBe(true)
    })

    it('reports it, by product and by value', async () => {
        const productId = await insertForeignProduct('EUR')
        await applyMigration(m004, { connection: mongoose.connection, direction: 'up' })

        const reports = await migrationReports(mongoose.connection, { migrationId: m004.id })
        const entries = reports.flatMap((doc) => doc.entries)
        const entry = entries.find((e) => e.kind === 'unsupported-currency' && e.productId === String(productId))

        expect(entry).toBeTruthy()
        expect(entry.currency).toBe('EUR')
        expect(entry.reason).toMatch(/not converted/i)
    })

    it('leaves a legacy order in another currency unconverted and reported', async () => {
        const _id = new ObjectId()
        await col('orders').insertOne({
            _id,
            orderNumber: 1500,
            items: [{ productId: new ObjectId(), size: '', quantity: 1, unitPrice: 1000 }],
            amount: 1500000, subtotal: 1499997, delivery_fee: 3,
            currency: 'LBP',
            address: validAddress, status: 'Order Placed', paymentMethod: 'COD',
            payment: false, date: new Date('2026-01-01'),
        })

        await applyMigration(m004, { connection: mongoose.connection, direction: 'up' })

        const after = await col('orders').findOne({ _id })
        expect(after.amountMinor).toBeUndefined()
        expect(after.subtotalMinor).toBeUndefined()
        expect(after.currency).toBe('LBP')
        expect(after.currencyQuarantined).toBe(true)
        expect(after.items[0].unitPriceMinor).toBeUndefined()

        const entries = (await migrationReports(mongoose.connection, { migrationId: m004.id }))
            .flatMap((doc) => doc.entries)
        expect(entries.some((e) => e.kind === 'unsupported-currency' && e.orderId === String(_id))).toBe(true)
    })

    it('still converts everything that is in USD', async () => {
        const _id = new ObjectId()
        await col('products').insertOne({
            _id, name: 'Normal', description: 'x', price: 24.99, image: ['a'],
            variants: [], inventory: { '': 1 }, tags: [], date: 1785585600000,
        })
        await insertForeignProduct()

        await applyMigration(m004, { connection: mongoose.connection, direction: 'up' })

        const converted = await col('products').findOne({ _id })
        expect(converted.priceMinor).toBe(2499)
        expect(converted.currency).toBe(DEFAULT_CURRENCY)
        expect(converted.currencyQuarantined).toBeUndefined()
    })
})
