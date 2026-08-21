// 003 — the order-number counter and its unique constraint (DB-002).
//
// Allocation was `findOne().sort('-orderNumber')` then `+1`, with no lock and no
// unique index. Two concurrent checkouts both read 1042 and both wrote 1043.
//
// **Order matters here more than anywhere else in this directory**, and it is
// the order the remediation plan specifies:
//
//   1. detect duplicates;
//   2. reassign the *newer* of each group, deterministically, from max+1 upward;
//   3. seed the counter from the resulting maximum;
//   4. only then build the unique index.
//
// Step 4 cannot come earlier: the build fails outright while duplicates remain.
// Step 2 cannot be silent: a customer may be holding a confirmation email that
// quotes the number being changed, so every reassignment is written to the
// migration report as an old → new mapping.
//
// ## Rollback
//
// `down()` drops the unique index and removes the counter document. Numbers
// already issued **stay as they are** — reassignment is not undone, because
// undoing it would recreate the duplicates it resolved and because the new
// numbers may already have been communicated. That is a deliberate asymmetry and
// the one piece of information this migration does not restore; the mapping is
// preserved in `migrationReports` so the change remains auditable after a
// rollback.

import { ORDER_NUMBER_SEQUENCE, ORDER_NUMBER_START } from '../models/counterModel.js'

export const id = '003_order_number_counter'
export const name = 'De-duplicate order numbers, seed the counter, add the unique index'
export const findings = ['DB-002']
export const description =
    'Resolves duplicate order numbers, seeds the counters collection from the resulting maximum, and only then builds the unique index.'
export const rollback =
    'down() drops the unique index and the counter document. Reassigned numbers are NOT reverted — that would reintroduce the duplicates and invalidate numbers already communicated. The old → new mapping stays in migrationReports.'

export const UNIQUE_INDEX_NAME = 'orderNumber_1_unique'

