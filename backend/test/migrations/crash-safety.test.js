// PHASE 0–2 PRE-COMMIT — evidence survives an interruption (DB-010, DB-002).
//
// `runner.js` inserted the report document **after** the migration returned,
// while 003 reassigned order numbers, 006 pruned dangling references and 007
// coerced statuses *during* the run. A crash in the middle therefore left the
// destructive write applied and no record of it — and 006's and 007's own
// `down()` read that record as their only source of truth, so the rollback for
// exactly the writes that had happened was the part that was missing.
//
// The journal is written before each change instead, so at every instant it is a
// superset of what has happened rather than a subset. These tests interrupt a
// migration and assert that.

import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

import { useTestDatabase } from '../helpers/db.js'
import { applyMigration, migrationJournal, appliedMigrationIds } from '../../migrations/runner.js'
import { createJournal } from '../../migrations/journal.js'
import m003, { assertQuiescent, findUnnumberedOrders, MaintenanceRequiredError, UNIQUE_INDEX_NAME } from '../../migrations/003_order_number_counter.js'
import { m006, m007 } from '../../migrations/index.js'
import { ORDER_NUMBER_SEQUENCE } from '../../models/counterModel.js'
import { retryPolicyFor } from '../../services/orderService.js'

useTestDatabase()

const connection = () => mongoose.connection
const db = () => mongoose.connection.db
const col = (name) => mongoose.connection.db.collection(name)

// The suite's database already carries the unique index — `useTestDatabase`
// runs every migration once, and `deleteMany` between tests does not drop an
// index. These tests are about the state *before* 003 has run, which is exactly
// the state in which duplicate and missing order numbers can exist.
beforeEach(async () => {
    try {
        await db().collection('orders').dropIndex(UNIQUE_INDEX_NAME)
    } catch (error) {
        if (error?.code !== 27 && error?.code !== 26) throw error
    }
})

const order = (overrides = {}) => ({
    _id: new ObjectId(),
    orderNumber: 1000,
    items: [], amount: 10, address: {}, status: 'Order Placed',
    paymentMethod: 'COD', date: new Date('2026-01-01'),
    ...overrides,
})

/**
 * The real database, with one method rigged to fail on the nth call.
 *
 * A proxy rather than a mock: every other operation is the genuine one, so what
 * is being tested is the migration against a real replica set that failed at a
 * real moment, not a simulation of one.
 */
function dbFailingAfter(collectionName, method, callsBeforeFailure) {
    let calls = 0
    return {
        collection(name) {
            const real = db().collection(name)
            if (name !== collectionName) return real
            return new Proxy(real, {
                get(target, property, receiver) {
                    const value = Reflect.get(target, property, receiver)
                    if (property !== method) {
                        return typeof value === 'function' ? value.bind(target) : value
                    }
                    return async (...args) => {
                        calls += 1
                        if (calls > callsBeforeFailure) throw new Error('the process died here')
                        return value.apply(target, args)
                    }
                },
            })
        },
    }
}

/** A context of the shape the runner builds, so `up()` is driven exactly as it is in production. */
function contextFor(migration, patchedDb) {
    const journal = createJournal(db(), { migration, direction: 'up', runId: `test-${Date.now()}` })
    return {
        db: patchedDb ?? db(),
        log: () => { },
        now: new Date(),
        report: (entry) => journal.report(entry),
        own: (record) => journal.own(record),
        journal,
    }
}

