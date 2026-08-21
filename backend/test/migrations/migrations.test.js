// MIGRATIONS — every `up()` and its `down()`, against ephemeral local data.
//
// Findings: DB-002, DB-003, DB-004, DB-005, DB-006, DB-007, DB-008, DB-009,
//           DB-010, DB-011, BE-010.
//
// Two rules the audit is explicit about, and both are asserted here rather than
// asserted about:
//
//   * **Every migration ships a tested `down()`.** Untested rollback is no
//     rollback. Each block below builds a pre-migration fixture, runs `up()`,
//     asserts what changed, runs `down()`, and asserts the fixture is back.
//   * **Nothing is guessed.** Where a transformation has no algorithmic answer —
//     an ambiguous hyphenated variant key, a duplicate order number, a malformed
//     id, an out-of-enum status — the migration must *report* it. Those reports
//     are asserted by content, not by existence.
//
// ## Where this runs
//
// The in-memory replica set created by `test/helpers/db.js`, on loopback, in a
// database called `netronix_test`. `migrations/safety.js` refuses anything else
// and `safety.test.js` proves it. No persistent or external database is ever
// contacted by this file.
//
// Fixtures are written with the **raw driver**, deliberately: Mongoose would
// apply the Phase 2 schema defaults and derive the very fields these migrations
// exist to add, so a fixture built through the model could not be pre-migration.

import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

import { useTestDatabase, applyTestMigrations } from '../helpers/db.js'
import { applyMigration, migrationReports, appliedMigrationIds, MIGRATIONS_COLLECTION, REPORTS_COLLECTION } from '../../migrations/runner.js'
import migrations, { m001, m002, m003, m004, m005, m006, m007, m008 } from '../../migrations/index.js'
import { UNIQUE_INDEX_NAME } from '../../migrations/003_order_number_counter.js'
import { INDEXES } from '../../migrations/001_indexes.js'
import { SHOWCASE_SLOTS } from '../../lib/showcase.js'
import { ORDER_NUMBER_SEQUENCE } from '../../models/counterModel.js'

useTestDatabase()

const connection = () => mongoose.connection
const db = () => mongoose.connection.db
const col = (name) => mongoose.connection.db.collection(name)

const up = (migration) => applyMigration(migration, { connection: connection(), direction: 'up', force: true })
const down = (migration) => applyMigration(migration, { connection: connection(), direction: 'down', force: true })

/** Everything a run wrote down for a human to look at. */
const reportsFor = async (migration) => {
    const docs = await migrationReports(connection(), { migrationId: migration.id })
    return docs.flatMap((doc) => doc.entries ?? [])
}

const indexNames = async (collection) =>
    (await col(collection).indexes()).map((index) => index.name)

// A pre-Phase-2 product: float price, no currency, the untyped inventory bag,
// no `inventoryV2`, no `archived`, `date` as epoch milliseconds.
const legacyProduct = (overrides = {}) => ({
    _id: new ObjectId(),
    name: 'Legacy Laptop',
    description: 'Written before Phase 2.',
    price: 1299.99,
    brand: 'Netronix',
    image: ['https://example.test/a.png'],
    variants: [
        { name: 'Size', options: ['14-inch', '16-inch'] },
        { name: 'Storage', options: ['512GB', '1TB'] },
    ],
    inventory: { '14-inch-512GB': 4, '14-inch-1TB': 2, '16-inch-512GB': 3, '16-inch-1TB': 1 },
    bestSeller: false,
    tags: ['Laptops'],
    date: 1785585600000,
    ...overrides,
})

// A pre-Phase-2 order: line is `{ productId, size, quantity }` and nothing else,
// `userId` is a string, money is a float, no status history.
const legacyOrder = (overrides = {}) => ({
    _id: new ObjectId(),
    orderNumber: 1000,
    userId: undefined,
    items: [{ productId: new ObjectId(), size: '16-inch-1TB', quantity: 2 }],
    amount: 2602.98,
    subtotal: 2599.98,
    delivery_fee: 3,
    address: {
        firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
        street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
        zipcode: '2022', country: 'Lebanon', phone: '+961 71 000 000',
    },
    status: 'Order Placed',
    paymentMethod: 'COD',
    payment: false,
    date: new Date('2026-08-10T07:30:00.000Z'),
    isGuestOrder: true,
    ...overrides,
})

beforeEach(async () => {
    // Bring index state back to "everything applied" after a test that rolled
    // something back, then clear the ledger so each test starts from nothing
    // applied. `clearTestDatabase` has already emptied every document.
    await applyTestMigrations({ force: true })
    await col(MIGRATIONS_COLLECTION).deleteMany({})
    await col(REPORTS_COLLECTION).deleteMany({})
    await col('counters').deleteMany({})
})

