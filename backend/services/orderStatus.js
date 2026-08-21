// Order status transitions and their audit trail (DB-008, SEC-017).
//
// `updateStatus` was `findByIdAndUpdate(orderId, { status })` with no validation
// of any kind. Phase 1 added the enum, so an arbitrary string is now a 400. What
// it did not add is the part that matters operationally: **"Delivered" could
// still become "Order Placed"**, and nothing recorded who changed it or when.
//
// The transition rule
// -------------------
// The five fulfilment statuses are a sequence, and fulfilment does not run
// backwards: a parcel that has been delivered has been delivered. So a status
// may move **forward** to any later stage — a small shop marking an order
// "Shipped" without first marking it "Packing" is normal, not an error — and may
// never move back. `Cancelled` is reachable from any stage that is not terminal.
// `Delivered` and `Cancelled` are terminal.
//
// Re-applying the status an order already has is refused rather than treated as
// a no-op, because it is almost always a double-submitted form, and answering
// "done" to it hides that.
//
// Every accepted transition appends `{ status, at, by }`. The history array is
// cheap and it is what turns the admin's order view into a record instead of a
// current value.

import mongoose from 'mongoose'

import orderModel, { ORDER_STATUSES } from '../models/orderModel.js'
import { ConflictError } from '../errors/AppError.js'

/** The fulfilment sequence, in order. `Cancelled` is not part of it. */
export const FULFILMENT_SEQUENCE = ['Order Placed', 'Packing', 'Shipped', 'Out for Delivery', 'Delivered']

export const CANCELLED = 'Cancelled'

/** Statuses from which nothing further is allowed. */
export const TERMINAL_STATUSES = ['Delivered', CANCELLED]

/**
 * The complete transition table, derived from the two rules above so that the
 * table and the rules cannot drift apart. Exported so a test can assert the
 * whole thing rather than a sample of it.
 */
export const TRANSITIONS = Object.fromEntries(
    ORDER_STATUSES.map((status) => {
        if (TERMINAL_STATUSES.includes(status)) return [status, []]
        const index = FULFILMENT_SEQUENCE.indexOf(status)
        const forward = index === -1 ? [] : FULFILMENT_SEQUENCE.slice(index + 1)
        return [status, [...forward, CANCELLED]]
    }),
)

/** True when `to` is reachable from `from`. */
export function canTransition(from, to) {
    return (TRANSITIONS[from] ?? []).includes(to)
}

/**
 * Assert a transition, or explain why not.
 *
 * 409 rather than 400: the request is well-formed and the status is a real one;
 * what is wrong is the *state* it is being applied to. The order's own status is
 * left exactly as it was.
 */
export function assertTransition(from, to) {
    if (from === to) {
        throw new ConflictError(`This order is already "${to}"`, {
            details: `no-op transition ${from} → ${to}`,
        })
    }
    if (TERMINAL_STATUSES.includes(from)) {
        throw new ConflictError(`An order that is "${from}" cannot change status`, {
            details: `${from} is terminal`,
        })
    }
    if (!canTransition(from, to)) {
        throw new ConflictError(`An order cannot go from "${from}" back to "${to}"`, {
            details: `disallowed transition ${from} → ${to}`,
        })
    }
    return to
}

/** The audit event an accepted transition appends. */
export function statusEvent(status, actor) {
    return { status, at: new Date(), by: actor ?? 'system' }
}

/**
 * Apply a transition as a single compare-and-set.
 *
 * Two blockers, one operation.
 *
 * **The lost update.** The previous path was `findById` → `assertTransition` →
 * mutate → `save()`. Two administrators with the same order open both read
 * "Order Placed", both pass the check against that value, and both save — the
 * second overwriting the first's status *and* the history entry it appended. An
 * audit trail that drops events is not an audit trail. Naming the status that
 * was read in the **filter** makes the check and the write one operation: the
 * second writer matches nothing and is told so.
 *
 * **The legacy order.** `save()` validates the entire document, and the
 * tightened `orderItemSchema` requires `name`, `unitPrice`, `unitPriceMinor`,
 * `lineTotal` and `lineTotalMinor` — none of which a pre-Phase-2 line has. So an
 * order that predates migration 002 could be read through the compatibility path
 * but not moved from "Packing" to "Shipped", because five fields the request
 * never touched failed validation. Going through the driver with an explicit
 * `$set` + `$push` touches the status and the history and nothing else, which is
 * what an additive rollout requires: the old shape stays legal until its own
 * migration converts it.
 *
 * The event is still checked here — the enum is asserted before anything is
 * written — so bypassing document validation does not mean bypassing the rule.
 *
 * @param {object} options
 * @param {string|import('mongoose').Types.ObjectId} options.orderId
 * @param {string} options.from  the status that was read; the guard
 * @param {string} options.to    the status to move to
 * @param {string} options.by    who is doing it
 * @param {import('mongoose').ClientSession} [options.session]
 * @returns {Promise<{matched: boolean, event: object}>}
 */
export async function applyStatusTransition({ orderId, from, to, by, session = null }) {
    if (!ORDER_STATUSES.includes(to)) {
        throw new ConflictError(`"${to}" is not a known order status`, {
            details: `status must be one of: ${ORDER_STATUSES.join(', ')}`,
        })
    }

    const event = statusEvent(to, by)
    const result = await orderModel.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(String(orderId)), status: from },
        { $set: { status: to, updatedAt: event.at }, $push: { statusHistory: event } },
        ...(session ? [{ session }] : []),
    )

    return { matched: result.matchedCount === 1, event }
}