describe('an interrupted migration', () => {
    it('leaves durable evidence of the reassignment it had already made', async () => {
        const a = order({ _id: new ObjectId('000000000000000000000001'), orderNumber: 1000 })
        const b = order({ _id: new ObjectId('000000000000000000000002'), orderNumber: 1000 })
        const c = order({ _id: new ObjectId('000000000000000000000003'), orderNumber: 1000 })
        await col('orders').insertMany([a, b, c])

        // Dies on the second reassignment.
        await expect(m003.up(contextFor(m003, dbFailingAfter('orders', 'updateOne', 1))))
            .rejects.toThrow('the process died here')

        const journal = await migrationJournal(connection(), { migrationId: m003.id, direction: 'up' })
        const reassignments = journal
            .filter((entry) => entry.entry?.kind === 'order-number-reassigned')
            .map((entry) => entry.entry)

        // Both were written down before being attempted, so the record covers
        // the one that happened and the one that did not — which is the safe
        // direction to be wrong in.
        expect(reassignments.length).toBeGreaterThanOrEqual(2)
        expect(reassignments[0]).toMatchObject({ orderId: String(b._id), from: 1000 })

        // The one that did happen is visible in the data.
        expect((await col('orders').findOne({ _id: b._id })).orderNumber).toBe(1001)
    })

    it('is not recorded as applied, so a re-run completes it', async () => {
        await col('orders').insertMany([
            order({ _id: new ObjectId('000000000000000000000001'), orderNumber: 1000 }),
            order({ _id: new ObjectId('000000000000000000000002'), orderNumber: 1000 }),
        ])

        await expect(applyMigration(m003, { connection: connection(), direction: 'up' }))
            .resolves.toBeTruthy()

        expect(await appliedMigrationIds(connection())).toContain(m003.id)
    })

    it('re-runs to the same result and stays idempotent', async () => {
        await col('orders').insertMany([
            order({ _id: new ObjectId('000000000000000000000001'), orderNumber: 1000 }),
            order({ _id: new ObjectId('000000000000000000000002'), orderNumber: 1000 }),
            order({ _id: new ObjectId('000000000000000000000003'), orderNumber: 1000 }),
        ])

        await expect(m003.up(contextFor(m003, dbFailingAfter('orders', 'updateOne', 1))))
            .rejects.toThrow()

        // Restart.
        await applyMigration(m003, { connection: connection(), direction: 'up', force: true })

        const numbers = (await col('orders').find({}).sort({ _id: 1 }).toArray()).map((o) => o.orderNumber)
        expect(new Set(numbers).size).toBe(3)

        // And again: nothing moves.
        await applyMigration(m003, { connection: connection(), direction: 'up', force: true })
        const again = (await col('orders').find({}).sort({ _id: 1 }).toArray()).map((o) => o.orderNumber)
        expect(again).toEqual(numbers)

        const counter = await col('counters').findOne({ _id: ORDER_NUMBER_SEQUENCE })
        expect(counter.seq).toBe(Math.max(...numbers))
    })
})

describe('003 repairs every order number the unique index would reject', () => {
    it('finds missing, null and non-numeric ones', async () => {
        await col('orders').insertMany([
            order({ orderNumber: 1000 }),
            order({ orderNumber: undefined }),
            order({ orderNumber: null }),
            order({ orderNumber: 'A-17' }),
        ])

        const unnumbered = await findUnnumberedOrders(db())
        expect(unnumbered).toHaveLength(3)
    })

    it('assigns each one a number, reports it, and builds the index', async () => {
        await col('orders').insertMany([
            order({ _id: new ObjectId('000000000000000000000001'), orderNumber: 1000 }),
            order({ _id: new ObjectId('000000000000000000000002'), orderNumber: null }),
            order({ _id: new ObjectId('000000000000000000000003') }),
        ])
        await col('orders').updateOne({ _id: new ObjectId('000000000000000000000003') }, { $unset: { orderNumber: '' } })

        await applyMigration(m003, { connection: connection(), direction: 'up' })

        const numbers = (await col('orders').find({}).toArray()).map((o) => o.orderNumber)
        expect(numbers.every((n) => typeof n === 'number')).toBe(true)
        expect(new Set(numbers).size).toBe(3)

        const journal = await migrationJournal(connection(), { migrationId: m003.id, direction: 'up' })
        const assigned = journal.filter((entry) => entry.entry?.kind === 'order-number-assigned')
        expect(assigned).toHaveLength(2)
        expect(assigned[0].entry.reason).toMatch(/unique index cannot be built/i)

        const indexes = (await db().collection('orders').indexes()).map((index) => index.name)
        expect(indexes).toContain(UNIQUE_INDEX_NAME)
    })

    it('would have failed to build the index without that repair', async () => {
        // Two orders with no number index as two nulls, which a unique index
        // refuses. This is the state the original migration walked into.
        await col('orders').insertMany([order({ orderNumber: undefined }), order({ orderNumber: undefined })])
        await col('orders').updateMany({}, { $unset: { orderNumber: '' } })

        await expect(
            db().collection('orders').createIndex({ orderNumber: 1 }, { unique: true, name: 'proof_of_the_problem' }),
        ).rejects.toThrow()
    })
})