// ---------------------------------------------------------------------------
describe('the runner keeps an honest ledger', () => {
    it('records what it applied and forgets it again on the way down', async () => {
        expect(await appliedMigrationIds(connection())).toEqual([])

        await applyMigration(m001, { connection: connection(), direction: 'up' })
        expect(await appliedMigrationIds(connection())).toEqual([m001.id])

        // Re-running an applied migration is a no-op by the ledger.
        const repeat = await applyMigration(m001, { connection: connection(), direction: 'up' })
        expect(repeat.skipped).toBe(true)

        await applyMigration(m001, { connection: connection(), direction: 'down' })
        expect(await appliedMigrationIds(connection())).toEqual([])
    })

    it('runs down in reverse order, which is the only order that can undo a chain', async () => {
        const order = []
        const fake = ['a', 'b', 'c'].map((id) => ({
            id, name: id, findings: ['X'], rollback: 'x'.repeat(50),
            up: async () => order.push(`up:${id}`),
            down: async () => order.push(`down:${id}`),
        }))

        const { runMigrations } = await import('../../migrations/runner.js')
        await runMigrations(fake, { connection: connection(), direction: 'up' })
        await runMigrations(fake, { connection: connection(), direction: 'down' })

        expect(order).toEqual(['up:a', 'up:b', 'up:c', 'down:c', 'down:b', 'down:a'])
    })
})

// ---------------------------------------------------------------------------
describe('001 — query indexes (DB-006, BE-010)', () => {
    it('creates every declared index, and down() drops exactly those', async () => {
        // Dropped directly rather than through `down()`: since the pre-commit
        // pass, `down()` drops only the indexes `up()` recorded **creating**, so
        // clearing the namespace has to happen outside the migration for `up()`
        // to have anything to own.
        for (const collection of ['orders', 'products']) {
            for (const name of await indexNames(collection)) {
                if (name !== '_id_') await db().collection(collection).dropIndex(name)
            }
        }
        expect(await indexNames('orders')).not.toContain('userId_1_date_-1')

        await up(m001)

        for (const [collection, , options] of INDEXES) {
            expect(await indexNames(collection)).toContain(options.name)
        }

        await down(m001)
        for (const [collection, , options] of INDEXES) {
            expect(await indexNames(collection)).not.toContain(options.name)
        }
        // `_id_` is never touched. Dropping it is not something a migration may do.
        expect(await indexNames('orders')).toContain('_id_')
        expect(await indexNames('products')).toContain('_id_')

        await up(m001)
    })

    it('down() is safe to run when the indexes are already absent', async () => {
        await down(m001)
        await expect(down(m001)).resolves.toBeTruthy()
        await up(m001)
    })

    it('the orders index is actually used, not merely present', async () => {
        await up(m001)
        const userId = new ObjectId()
        await col('orders').insertMany(
            Array.from({ length: 20 }, (_, n) => legacyOrder({ _id: new ObjectId(), orderNumber: 2000 + n, userId })),
        )

        const explain = await col('orders')
            .find({ userId }).sort({ date: -1 })
            .explain('executionStats')

        // The customer's order page was a collection scan on every load.
        const plan = JSON.stringify(explain.queryPlanner?.winningPlan ?? explain)
        expect(plan).toContain('IXSCAN')
        expect(explain.executionStats?.totalDocsExamined).toBeLessThanOrEqual(20)
    })

    it('the product tag and best-seller lookups are indexed too', async () => {
        await up(m001)
        await col('products').insertMany(Array.from({ length: 15 }, () => legacyProduct({ _id: new ObjectId() })))

        for (const query of [{ tags: 'Laptops' }, { bestSeller: true }]) {
            const explain = await col('products').find(query).explain('queryPlanner')
            expect(JSON.stringify(explain.queryPlanner?.winningPlan ?? explain)).toContain('IXSCAN')
        }
    })

    it('creates no unique index — that is 003\'s job, after de-duplication', async () => {
        // 003 is rolled back first so that what 001 leaves behind can be seen
        // on its own; `beforeEach` has applied the whole sequence.
        await down(m003)
        await up(m001)
        const orderIndexes = await col('orders').indexes()
        const uniques = orderIndexes.filter((index) => index.unique && index.name !== '_id_')
        // The only unique index the schema itself declares is the idempotency
        // one, whose fields are new in Phase 2 and so cannot already collide.
        for (const index of uniques) {
            expect(Object.keys(index.key)).toEqual(['idempotencyScope', 'idempotencyKey'])
        }
        expect(orderIndexes.find((index) => 'orderNumber' in index.key)?.unique).toBeUndefined()

        await up(m003)
    })
})