/** Every order number held by more than one order, with its holders. */
export async function findDuplicateOrderNumbers(db) {
    return db.collection('orders').aggregate([
        { $match: { orderNumber: { $type: 'number' } } },
        { $group: { _id: '$orderNumber', n: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { n: { $gt: 1 } } },
        { $sort: { _id: 1 } },
    ]).toArray()
}

/**
 * A cheap description of the collection, used to prove nothing changed under the
 * migration while it was running.
 */
export async function orderFingerprint(db) {
    const orders = db.collection('orders')
    const count = await orders.countDocuments({})
    const highest = await orders.find({ orderNumber: { $type: 'number' } }, { projection: { orderNumber: 1 } })
        .sort({ orderNumber: -1 }).limit(1).next()
    return { count, max: Number(highest?.orderNumber ?? ORDER_NUMBER_START) }
}

/**
 * Fail closed when the collection changed while this migration was working.
 *
 * The detect → reassign → seed → build sequence is only correct if no order is
 * created between the first step and the last. An order placed during the run
 * takes a number from the *old* allocator, which may be one the reassignment
 * just handed out, and the unique index build then fails — or worse, succeeds
 * before that order lands and the order fails instead, at checkout, for a
 * customer.
 *
 * There is no lock available that would make this safe, so the honest answer is
 * a maintenance window: writes paused, migration run, writes resumed. This
 * function is that requirement, encoded. It cannot *enforce* the pause; it can
 * refuse to finish when the pause plainly was not in place, which is what
 * "fail closed" means here.
 */
export function assertQuiescent(before, after) {
    if (before.count !== after.count || before.max !== after.max) {
        throw new MaintenanceRequiredError(
            'The orders collection changed while the migration was running. '
            + 'Order-number de-duplication requires a maintenance window with writes paused. '
            + `Saw ${before.count} order(s)/max ${before.max} at the start and `
            + `${after.count}/max ${after.max} before the unique index build.`,
        )
    }
}

/** Thrown when 003 cannot prove it ran against a quiet collection. */
export class MaintenanceRequiredError extends Error {
    constructor(message) {
        super(message)
        this.name = 'MaintenanceRequiredError'
        this.code = 'MAINTENANCE_REQUIRED'
    }
}

/**
 * Orders whose number is missing, null, or not a number.
 *
 * These matter more than the duplicates do: MongoDB indexes a missing field as
 * `null`, so **two** orders without a number are a duplicate-key violation and
 * the unique index build fails outright. The original migration filtered them
 * out of its own duplicate detection (`$type: 'number'`) and then asked for a
 * unique index anyway.
 */
export async function findUnnumberedOrders(db) {
    return db.collection('orders')
        .find({ $or: [{ orderNumber: { $exists: false } }, { orderNumber: null }, { orderNumber: { $not: { $type: 'number' } } }] })
        .project({ orderNumber: 1 })
        .sort({ _id: 1 })
        .toArray()
}

export async function up({ db, report, own, log }) {
    const orders = db.collection('orders')

    const before = await orderFingerprint(db)

    // 1. Detect.
    const duplicates = await findDuplicateOrderNumbers(db)

    // 2. Resolve, deterministically. Within a group the oldest order keeps the
    //    number and the rest are reassigned in `_id` order, so a re-run — or a
    //    run on a restored copy — produces the same mapping.
    const maxDoc = await orders.find({}, { projection: { orderNumber: 1 } })
        .sort({ orderNumber: -1 }).limit(1).next()
    let next = Math.max(Number(maxDoc?.orderNumber ?? ORDER_NUMBER_START), ORDER_NUMBER_START)

    for (const group of duplicates) {
        const holders = [...group.ids].sort((a, b) => (String(a) < String(b) ? -1 : 1))
        const [keeps, ...reassign] = holders
        await report({
            kind: 'duplicate-order-number',
            orderNumber: group._id,
            count: group.n,
            keptBy: String(keeps),
        })
        for (const orderId of reassign) {
            next += 1
            // Written **before** the reassignment. The report used to be
            // persisted after the whole migration returned, so a crash here left
            // a customer's order silently renumbered with no record of the old
            // number — and the confirmation email they are holding quotes it.
            await report({
                kind: 'order-number-reassigned',
                orderId: String(orderId),
                from: group._id,
                to: next,
                reason: 'the number was held by more than one order; the customer may hold the old one',
            })
            await orders.updateOne(
                { _id: orderId },
                { $set: { orderNumber: next }, $push: { orderNumberHistory: { from: group._id, to: next } } },
            )
            log(`  ! order ${orderId}: ${group._id} → ${next}`)
        }
    }

    // 2b. Repair orders that have no usable number at all.
    //
    // A missing field indexes as `null`, so two of these violate the unique
    // index on their own. They are given numbers from the same sequence, in
    // `_id` order so a re-run produces the same mapping, and every one is
    // reported: an order that never had a number is a data-integrity finding in
    // its own right, not a formality.
    for (const order of await findUnnumberedOrders(db)) {
        next += 1
        await report({
            kind: 'order-number-assigned',
            orderId: String(order._id),
            from: order.orderNumber ?? null,
            to: next,
            reason: 'the order had no usable order number; a unique index cannot be built while that is true',
        })
        await own({
            collection: 'orders',
            id: order._id,
            set: { orderNumber: next },
            before: 'orderNumber' in order ? { orderNumber: order.orderNumber } : {},
        })
        await orders.updateOne({ _id: order._id }, { $set: { orderNumber: next } })
        log(`  ! order ${order._id}: (no number) → ${next}`)
    }

    // 3. Seed the counter from the resulting maximum.
    const finalMax = await orders.find({}, { projection: { orderNumber: 1 } })
        .sort({ orderNumber: -1 }).limit(1).next()
    const seq = Math.max(Number(finalMax?.orderNumber ?? ORDER_NUMBER_START), ORDER_NUMBER_START)
    await db.collection('counters').updateOne(
        { _id: ORDER_NUMBER_SEQUENCE },
        { $set: { seq } },
        { upsert: true },
    )
    log(`  counter ${ORDER_NUMBER_SEQUENCE} seeded at ${seq}`)

    // 4. Only now the constraint — and only if nothing else has been writing.
    //
    // What this run itself did is known: it inserted nothing, so the count must
    // be unchanged, and it renumbered upward, so the maximum must be exactly the
    // number it last handed out. Anything else means an order arrived during the
    // run, from an allocator that does not yet know about the counter — which is
    // precisely the case this sequence cannot survive.
    assertQuiescent({ count: before.count, max: Math.max(before.max, next) }, await orderFingerprint(db))

    await db.collection('orders').createIndex(
        { orderNumber: 1 },
        { unique: true, name: UNIQUE_INDEX_NAME, background: true },
    )
    log(`  + orders.${UNIQUE_INDEX_NAME}`)
}

export async function down({ db, log }) {
    try {
        await db.collection('orders').dropIndex(UNIQUE_INDEX_NAME)
        log(`  - orders.${UNIQUE_INDEX_NAME}`)
    } catch (error) {
        if (error?.code !== 27 && error?.code !== 26) throw error
    }
    await db.collection('counters').deleteOne({ _id: ORDER_NUMBER_SEQUENCE })
    // Reassignments are deliberately not reverted. See the header.
}

export default {
    id, name, findings, description, rollback, up, down,
    UNIQUE_INDEX_NAME, findDuplicateOrderNumbers, findUnnumberedOrders,
    assertQuiescent, orderFingerprint,
}