describe('003 fails closed when the collection is being written to', () => {
    it('refuses when the fingerprint moved', () => {
        expect(() => assertQuiescent({ count: 4, max: 1003 }, { count: 5, max: 1004 }))
            .toThrow(MaintenanceRequiredError)
        expect(() => assertQuiescent({ count: 4, max: 1003 }, { count: 4, max: 1004 }))
            .toThrow(/maintenance window/i)
    })

    it('accepts a collection that did not move', () => {
        expect(() => assertQuiescent({ count: 4, max: 1003 }, { count: 4, max: 1003 })).not.toThrow()
    })

    it('does not build the unique index when an order arrives mid-run', async () => {
        await col('orders').insertMany([
            order({ _id: new ObjectId('000000000000000000000001'), orderNumber: 1000 }),
            order({ _id: new ObjectId('000000000000000000000002'), orderNumber: 1001 }),
        ])

        // An order placed while the migration is working: the count changes
        // between the first fingerprint and the second.
        let counted = 0
        const patched = {
            collection(name) {
                const real = db().collection(name)
                if (name !== 'orders') return real
                return new Proxy(real, {
                    get(target, property, receiver) {
                        const value = Reflect.get(target, property, receiver)
                        if (property !== 'countDocuments') {
                            return typeof value === 'function' ? value.bind(target) : value
                        }
                        return async (...args) => {
                            counted += 1
                            const actual = await value.apply(target, args)
                            return counted === 1 ? actual : actual + 1
                        }
                    },
                })
            },
        }

        await expect(m003.up(contextFor(m003, patched))).rejects.toThrow(MaintenanceRequiredError)

        const indexes = (await db().collection('orders').indexes()).map((index) => index.name)
        expect(indexes, 'the unique index was built despite concurrent writes').not.toContain(UNIQUE_INDEX_NAME)
    })
})

describe('an uncertain commit is not blindly re-run', () => {
    const labelled = (label) => ({ hasErrorLabel: (name) => name === label })

    it('retries a transaction that provably aborted', () => {
        expect(retryPolicyFor(labelled('TransientTransactionError'), { hasIdempotencyKey: false })).toBe('retry')
        expect(retryPolicyFor({ codeName: 'WriteConflict' }, { hasIdempotencyKey: false })).toBe('retry')
    })

    it('refuses to re-run a keyless transaction whose commit is unknown', () => {
        expect(retryPolicyFor(labelled('UnknownTransactionCommitResult'), { hasIdempotencyKey: false }))
            .toBe('fail-uncertain')
    })

    it('resolves an uncertain commit when there is a key to resolve it with', () => {
        expect(retryPolicyFor(labelled('UnknownTransactionCommitResult'), { hasIdempotencyKey: true }))
            .toBe('resolve-or-retry')
    })

    it('does not treat an ordinary failure as retryable', () => {
        expect(retryPolicyFor(new Error('validation failed'), { hasIdempotencyKey: true })).toBe('fail')
    })
})

// ---------------------------------------------------------------------------
// The same evidence, for the other two migrations that make destructive or
// identity-changing writes. 003 renumbers orders; 006 prunes references and
// rewrites id encodings; 007 coerces statuses and deletes cart entries. All
// three write before they act, and none of them may be recorded as applied when
// they did not finish.

/** A connection the safety guard accepts, wrapping a rigged `db`. */
function connectionWith(patchedDb) {
    return { host: connection().host, name: connection().name, db: patchedDb }
}

const legacyOrder = (overrides = {}) => ({
    _id: new ObjectId(),
    orderNumber: 7000 + Math.floor(Math.random() * 1000),
    userId: String(new ObjectId()),
    items: [{ productId: String(new ObjectId()), size: 'M', quantity: 1 }],
    amount: 10,
    address: {},
    status: 'Order Placed',
    paymentMethod: 'COD',
    date: new Date('2026-01-01'),
    ...overrides,
})