// ---------------------------------------------------------------------------
describe('002 — order snapshots (DB-005, BE-002, FE-017)', () => {
    it('backfills a line, flags it as reconstructed, and down() restores the fixture', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)
        await up(m005) // V2 first, so the label can be recovered losslessly
        const order = legacyOrder({ items: [{ productId: product._id, size: '16-inch-1TB', quantity: 2 }] })
        await col('orders').insertOne(order)

        const before = await col('orders').findOne({ _id: order._id })
        expect(Object.keys(before.items[0]).sort()).toEqual(['productId', 'quantity', 'size'])

        await up(m002)

        const after = await col('orders').findOne({ _id: order._id })
        const line = after.items[0]
        expect(line.name).toBe('Legacy Laptop')
        expect(line.unitPriceMinor).toBe(129999)
        expect(line.lineTotalMinor).toBe(259998)
        expect(line.image).toBe('https://example.test/a.png')
        expect(line.variantLabel).toBe('Size: 16-inch, Storage: 1TB')
        expect(line.variantOptions).toEqual({ Size: '16-inch', Storage: '1TB' })
        // The honest part: this is today's catalog, not what was charged.
        expect(line._reconstructed).toBe(true)

        await down(m002)

        const restored = await col('orders').findOne({ _id: order._id })
        expect(Object.keys(restored.items[0]).sort()).toEqual(['productId', 'quantity', 'size'])
        expect(restored.items[0]).toEqual(before.items[0])
        expect(restored.schemaVersion).toBeUndefined()
    })

    it('reports a line whose product no longer exists rather than inventing one', async () => {
        const order = legacyOrder({ items: [{ productId: new ObjectId(), size: '', quantity: 1 }] })
        await col('orders').insertOne(order)

        await up(m002)

        const entries = await reportsFor(m002)
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'unresolvable-line',
            orderId: String(order._id),
        }))

        const after = await col('orders').findOne({ _id: order._id })
        expect(after.items[0].name).toBe('Unavailable product')
        expect(after.items[0].unitPriceMinor).toBe(0)
        expect(after.items[0]._reconstructed).toBe(true)
    })

    it('never strips a genuine snapshot the application wrote', async () => {
        // A line written after the migration carries no `_reconstructed` flag,
        // and `down()` must leave it completely alone — otherwise a rollback
        // would destroy real purchase records.
        const genuine = {
            productId: new ObjectId(), name: 'Real Purchase', size: '', variantKey: '',
            unitPrice: 10, unitPriceMinor: 1000, quantity: 1, lineTotal: 10, lineTotalMinor: 1000,
        }
        const order = legacyOrder({ items: [genuine] })
        await col('orders').insertOne(order)

        await up(m002)
        await down(m002)

        const after = await col('orders').findOne({ _id: order._id })
        expect(after.items[0].name).toBe('Real Purchase')
        expect(after.items[0].unitPriceMinor).toBe(1000)
    })
})

