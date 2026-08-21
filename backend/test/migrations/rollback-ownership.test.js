// PHASE 0–2 PRE-COMMIT — rollback reverts what the migration did, and only that.
//
// Every `down()` in this directory was a collection-wide `updateMany({}, {
// $unset: … })`. That is correct for the instant after `up()` finished and wrong
// from then on, because the collection also fills with documents the running
// application creates — whose `priceMinor`, `inventoryV2`, `statusHistory`,
// `archived` and `showcase` are the record itself rather than a backfill of one.
// Rolling back destroyed a live product's price, a real audit trail, and the
// archived flag on products an administrator had deliberately archived.
//
// The fixtures below all do the same thing: run `up()`, then **use the database
// the way the application would**, then run `down()` and assert that the
// application's writes are still there.

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

import { useTestDatabase } from '../helpers/db.js'
import { applyMigration, migrationJournal, migrationReports } from '../../migrations/runner.js'
import { m001, m004, m005, m006, m007, m008 } from '../../migrations/index.js'
import { sameValue } from '../../migrations/journal.js'

useTestDatabase()

const connection = () => mongoose.connection
const db = () => mongoose.connection.db
const col = (name) => mongoose.connection.db.collection(name)

const up = (migration) => applyMigration(migration, { connection: connection(), direction: 'up' })
const down = (migration) => applyMigration(migration, { connection: connection(), direction: 'down' })

/** A pre-migration product, written raw so no schema default repairs it. */
const legacyProduct = (overrides = {}) => ({
    _id: new ObjectId(),
    name: 'Legacy Product',
    description: 'Written before Phase 2.',
    price: 24.99,
    image: ['a.png'],
    variants: [{ name: 'Colour', options: ['Black'] }],
    inventory: { Black: 3 },
    tags: ['Accessories'],
    date: 1785585600000,
    ...overrides,
})

/** A product as the application writes one *after* the migration has run. */
const modernProduct = (overrides = {}) => ({
    _id: new ObjectId(),
    name: 'Product Created After The Migration',
    description: 'Written by the running application.',
    price: 149.5,
    priceMinor: 14950,
    currency: 'USD',
    image: ['b.png'],
    variants: [{ name: 'Colour', options: ['Black', 'White'] }],
    inventory: { Black: 2, White: 1 },
    inventoryV2: [
        { variantId: 'Colour=Black', legacyKey: 'Black', options: { Colour: 'Black' }, quantity: 2 },
        { variantId: 'Colour=White', legacyKey: 'White', options: { Colour: 'White' }, quantity: 1 },
    ],
    archived: false,
    showcase: [],
    tags: ['Accessories'],
    date: 1785585600000,
    ...overrides,
})