describe('006 — an interrupted reference migration', () => {
    async function fixture() {
        const gone = new ObjectId()
        const live = { _id: new ObjectId(), name: 'Live', price: 10, variants: [], inventory: {}, date: 1 }
        await col('products').insertOne(live)

        const order = legacyOrder()
        await col('orders').insertOne(order)

        const users = [1, 2, 3].map((n) => ({
            _id: new ObjectId(),
            name: `User ${n}`,
            email: `crash${n}-${Date.now()}@netronix.test`,
            password: 'x',
            wishlist: [String(gone), String(live._id)],
            cartData: { [String(gone)]: { M: 2 }, [String(live._id)]: { '': 1 } },
        }))
        await col('users').insertMany(users)

        return { gone, live, order, users }
    }

    it('leaves durable prune evidence and is not recorded as applied', async () => {
        const { gone, users } = await fixture()

        // Dies on the second user, so at least one prune really happened.
        await expect(applyMigration(m006, {
            connection: connectionWith(dbFailingAfter('users', 'updateOne', 1)),
            direction: 'up',
        })).rejects.toThrow('the process died here')

        const journal = await migrationJournal(connection(), { migrationId: m006.id, direction: 'up' })
        const pruned = journal
            .filter((entry) => entry.entry?.kind === 'dangling-reference-pruned')
            .map((entry) => entry.entry)

        // Written before the write, so the record covers what happened and what
        // was about to — the safe direction to be wrong in.
        expect(pruned.length).toBeGreaterThanOrEqual(2)
        expect(pruned[0].value).toBe(String(gone))

        // Ownership for the work that landed.
        const owned = journal.filter((entry) => entry.kind === 'own')
        expect(owned.length).toBeGreaterThan(0)

        // One user really was pruned.
        const after = await col('users').find({ _id: { $in: users.map((user) => user._id) } }).toArray()
        expect(after.some((user) => user.cartData[String(gone)] === undefined)).toBe(true)

        expect(await appliedMigrationIds(connection())).not.toContain(m006.id)
    })

    it('restarts, completes, and is idempotent', async () => {
        const { gone, users } = await fixture()

        await expect(applyMigration(m006, {
            connection: connectionWith(dbFailingAfter('users', 'updateOne', 1)),
            direction: 'up',
        })).rejects.toThrow()

        await applyMigration(m006, { connection: connection(), direction: 'up' })
        expect(await appliedMigrationIds(connection())).toContain(m006.id)

        const afterFirst = await col('users').find({ _id: { $in: users.map((u) => u._id) } }).sort({ _id: 1 }).toArray()
        for (const user of afterFirst) {
            expect(user.cartData[String(gone)]).toBeUndefined()
            expect(user.wishlist.map(String)).not.toContain(String(gone))
        }

        // Again: nothing moves.
        await applyMigration(m006, { connection: connection(), direction: 'up', force: true })
        const afterSecond = await col('users').find({ _id: { $in: users.map((u) => u._id) } }).sort({ _id: 1 }).toArray()
        expect(afterSecond.map((u) => u.cartData)).toEqual(afterFirst.map((u) => u.cartData))
    })

    it('rolls back exactly what it did, including the interrupted part, and leaves live writes alone', async () => {
        const { gone, live, users } = await fixture()

        await expect(applyMigration(m006, {
            connection: connectionWith(dbFailingAfter('users', 'updateOne', 1)),
            direction: 'up',
        })).rejects.toThrow()
        await applyMigration(m006, { connection: connection(), direction: 'up' })

        // The application carries on: a product is archived, and an order is
        // placed with real ObjectId references.
        await col('products').updateOne({ _id: live._id }, { $set: { archived: true } })
        const modern = {
            _id: new ObjectId(), orderNumber: 8100, userId: new ObjectId(),
            items: [{ productId: new ObjectId(), name: 'x', quantity: 1 }],
            amount: 10, address: {}, status: 'Order Placed', paymentMethod: 'COD', date: new Date(),
        }
        await col('orders').insertOne(modern)

        await applyMigration(m006, { connection: connection(), direction: 'down' })

        // Every pruned reference is back, for every user — including the one the
        // interrupted run had already pruned.
        for (const user of users) {
            const restored = await col('users').findOne({ _id: user._id })
            expect(restored.cartData[String(gone)]).toEqual({ M: 2 })
            expect(restored.wishlist.map(String)).toContain(String(gone))
        }

        // The archive an administrator applied afterwards survives.
        expect((await col('products').findOne({ _id: live._id })).archived).toBe(true)

        // And an order written after the migration keeps its real references.
        const untouched = await col('orders').findOne({ _id: modern._id })
        expect(untouched.userId).toBeInstanceOf(ObjectId)
        expect(untouched.items[0].productId).toBeInstanceOf(ObjectId)
    })
})