// ---------------------------------------------------------------------------
describe('003 — order-number counter and its unique index (DB-002)', () => {
    it('does not build the unique index before duplicates are resolved', async () => {
        await down(m003)
        expect(await indexNames('orders')).not.toContain(UNIQUE_INDEX_NAME)

        // Duplicates exist, exactly as a raced allocation would leave them.
        await col('orders').insertMany([
            legacyOrder({ _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'), orderNumber: 1042 }),
            legacyOrder({ _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'), orderNumber: 1042 }),
            legacyOrder({ _id: new ObjectId('cccccccccccccccccccccccc'), orderNumber: 1043 }),
        ])

        // The index cannot be built in this state at all — which is why the
        // order in `up()` is not a stylistic choice.
        await expect(col('orders').createIndex({ orderNumber: 1 }, { unique: true, name: 'proof' }))
            .rejects.toThrow()

        await up(m003)
        expect(await indexNames('orders')).toContain(UNIQUE_INDEX_NAME)
    })

    it('detects duplicates, reassigns deterministically, and reports the mapping', async () => {
        await down(m003)
        const first = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa')
        const second = new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb')
        const third = new ObjectId('cccccccccccccccccccccccc')
        await col('orders').insertMany([
            legacyOrder({ _id: first, orderNumber: 1042 }),
            legacyOrder({ _id: second, orderNumber: 1042 }),
            legacyOrder({ _id: third, orderNumber: 1043 }),
        ])

        await up(m003)

        // The oldest holder keeps the number; the rest move up from the maximum.
        expect((await col('orders').findOne({ _id: first })).orderNumber).toBe(1042)
        expect((await col('orders').findOne({ _id: second })).orderNumber).toBe(1044)
        expect((await col('orders').findOne({ _id: third })).orderNumber).toBe(1043)

        const entries = await reportsFor(m003)
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'duplicate-order-number', orderNumber: 1042, count: 2,
        }))
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'order-number-reassigned', orderId: String(second), from: 1042, to: 1044,
        }))
        // A customer may be holding the old number, so the change is on the
        // document as well as in the report.
        expect((await col('orders').findOne({ _id: second })).orderNumberHistory)
            .toEqual([{ from: 1042, to: 1044 }])
    })

    it('seeds the counter from the resulting maximum, so no number is reissued', async () => {
        await down(m003)
        await col('orders').insertMany([
            legacyOrder({ _id: new ObjectId(), orderNumber: 1042 }),
            legacyOrder({ _id: new ObjectId(), orderNumber: 1042 }),
        ])

        await up(m003)

        const counter = await col('counters').findOne({ _id: ORDER_NUMBER_SEQUENCE })
        expect(counter.seq).toBe(1043) // 1042 kept, 1043 reassigned, next is 1044
        const { nextSequenceValue } = await import('../../models/counterModel.js')
        expect(await nextSequenceValue()).toBe(1044)
    })

    it('seeds from the documented floor when there are no orders at all', async () => {
        await down(m003)
        await up(m003)
        expect((await col('counters').findOne({ _id: ORDER_NUMBER_SEQUENCE })).seq).toBe(999)
    })

    it('the counter is restart-safe: it lives in the database, not in a process', async () => {
        await up(m003)
        const { nextSequenceValue } = await import('../../models/counterModel.js')

        expect(await nextSequenceValue()).toBe(1000)
        expect(await nextSequenceValue()).toBe(1001)

        // Simulate a restart: nothing in memory survives, the counter document
        // does. Reading it back through a fresh driver handle is the same thing
        // a new process would do.
        const persisted = await db().collection('counters').findOne({ _id: ORDER_NUMBER_SEQUENCE })
        expect(persisted.seq).toBe(1001)
        expect(await nextSequenceValue()).toBe(1002)
    })

    it('down() drops the constraint and the counter but keeps the numbers issued', async () => {
        await down(m003)
        const reassigned = new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb')
        await col('orders').insertMany([
            legacyOrder({ _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'), orderNumber: 1042 }),
            legacyOrder({ _id: reassigned, orderNumber: 1042 }),
        ])
        await up(m003)
        expect((await col('orders').findOne({ _id: reassigned })).orderNumber).toBe(1043)

        await down(m003)

        expect(await indexNames('orders')).not.toContain(UNIQUE_INDEX_NAME)
        expect(await col('counters').findOne({ _id: ORDER_NUMBER_SEQUENCE })).toBeNull()
        // Deliberately NOT reverted: undoing it would recreate the duplicate and
        // invalidate a number that may already have been communicated. The
        // mapping stays in the report so the change remains auditable.
        expect((await col('orders').findOne({ _id: reassigned })).orderNumber).toBe(1043)
        expect(await reportsFor(m003)).toContainEqual(
            expect.objectContaining({ kind: 'order-number-reassigned', to: 1043 }),
        )

        await up(m003)
    })

    it('the unique index actually rejects a duplicate insert', async () => {
        await up(m003)
        await col('orders').insertOne(legacyOrder({ _id: new ObjectId(), orderNumber: 5000 }))
        await expect(col('orders').insertOne(legacyOrder({ _id: new ObjectId(), orderNumber: 5000 })))
            .rejects.toMatchObject({ code: 11000 })
    })
})

