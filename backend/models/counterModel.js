// Atomic sequence allocation (DB-002).
//
// Order numbers were allocated with
//
//     const last = await orderModel.findOne().sort('-orderNumber')
//     const next = last ? last.orderNumber + 1 : 1000
//
// — a read, a decision, and a write, with nothing between them and no unique
// index behind them. Two concurrent checkouts both read 1042 and both write
// 1043. The customer, the admin's search-by-number and support all then
// disagree about which order is which. It was also a full collection scan on
// every single checkout, because nothing was indexed.
//
// A counters collection replaces it: one document per sequence, incremented by
// one atomic operation. There is no window to lose.

import mongoose from 'mongoose'

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
}, { versionKey: false })

const counterModel = mongoose.models.counter || mongoose.model('counter', counterSchema)

/** The sequence id order numbers are drawn from. */
export const ORDER_NUMBER_SEQUENCE = 'orderNumber'

/**
 * The number before the first order number ever issued.
 *
 * 999, so that the first allocation returns 1000 — which is what the original
 * `findOne().sort()` fallback produced, and what the existing suite asserts.
 */
export const ORDER_NUMBER_START = 999

/**
 * Allocate the next value of a sequence.
 *
 * An **aggregation-pipeline update**, not `$inc`, for one specific reason: the
 * counter document may not exist yet, and `$inc` cannot be combined with
 * `$setOnInsert` on the same field. The pipeline form expresses "the next value
 * is the current one, or the seed, plus one" in a single atomic document
 * update, so a fresh database and a running one take exactly the same path.
 *
 * @param {object}  options
 * @param {string}  [options.sequence]
 * @param {number}  [options.start]     The value *before* the first issued.
 * @param {import('mongoose').ClientSession} [options.session]
 *        The caller's transaction. Allocation happens inside it, so an aborted
 *        order releases the number with everything else.
 * @returns {Promise<number>}
 */
export async function nextSequenceValue({
    sequence = ORDER_NUMBER_SEQUENCE,
    start = ORDER_NUMBER_START,
    session = null,
} = {}) {
    const updated = await counterModel.findOneAndUpdate(
        { _id: sequence },
        [{ $set: { seq: { $add: [{ $ifNull: ['$seq', start] }, 1] } } }],
        // `updatePipeline` is Mongoose's opt-in for an aggregation-pipeline
        // update; without it an array argument is rejected as a mistake.
        { upsert: true, returnDocument: 'after', session, updatePipeline: true },
    )
    return updated.seq
}

/**
 * Set a sequence to a known value. Used by the migration that seeds the counter
 * from the highest order number already issued, and by its rollback.
 */
export async function setSequenceValue(sequence, value, { session = null } = {}) {
    await counterModel.updateOne(
        { _id: sequence },
        { $set: { seq: value } },
        { upsert: true, session },
    )
    return value
}

/** Read a sequence without moving it. Returns null when it has never been set. */
export async function peekSequenceValue(sequence = ORDER_NUMBER_SEQUENCE, { session = null } = {}) {
    const doc = await counterModel.findById(sequence).session(session).lean()
    return doc ? doc.seq : null
}

export default counterModel