describe('007 — an interrupted schema-tightening migration', () => {
    async function fixture() {
        const orders = [
            legacyOrder({ _id: new ObjectId('000000000000000000000101'), status: 'Teleported', orderNumber: 9001 }),
            legacyOrder({ _id: new ObjectId('000000000000000000000102'), status: 'Abducted', orderNumber: 9002 }),
            legacyOrder({ _id: new ObjectId('000000000000000000000103'), status: 'Order Placed', orderNumber: 9003 }),
        ]
        await col('orders').insertMany(orders)

        const user = {
            _id: new ObjectId(),
            name: 'Zeroed', email: `zeroed-${Date.now()}@netronix.test`, password: 'x',
            cartData: { [String(new ObjectId())]: { M: 0, L: 3 } },
        }
        await col('users').insertOne(user)

        return { orders, user }
    }

    it('leaves durable coercion evidence and is not recorded as applied', async () => {
        const { orders } = await fixture()

        // Dies on the second order, so one coercion really happened.
        await expect(applyMigration(m007, {
            connection: connectionWith(dbFailingAfter('orders', 'updateOne', 1)),
            direction: 'up',
        })).rejects.toThrow('the process died here')

        const journal = await migrationJournal(connection(), { migrationId: m007.id, direction: 'up' })
        const coerced = journal
            .filter((entry) => entry.entry?.kind === 'coerced-status')
            .map((entry) => entry.entry)

        expect(coerced.length).toBeGreaterThanOrEqual(2)
        expect(coerced[0]).toMatchObject({ orderId: String(orders[0]._id), from: 'Teleported', to: 'Order Placed' })

        // The one that landed carries the migration's opening event.
        const first = await col('orders').findOne({ _id: orders[0]._id })
        expect(first.status).toBe('Order Placed')
        expect(first.statusHistory).toHaveLength(1)

        // The one it died on was not written.
        const second = await col('orders').findOne({ _id: orders[1]._id })
        expect(second.statusHistory).toBeUndefined()
        expect(second.status).toBe('Abducted')

        expect(await appliedMigrationIds(connection())).not.toContain(m007.id)
    })

    it('restarts, completes, and is idempotent', async () => {
        const { orders, user } = await fixture()

        await expect(applyMigration(m007, {
            connection: connectionWith(dbFailingAfter('orders', 'updateOne', 1)),
            direction: 'up',
        })).rejects.toThrow()

        await applyMigration(m007, { connection: connection(), direction: 'up' })
        expect(await appliedMigrationIds(connection())).toContain(m007.id)

        for (const order of orders) {
            const stored = await col('orders').findOne({ _id: order._id })
            expect(stored.statusHistory).toHaveLength(1)
            expect(['Order Placed']).toContain(stored.status)
        }
        const zeroed = await col('users').findOne({ _id: user._id })
        expect(Object.values(zeroed.cartData)[0]).toEqual({ L: 3 })

        const before = await col('orders').find({}).sort({ _id: 1 }).toArray()
        await applyMigration(m007, { connection: connection(), direction: 'up', force: true })
        const after = await col('orders').find({}).sort({ _id: 1 }).toArray()
        expect(after.map((o) => o.statusHistory.length)).toEqual(before.map((o) => o.statusHistory.length))
    })

    it('rolls back exactly what it did and never touches a real audit trail', async () => {
        const { orders, user } = await fixture()

        await expect(applyMigration(m007, {
            connection: connectionWith(dbFailingAfter('orders', 'updateOne', 1)),
            direction: 'up',
        })).rejects.toThrow()
        await applyMigration(m007, { connection: connection(), direction: 'up' })

        // The shop carries on: an order is placed and advanced twice.
        const modern = {
            _id: new ObjectId(), orderNumber: 9500, items: [], amount: 10, address: {},
            paymentMethod: 'COD', date: new Date(), status: 'Shipped',
            statusHistory: [
                { status: 'Order Placed', at: new Date('2026-08-01'), by: 'user:1' },
                { status: 'Packing', at: new Date('2026-08-02'), by: 'admin:a' },
                { status: 'Shipped', at: new Date('2026-08-03'), by: 'admin:b' },
            ],
        }
        await col('orders').insertOne(modern)

        await applyMigration(m007, { connection: connection(), direction: 'down' })

        // Coerced statuses are back — including the one the interrupted run had
        // already coerced.
        expect((await col('orders').findOne({ _id: orders[0]._id })).status).toBe('Teleported')
        expect((await col('orders').findOne({ _id: orders[1]._id })).status).toBe('Abducted')
        for (const order of orders) {
            expect((await col('orders').findOne({ _id: order._id })).statusHistory).toBeUndefined()
        }

        // The pruned cart entry is back.
        const restored = await col('users').findOne({ _id: user._id })
        expect(Object.values(restored.cartData)[0]).toEqual({ M: 0, L: 3 })

        // And the audit trail of an order placed afterwards is untouched.
        const untouched = await col('orders').findOne({ _id: modern._id })
        expect(untouched.statusHistory, 'the rollback deleted a real audit trail').toHaveLength(3)
        expect(untouched.status).toBe('Shipped')
    })
})