// ---------------------------------------------------------------------------
describe('004 — integer minor units (DB-004, FE-018)', () => {
    it('converts with Math.round(value * 100) and down() removes only what it added', async () => {
        const product = legacyProduct({ price: 19.99 })
        const order = legacyOrder({ amount: 1302.99, subtotal: 1299.99, delivery_fee: 3 })
        await col('products').insertOne(product)
        await col('orders').insertOne(order)

        await up(m004)

        const converted = await col('products').findOne({ _id: product._id })
        expect(converted.priceMinor).toBe(1999)
        expect(converted.currency).toBe('USD')
        // The major-unit original is untouched — nothing is dropped in Phase 2.
        expect(converted.price).toBe(19.99)

        const convertedOrder = await col('orders').findOne({ _id: order._id })
        expect(convertedOrder.amountMinor).toBe(130299)
        expect(convertedOrder.subtotalMinor).toBe(129999)
        expect(convertedOrder.deliveryFeeMinor).toBe(300)
        expect(convertedOrder.amount).toBe(1302.99)

        await down(m004)

        const restored = await col('products').findOne({ _id: product._id })
        expect(restored.priceMinor).toBeUndefined()
        expect(restored.currency).toBeUndefined()
        expect(restored.price).toBe(19.99)
        const restoredOrder = await col('orders').findOne({ _id: order._id })
        expect(restoredOrder.amountMinor).toBeUndefined()
        expect(restoredOrder.amount).toBe(1302.99)
    })

    it.each([
        [0.01, 1],
        [19.99, 1999],
        [1299.99, 129999],
        [0, 0],
        [0.1 + 0.2, 30],
    ])('converts %s to %s exactly', async (price, expected) => {
        const product = legacyProduct({ price })
        await col('products').insertOne(product)
        await up(m004)
        expect((await col('products').findOne({ _id: product._id })).priceMinor).toBe(expected)
    })

    it('reports a malformed price instead of writing 0 or NaN', async () => {
        const bad = legacyProduct({ price: Number.NaN })
        const negative = legacyProduct({ price: -5 })
        await col('products').insertMany([bad, negative])

        await up(m004)

        const entries = await reportsFor(m004)
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'malformed-price', productId: String(bad._id),
        }))
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'malformed-price', productId: String(negative._id),
        }))
        // A wrong price silently persisted is worse than a missing one.
        expect((await col('products').findOne({ _id: bad._id })).priceMinor).toBeUndefined()
        expect((await col('products').findOne({ _id: negative._id })).priceMinor).toBeUndefined()
    })

    it('does not invent a unit price for a line that never had one', async () => {
        const order = legacyOrder()
        await col('orders').insertOne(order)
        await up(m004)
        const after = await col('orders').findOne({ _id: order._id })
        expect(after.items[0].unitPriceMinor).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
describe('005 — lossless variant inventory (DB-003, ARCH-002, ARCH-003)', () => {
    it('derives V2 beside the legacy bag, and down() removes only V2', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)

        await up(m005)

        const after = await col('products').findOne({ _id: product._id })
        expect(after.inventoryV2).toHaveLength(4)
        const entry = after.inventoryV2.find((candidate) => candidate.legacyKey === '16-inch-1TB')
        expect(entry.options).toEqual({ Size: '16-inch', Storage: '1TB' })
        expect(entry.quantity).toBe(1)
        // Two-way: the identity recovers the values a `split('-')` cannot.
        expect(entry.variantId).toBe('Size=16-inch;Storage=1TB')
        // The legacy bag is the untouched original.
        expect(after.inventory).toEqual(product.inventory)

        await down(m005)

        const restored = await col('products').findOne({ _id: product._id })
        expect(restored.inventoryV2).toBeUndefined()
        expect(restored.inventory).toEqual(product.inventory)
    })

    it('resolves "RTX-4090" in both directions', async () => {
        const product = legacyProduct({
            variants: [{ name: 'GPU', options: ['RTX-4090', 'RTX-4080'] }, { name: 'RAM', options: ['32GB'] }],
            inventory: { 'RTX-4090-32GB': 7, 'RTX-4080-32GB': 2 },
        })
        await col('products').insertOne(product)

        await up(m005)

        const after = await col('products').findOne({ _id: product._id })
        const entry = after.inventoryV2.find((candidate) => candidate.options.GPU === 'RTX-4090')
        expect(entry.quantity).toBe(7)
        expect(entry.legacyKey).toBe('RTX-4090-32GB')
        expect(entry.options).toEqual({ GPU: 'RTX-4090', RAM: '32GB' })
    })

    it('reports an ambiguous legacy key and refuses to claim its quantity', async () => {
        // 16-inch × 1TB and 16 × inch-1TB both join to "16-inch-1TB". There is
        // no algorithmic answer, and guessing would move stock at random.
        const product = legacyProduct({
            variants: [{ name: 'A', options: ['16-inch', '16'] }, { name: 'B', options: ['1TB', 'inch-1TB'] }],
            inventory: { '16-inch-1TB': 9, '16-inch-inch-1TB': 2, '16-1TB': 3 },
        })
        await col('products').insertOne(product)

        await up(m005)

        const entries = await reportsFor(m005)
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'ambiguous-variant-key', productId: String(product._id), legacyKey: '16-inch-1TB',
        }))

        const after = await col('products').findOne({ _id: product._id })
        const contested = after.inventoryV2.filter((entry) => entry.legacyKey === '16-inch-1TB')
        expect(contested).toHaveLength(2)
        for (const entry of contested) {
            expect(entry.needsReview).toBe(true)
            expect(entry.quantity).toBe(0)
        }
        // The number a human has to resolve is still exactly where it was.
        expect(after.inventory['16-inch-1TB']).toBe(9)
        // The unambiguous siblings are converted normally.
        expect(after.inventoryV2.find((entry) => entry.legacyKey === '16-1TB').quantity).toBe(3)

        // Every identity is still distinct, ambiguity notwithstanding.
        const ids = after.inventoryV2.map((entry) => entry.variantId)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('reports an orphaned key rather than deleting it', async () => {
        const product = legacyProduct({ inventory: { '14-inch-512GB': 4, 'Withdrawn-Combo': 6 } })
        await col('products').insertOne(product)

        await up(m005)

        expect(await reportsFor(m005)).toContainEqual(expect.objectContaining({
            kind: 'orphan-inventory-key', legacyKey: 'Withdrawn-Combo', quantity: 6,
        }))
        expect((await col('products').findOne({ _id: product._id })).inventory['Withdrawn-Combo']).toBe(6)
    })

    it('handles a variant-less product, whose single combination is keyed by the empty string', async () => {
        const product = legacyProduct({ variants: [], inventory: { '': 5 } })
        await col('products').insertOne(product)

        await up(m005)

        const after = await col('products').findOne({ _id: product._id })
        expect(after.inventoryV2).toEqual([
            expect.objectContaining({ variantId: '', legacyKey: '', options: {}, quantity: 5 }),
        ])
    })
})