describe('sameValue', () => {
    it('compares the shapes the journal actually stores', () => {
        expect(sameValue(1, 1)).toBe(true)
        expect(sameValue('a', 'a')).toBe(true)
        expect(sameValue(new Date(5), new Date(5))).toBe(true)
        expect(sameValue([1, { a: 2 }], [1, { a: 2 }])).toBe(true)
        expect(sameValue([1, 2], [2, 1])).toBe(false)
        expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
        expect(sameValue(null, undefined)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
describe('004 — money', () => {
    it('leaves the price of a product created after up() alone', async () => {
        const legacy = legacyProduct()
        await col('products').insertOne(legacy)
        await up(m004)

        // The application creates a product. Its `priceMinor` is its price.
        const modern = modernProduct()
        await col('products').insertOne(modern)

        await down(m004)

        const after = await col('products').findOne({ _id: modern._id })
        expect(after.priceMinor).toBe(14950)
        expect(after.currency).toBe('USD')

        // And the one it did convert is back to how it was.
        const reverted = await col('products').findOne({ _id: legacy._id })
        expect(reverted.priceMinor).toBeUndefined()
        expect(reverted.currency).toBeUndefined()
        expect(reverted.price).toBe(24.99)
    })

    it('leaves a converted product alone when its price changed after up()', async () => {
        const legacy = legacyProduct()
        await col('products').insertOne(legacy)
        await up(m004)

        // Somebody repriced it through the console.
        await col('products').updateOne({ _id: legacy._id }, { $set: { priceMinor: 999, price: 9.99 } })

        await down(m004)

        const after = await col('products').findOne({ _id: legacy._id })
        expect(after.priceMinor).toBe(999)

        const journal = await migrationJournal(connection(), { migrationId: m004.id, direction: 'down' })
        const kept = journal.map((entry) => entry.entry?.kind)
        expect(kept).toContain('post-up-write-preserved')
    })
})

// ---------------------------------------------------------------------------
describe('005 — inventoryV2', () => {
    it('does not strip the stock record off a product created after up()', async () => {
        await col('products').insertOne(legacyProduct())
        await up(m005)

        const modern = modernProduct()
        await col('products').insertOne(modern)

        await down(m005)

        const after = await col('products').findOne({ _id: modern._id })
        expect(after.inventoryV2).toHaveLength(2)
        expect(after.inventoryV2[1]).toMatchObject({ variantId: 'Colour=White', quantity: 1 })
    })

    it('still removes it from the products it converted', async () => {
        const legacy = legacyProduct()
        await col('products').insertOne(legacy)
        await up(m005)
        expect((await col('products').findOne({ _id: legacy._id })).inventoryV2).toBeTruthy()

        await down(m005)
        expect((await col('products').findOne({ _id: legacy._id })).inventoryV2).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
describe('006 — references and archive', () => {
    it('does not un-archive a product archived after up() ran', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)
        await up(m006)
        expect((await col('products').findOne({ _id: product._id })).archived).toBe(false)

        // An administrator archives it.
        await col('products').updateOne({ _id: product._id }, { $set: { archived: true, archivedAt: new Date() } })

        await down(m006)

        const after = await col('products').findOne({ _id: product._id })
        expect(after.archived, 'the rollback un-archived a product an administrator archived').toBe(true)
    })

    it('restores the wishlist and cart entries it pruned', async () => {
        const gone = new ObjectId()
        const live = legacyProduct()
        await col('products').insertOne(live)
        const user = {
            _id: new ObjectId(),
            name: 'Someone', email: 'someone@netronix.test', password: 'x',
            wishlist: [String(gone), String(live._id)],
            cartData: { [String(gone)]: { Black: 2 }, [String(live._id)]: { Black: 1 } },
        }
        await col('users').insertOne(user)

        await up(m006)
        const pruned = await col('users').findOne({ _id: user._id })
        expect(pruned.cartData[String(gone)]).toBeUndefined()
        expect(pruned.wishlist.map(String)).not.toContain(String(gone))

        await down(m006)
        const restored = await col('users').findOne({ _id: user._id })
        expect(restored.cartData[String(gone)]).toEqual({ Black: 2 })
        expect(restored.wishlist.map(String)).toContain(String(gone))
    })

    it('leaves an order created after up() with its ObjectId references', async () => {
        await col('products').insertOne(legacyProduct())
        await up(m006)

        const modern = {
            _id: new ObjectId(),
            orderNumber: 2000,
            userId: new ObjectId(),
            items: [{ productId: new ObjectId(), name: 'x', quantity: 1 }],
            amount: 10, address: {}, status: 'Order Placed', paymentMethod: 'COD', date: new Date(),
        }
        await col('orders').insertOne(modern)

        await down(m006)

        const after = await col('orders').findOne({ _id: modern._id })
        expect(after.userId).toBeInstanceOf(ObjectId)
        expect(after.items[0].productId).toBeInstanceOf(ObjectId)
    })
})

// ---------------------------------------------------------------------------
describe('007 — status history', () => {
    it('does not delete the audit trail of an order placed after up()', async () => {
        await col('orders').insertOne({
            _id: new ObjectId(), orderNumber: 1, items: [], amount: 1,
            address: {}, status: 'Order Placed', paymentMethod: 'COD', date: new Date('2026-01-01'),
        })
        await up(m007)

        const modern = {
            _id: new ObjectId(),
            orderNumber: 2100,
            items: [], amount: 10, address: {}, paymentMethod: 'COD', date: new Date(),
            status: 'Shipped',
            statusHistory: [
                { status: 'Order Placed', at: new Date('2026-08-01'), by: 'user:1' },
                { status: 'Packing', at: new Date('2026-08-02'), by: 'admin:a' },
                { status: 'Shipped', at: new Date('2026-08-03'), by: 'admin:b' },
            ],
            createdAt: new Date('2026-08-01'),
            updatedAt: new Date('2026-08-03'),
        }
        await col('orders').insertOne(modern)

        await down(m007)

        const after = await col('orders').findOne({ _id: modern._id })
        expect(after.statusHistory, 'the rollback deleted a real audit trail').toHaveLength(3)
        expect(after.status).toBe('Shipped')
    })

    it('restores a status it coerced', async () => {
        const order = {
            _id: new ObjectId(), orderNumber: 3, items: [], amount: 1, address: {},
            status: 'Teleported', paymentMethod: 'COD', date: new Date('2026-01-01'),
        }
        await col('orders').insertOne(order)

        await up(m007)
        expect((await col('orders').findOne({ _id: order._id })).status).toBe('Order Placed')

        await down(m007)
        expect((await col('orders').findOne({ _id: order._id })).status).toBe('Teleported')
    })

    it('leaves a coerced order alone when an administrator moved it on afterwards', async () => {
        const order = {
            _id: new ObjectId(), orderNumber: 4, items: [], amount: 1, address: {},
            status: 'Teleported', paymentMethod: 'COD', date: new Date('2026-01-01'),
        }
        await col('orders').insertOne(order)
        await up(m007)

        await col('orders').updateOne({ _id: order._id }, { $set: { status: 'Shipped' } })

        await down(m007)
        expect((await col('orders').findOne({ _id: order._id })).status).toBe('Shipped')
    })
})

// ---------------------------------------------------------------------------
describe('008 — showcase', () => {
    it('keeps assignments made after up() instead of discarding them', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)
        await up(m008)

        // An editor places it on the homepage.
        await col('products').updateOne(
            { _id: product._id },
            { $set: { showcase: [{ slot: 'featured', order: 0 }] } },
        )

        await down(m008)

        const after = await col('products').findOne({ _id: product._id })
        expect(after.showcase).toEqual([{ slot: 'featured', order: 0 }])

        const reports = (await migrationReports(connection(), { migrationId: m008.id }))
            .flatMap((doc) => doc.entries)
        expect(reports.some((entry) => entry.kind === 'showcase-assignment-kept')).toBe(true)
    })

    it('still removes the empty array it added', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)
        await up(m008)
        await down(m008)

        const after = await col('products').findOne({ _id: product._id })
        expect(after.showcase).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
describe('001 — indexes', () => {
    /**
     * The suite's database already carries every index — the schemas declare
     * most of them and `useTestDatabase` builds them — and `deleteMany` between
     * tests does not drop an index. So the namespace is cleared first, which is
     * what makes "who created this one" a question with an answer.
     */
    async function clearIndexes(name) {
        for (const index of await db().collection(name).indexes()) {
            if (index.name !== '_id_') await db().collection(name).dropIndex(index.name)
        }
    }

    it('does not drop an index it found already there', async () => {
        await clearIndexes('products')
        await clearIndexes('orders')

        // An operator built this one by hand, under the same name.
        await db().collection('products').createIndex({ tags: 1 }, { name: 'tags_1' })

        await up(m001)
        await down(m001)

        const names = (await db().collection('products').indexes()).map((index) => index.name)
        expect(names, 'the rollback dropped an index the migration did not create').toContain('tags_1')
        // …and it did drop one it did create.
        expect(names).not.toContain('bestSeller_1')
    })

    it('drops everything it created when it created everything', async () => {
        await clearIndexes('products')
        await clearIndexes('orders')

        await up(m001)
        expect((await db().collection('products').indexes()).map((i) => i.name)).toContain('bestSeller_1')

        await down(m001)
        expect((await db().collection('products').indexes()).map((i) => i.name)).toEqual(['_id_'])
    })

    it('records what it created, and only that', async () => {
        await clearIndexes('products')
        await clearIndexes('orders')
        await db().collection('products').createIndex({ tags: 1 }, { name: 'tags_1' })

        await up(m001)

        const owned = await migrationJournal(connection(), { migrationId: m001.id, direction: 'up', kind: 'own' })
        const created = owned.map((record) => record.target.id)
        expect(created).not.toContain('products.tags_1')
        expect(created).toContain('products.bestSeller_1')
    })
})