// ---------------------------------------------------------------------------
describe('006 — references, archive, and dangling cleanup (DB-007, ADM-003)', () => {
    it('casts valid string ids and down() casts them back', async () => {
        const userId = new ObjectId()
        const productId = new ObjectId()
        const order = legacyOrder({
            userId: String(userId),
            items: [{ productId: String(productId), size: '', quantity: 1 }],
        })
        await col('orders').insertOne(order)
        await col('products').insertOne(legacyProduct({ _id: productId }))

        await up(m006)

        const after = await col('orders').findOne({ _id: order._id })
        expect(after.userId).toBeInstanceOf(ObjectId)
        expect(String(after.userId)).toBe(String(userId))
        expect(after.items[0].productId).toBeInstanceOf(ObjectId)
        expect((await col('products').findOne({ _id: productId })).archived).toBe(false)

        await down(m006)

        const restored = await col('orders').findOne({ _id: order._id })
        expect(typeof restored.userId).toBe('string')
        expect(restored.userId).toBe(String(userId))
        expect(typeof restored.items[0].productId).toBe('string')
        expect((await col('products').findOne({ _id: productId })).archived).toBeUndefined()
    })

    it('reports a malformed id rather than dropping it', async () => {
        const order = legacyOrder({ userId: 'not-an-object-id' })
        await col('orders').insertOne(order)

        await up(m006)

        expect(await reportsFor(m006)).toContainEqual(expect.objectContaining({
            kind: 'malformed-reference', field: 'userId', value: 'not-an-object-id',
        }))
        // Evidence of a problem is not deleted just because it is inconvenient.
        expect((await col('orders').findOne({ _id: order._id })).userId).toBe('not-an-object-id')
    })

    it('prunes dangling wishlist and cart references, and down() restores them', async () => {
        const live = new ObjectId()
        const gone = new ObjectId()
        await col('products').insertOne(legacyProduct({ _id: live }))
        const user = {
            _id: new ObjectId(),
            name: 'Demo', email: 'demo@netronix.test', password: 'x', role: 'customer', tokenVersion: 0,
            wishlist: [String(live), String(gone)],
            cartData: { [String(live)]: { '': 1 }, [String(gone)]: { '': 2 } },
        }
        await col('users').insertOne(user)

        await up(m006)

        const after = await col('users').findOne({ _id: user._id })
        expect(after.wishlist.map(String)).toEqual([String(live)])
        expect(Object.keys(after.cartData)).toEqual([String(live)])

        const entries = await reportsFor(m006)
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'dangling-reference-pruned', field: 'wishlist[]', value: String(gone),
        }))
        expect(entries).toContainEqual(expect.objectContaining({
            kind: 'dangling-reference-pruned', field: 'cartData', value: String(gone),
        }))

        await down(m006)

        const restored = await col('users').findOne({ _id: user._id })
        expect(restored.wishlist.map(String).sort()).toEqual([String(live), String(gone)].sort())
        expect(restored.cartData[String(gone)]).toEqual({ '': 2 })
    })
})

// ---------------------------------------------------------------------------
describe('007 — status history, timestamps, cart pruning (DB-008, DB-009, DB-011)', () => {
    it('gives every order an opening event and down() removes it', async () => {
        const order = legacyOrder({ status: 'Shipped' })
        await col('orders').insertOne(order)

        await up(m007)

        const after = await col('orders').findOne({ _id: order._id })
        expect(after.statusHistory).toHaveLength(1)
        expect(after.statusHistory[0].status).toBe('Shipped')
        // Nobody knows who set it, and inventing an actor would be worse than
        // admitting that.
        expect(after.statusHistory[0].by).toBe('migration')
        expect(after.statusHistory[0].at).toEqual(order.date)
        expect(after.createdAt).toEqual(order.date)

        await down(m007)

        const restored = await col('orders').findOne({ _id: order._id })
        expect(restored.statusHistory).toBeUndefined()
        expect(restored.createdAt).toBeUndefined()
        expect(restored.status).toBe('Shipped')
    })

    it('coerces and reports an out-of-enum status, and down() puts it back', async () => {
        const order = legacyOrder({ status: 'Eaten By A Goat' })
        await col('orders').insertOne(order)

        await up(m007)

        expect(await reportsFor(m007)).toContainEqual(expect.objectContaining({
            kind: 'coerced-status', orderId: String(order._id), from: 'Eaten By A Goat', to: 'Order Placed',
        }))
        expect((await col('orders').findOne({ _id: order._id })).status).toBe('Order Placed')

        await down(m007)

        expect((await col('orders').findOne({ _id: order._id })).status).toBe('Eaten By A Goat')
    })

    it('backfills product timestamps from the epoch-millisecond date field', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)
        await up(m007)
        const after = await col('products').findOne({ _id: product._id })
        expect(after.createdAt).toEqual(new Date(product.date))
    })

    it('prunes zero-quantity cart entries, reports each, and down() restores them', async () => {
        const productId = new ObjectId()
        const user = {
            _id: new ObjectId(),
            name: 'Demo', email: 'zero@netronix.test', password: 'x', role: 'customer', tokenVersion: 0,
            wishlist: [],
            cartData: { [String(productId)]: { '512GB': 0, '1TB': 3 } },
        }
        await col('users').insertOne(user)

        await up(m007)

        const after = await col('users').findOne({ _id: user._id })
        expect(after.cartData[String(productId)]).toEqual({ '1TB': 3 })
        expect(await reportsFor(m007)).toContainEqual(expect.objectContaining({
            kind: 'zero-cart-entry-pruned', variantKey: '512GB', quantity: 0,
        }))

        await down(m007)

        expect((await col('users').findOne({ _id: user._id })).cartData[String(productId)])
            .toEqual({ '512GB': 0, '1TB': 3 })
    })

    it('drops a product entry entirely once every variant under it is zero', async () => {
        const productId = new ObjectId()
        await col('users').insertOne({
            _id: new ObjectId(),
            name: 'Demo', email: 'allzero@netronix.test', password: 'x', role: 'customer', tokenVersion: 0,
            wishlist: [], cartData: { [String(productId)]: { '512GB': 0 } },
        })

        await up(m007)

        const after = await col('users').findOne({ email: 'allzero@netronix.test' })
        expect(after.cartData).toEqual({})
    })
})

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
describe('008 — data-driven homepage showcase (FE-004, PORT-001, FE-030)', () => {
    it('gives every product an empty showcase array and assigns nothing', async () => {
        const product = legacyProduct()
        await col('products').insertOne(product)
        await down(m008)   // the beforeEach has already applied everything

        expect((await col('products').findOne({ _id: product._id })).showcase).toBeUndefined()

        await up(m008)

        const migrated = await col('products').findOne({ _id: product._id })
        expect(migrated.showcase).toEqual([])

        // The whole point: it does not guess which product is the hero one.
        // A migration that picked "the first four laptops" — or worse, the very
        // ids FE-004 is about — would be re-introducing the finding.
        const assigned = await col('products').countDocuments({ showcase: { $ne: [] } })
        expect(assigned).toBe(0)
    })

    it('leaves assignments made after it ran exactly as they are', async () => {
        const product = legacyProduct({
            showcase: [{ slot: 'featured', order: 2 }],
        })
        await col('products').insertOne(product)

        await up(m008)

        expect((await col('products').findOne({ _id: product._id })).showcase)
            .toEqual([{ slot: 'featured', order: 2 }])
    })

    // Changed in the Phase 0–2 pre-commit pass. `down()` used to unset
    // `showcase` on every product and report the assignments it destroyed; it
    // now removes only the empty array `up()` added and **keeps** assignments,
    // because an assignment is editorial data this migration never created. The
    // report says what was kept rather than what was lost.
    it('down() removes the field it added and keeps assignments it did not make', async () => {
        const bare = legacyProduct()
        const assigned = legacyProduct({ showcase: [{ slot: 'hero-video', order: 0 }] })
        await col('products').insertMany([bare, assigned])

        await up(m008)
        await down(m008)

        expect((await col('products').findOne({ _id: bare._id })).showcase).toBeUndefined()
        expect((await col('products').findOne({ _id: assigned._id })).showcase)
            .toEqual([{ slot: 'hero-video', order: 0 }])

        const entries = await reportsFor(m008)
        const kept = entries.filter((entry) => entry.kind === 'showcase-assignment-kept')
        expect(kept).toHaveLength(1)
        expect(kept[0].productId).toBe(String(assigned._id))
        expect(kept[0].showcase).toEqual([{ slot: 'hero-video', order: 0 }])
    })

    it('declares the slot vocabulary the schema enforces', async () => {
        expect(m008.SHOWCASE_SLOTS ?? SHOWCASE_SLOTS).toEqual(SHOWCASE_SLOTS)
        expect(SHOWCASE_SLOTS).toEqual(['featured-product', 'hero-video', 'featured', 'shop-the-look'])
    })

    it('refuses a slot outside the vocabulary at the schema level', async () => {
        const { default: productModel } = await import('../../models/productModel.js')
        const invalid = new productModel({
            ...legacyProduct(), _id: new ObjectId(),
            showcase: [{ slot: 'front-page-takeover', order: 0 }],
        })
        await expect(invalid.save()).rejects.toThrow(/showcase/)
    })
})

describe('the whole sequence round-trips', () => {
    it('up then down returns a pre-Phase-2 fixture to its original shape', async () => {
        const { runMigrations } = await import('../../migrations/runner.js')

        const product = legacyProduct()
        // The authentic pre-Phase-2 encoding: `items` was an untyped array and
        // `userId` was a `String`, so both ids are strings on a real legacy
        // document. That is also what makes this round-trip meaningful — 002
        // has to resolve the product before 006 has cast anything.
        const order = legacyOrder({
            userId: String(new ObjectId()),
            items: [{ productId: String(product._id), size: '16-inch-1TB', quantity: 2 }],
        })
        await col('products').insertOne(product)
        await col('orders').insertOne(order)

        const productBefore = await col('products').findOne({ _id: product._id })
        const orderBefore = await col('orders').findOne({ _id: order._id })

        await runMigrations(migrations, { connection: connection(), direction: 'up', force: true })

        // Everything Phase 2 adds is there.
        const migrated = await col('products').findOne({ _id: product._id })
        expect(migrated.priceMinor).toBe(129999)
        expect(migrated.inventoryV2).toHaveLength(4)
        expect(migrated.archived).toBe(false)
        const migratedOrder = await col('orders').findOne({ _id: order._id })
        // Resolved through the string id, before 006 cast it — which is the
        // ordering this fixture exists to prove.
        expect(migratedOrder.items[0].name).toBe('Legacy Laptop')
        expect(migratedOrder.items[0].unitPriceMinor).toBe(129999)
        expect(migratedOrder.items[0].variantOptions).toEqual({ Size: '16-inch', Storage: '1TB' })
        expect(migratedOrder.items[0].productId).toBeInstanceOf(ObjectId)
        expect(migratedOrder.userId).toBeInstanceOf(ObjectId)
        expect(migratedOrder.statusHistory).toHaveLength(1)

        await runMigrations(migrations, { connection: connection(), direction: 'down', force: true })

        const productAfter = await col('products').findOne({ _id: product._id })
        const orderAfter = await col('orders').findOne({ _id: order._id })

        expect(productAfter).toEqual(productBefore)
        // The one documented asymmetry: a reassigned order number is not
        // reverted. This fixture has no duplicate, so the order is exact.
        expect(orderAfter).toEqual(orderBefore)

        await applyTestMigrations({ force: true })
    })
})
