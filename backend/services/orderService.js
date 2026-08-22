// Order creation: one implementation, one transaction (BE-007, ARCH-001,
// SEC-002, DB-001, DB-002, DB-005, DB-004, DB-003, DB-012, BE-006).
//
// Phase 1 made this file the single place an order is created and made the
// *server* decide every price. Phase 2 makes the creation itself atomic and
// makes the resulting document a record rather than a set of pointers.
//
// What was wrong
// --------------
// Availability was checked in one loop and decremented in a second, with nothing
// between them. Two customers ordering the last unit both passed the check and
// both decremented, leaving stock at −1 and two orders for one unit. A failure
// part-way through the second loop left stock deducted for lines of an order
// that was created anyway. The order number came from
// `findOne().sort('-orderNumber')` plus one, with no unique index, so two
// concurrent checkouts produced the same number. And the persisted line was
// `{ productId, size, quantity }`, so order history was a view of today's
// catalog.
//
// What it does now
// ----------------
// One `session.withTransaction`, containing:
//
//   1. resolve and price every line from the database, and build its snapshot;
//   2. reserve stock with a **conditional** atomic update per line —
//      `{ quantity: { $gte: requested } }` is part of the filter, so the check
//      and the decrement are one operation and overselling is not expressible;
//   3. allocate the order number from the counters collection;
//   4. insert the order;
//   5. clear the cart.
//
// Any failure aborts all five. There is no compensation logic because there is
// nothing to compensate: nothing outside the transaction was written.
//
// Retries
// -------
// `withTransaction` retries a transient error — a write conflict between two
// orders touching the same product or the same counter — by re-running the
// callback against a fresh snapshot. That is safe here precisely because an
// aborted transaction leaves nothing behind, and because the callback builds all
// of its state from scratch on every attempt. A retry can never produce a second
// order: the insert is inside the transaction that was rolled back.
//
// An idempotency collision is deliberately **not** retried. It means another
// request already created this exact order, so the answer is that order.

import mongoose from 'mongoose'

import orderModel from '../models/orderModel.js'
import userModel from '../models/userModel.js'
import productModel from '../models/productModel.js'
import { nextSequenceValue, ORDER_NUMBER_SEQUENCE } from '../models/counterModel.js'
import { DELIVERY_FEE, DELIVERY_FEE_MINOR, roundMoney } from '../config/pricing.js'
import { DEFAULT_CURRENCY, isSupportedCurrency, multiplyMinor, readMinor, sumMinor, toMajor } from '../lib/money.js'
import { resolveVariant, variantLabel, VariantResolutionError } from '../lib/variant.js'
import { requestFingerprint } from './idempotency.js'
import { ConflictError, NotFoundError, ValidationError, AppError } from '../errors/AppError.js'

/** How many times a transient transaction failure is re-attempted. */
const MAX_TRANSACTION_ATTEMPTS = 6

/** MongoDB duplicate-key error code. */
const DUPLICATE_KEY = 11000

/**
 * Resolve one requested line against the catalog: which combination it is, what
 * it is called, and what it costs — all from the database, never from the
 * request.
 */
function buildLine(product, item) {
    if (product.archived) {
        throw new ConflictError('One of the products in this order is no longer available', {
            details: `product ${product._id} is archived`,
        })
    }

    let entry
    try {
        entry = resolveVariant(product, {
            variantOptions: item.variantOptions,
            variantId: item.variantId,
            // `size` is the pre-Phase-2 wire name for the same thing (ARCH-003).
            variantKey: item.variantKey ?? item.size,
        })
    } catch (error) {
        if (!(error instanceof VariantResolutionError)) throw error
        if (error.code === 'AMBIGUOUS_VARIANT') {
            // Two combinations produce this legacy key. Refusing is the only
            // honest answer: picking one would move stock at random.
            throw new ConflictError('That option cannot be identified for one of the products in this order', {
                details: `product ${product._id}: legacy key "${error.legacyKey}" is ambiguous`,
            })
        }
        throw new ValidationError('That option is not available for one of the products in this order', {
            details: `product ${product._id}: ${error.message}`,
        })
    }

    if (entry.quantity < item.quantity) {
        throw new ConflictError('There is not enough stock for one of the products in this order', {
            details: `product ${product._id} variant "${entry.variantId}": ${entry.quantity} available, ${item.quantity} requested`,
        })
    }

    // One currency, checked before the number is used for anything (DB-004).
    //
    // This used to be `currency: product.currency || DEFAULT_CURRENCY` further
    // down, which *inherited* whatever the product carried onto the line — and
    // then `createOrder` summed those lines into a total labelled `USD`. A
    // single legacy `LBP` product was enough to produce an order whose total
    // added two currencies together, with nothing afterwards able to detect it.
    //
    // Refusing is the only honest answer: there is no exchange rate here and
    // inventing one, or relabelling the price, would both be worse than saying
    // the product cannot be sold.
    if (product.currency !== undefined && product.currency !== null && !isSupportedCurrency(product.currency)) {
        throw new ConflictError('One of the products in this order cannot be sold in this currency', {
            details: `product ${product._id} is priced in ${product.currency}; this system holds ${DEFAULT_CURRENCY} only`,
        })
    }
    if (product.currencyQuarantined) {
        throw new ConflictError('One of the products in this order cannot be sold in this currency', {
            details: `product ${product._id} was quarantined by the money migration and has no usable price`,
        })
    }

    const basePriceMinor = readMinor(product, 'priceMinor', 'price')
    if (basePriceMinor === null) {
        throw new ConflictError('One of the products in this order is not currently priced', {
            details: `product ${product._id} has no usable price`,
        })
    }

    const priceDelta = entry.priceMinorDelta || 0;
    const unitPriceMinor = basePriceMinor + priceDelta;

    const lineTotalMinor = multiplyMinor(unitPriceMinor, item.quantity)

    return {
        entry,
        line: {
            productId: product._id,
            name: product.name,
            variantId: entry.variantId,
            variantKey: entry.legacyKey,
            // Dual-written under its pre-Phase-2 name so an unmigrated reader
            // still finds it (ARCH-003).
            size: entry.legacyKey,
            variantOptions: entry.options,
            variantLabel: variantLabel(product.variants, entry.options),
            unitPriceMinor,
            unitPrice: toMajor(unitPriceMinor),
            quantity: item.quantity,
            lineTotalMinor,
            lineTotal: toMajor(lineTotalMinor),
            // Canonical, not inherited. The check above has already refused
            // anything that is not this currency, so writing it is a statement
            // of the invariant rather than a coercion.
            currency: DEFAULT_CURRENCY,
            image: Array.isArray(product.image) ? (product.image[0] ?? '') : (product.image ?? ''),
            brand: product.brand ?? '',
        },
    }
}

/**
 * Reserve one line's stock.
 *
 * The guard is in the **filter**, not in a preceding read: the document is only
 * matched if the combination still has enough, so the check and the decrement
 * are a single atomic operation and no interleaving can produce a negative.
 *
 * The update is an aggregation pipeline rather than `$inc` for one reason: a
 * variant-less product's legacy key is the empty string, and `$inc` cannot
 * express `inventory.` as a field path at all — MongoDB rejects it with error 56
 * (EmptyFieldName). That is exactly the failure the old code caught, logged and
 * ignored, which is why a variant-less product never decremented and could be
 * oversold without limit (BE-006). The pipeline rebuilds the legacy bag from the
 * key that changed, so both representations stay true and any orphaned or
 * under-review key in the bag is preserved untouched.
 *
 * @returns {Promise<boolean>} false when the stock was no longer there.
 */
async function reserve(productId, entry, quantity, session) {
    const { variantId, legacyKey } = entry

    const updated = await productModel.collection.findOneAndUpdate(
        {
            _id: productId,
            inventoryV2: { $elemMatch: { variantId, quantity: { $gte: quantity } } },
            // Exactly one row may carry this identity.
            //
            // The `$map` below decrements **every** matching row, while
            // `resolveVariant` reads the first — so on a product that somehow
            // holds the same combination twice, one unit sold took two off the
            // shelf. Every write path now refuses to store that (see
            // `normaliseInventoryV2` and the model's own check), and this guard
            // makes a document that already holds it unsellable rather than
            // silently wrong: no match, so the caller gets a conflict.
            $expr: {
                $eq: [
                    {
                        $size: {
                            $filter: {
                                input: { $ifNull: ['$inventoryV2', []] },
                                as: 'e',
                                cond: { $eq: ['$$e.variantId', { $literal: variantId }] },
                            },
                        },
                    },
                    1,
                ],
            },
        },
        [
            {
                $set: {
                    inventoryRevision: { $add: [{ $ifNull: ['$inventoryRevision', 0] }, 1] },
                    inventoryV2: {
                        $map: {
                            input: '$inventoryV2',
                            as: 'e',
                            in: {
                                $cond: [
                                    { $eq: ['$$e.variantId', { $literal: variantId }] },
                                    { $mergeObjects: ['$$e', { quantity: { $subtract: ['$$e.quantity', quantity] } }] },
                                    '$$e',
                                ],
                            },
                        },
                    },
                },
            },
            {
                $set: {
                    inventory: {
                        $arrayToObject: {
                            $concatArrays: [
                                {
                                    $filter: {
                                        input: { $objectToArray: '$inventory' },
                                        as: 'kv',
                                        cond: { $ne: ['$$kv.k', { $literal: legacyKey }] },
                                    },
                                },
                                {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: '$inventoryV2',
                                                as: 'e',
                                                cond: { $eq: ['$$e.variantId', { $literal: variantId }] },
                                            },
                                        },
                                        as: 'e',
                                        in: { k: '$$e.legacyKey', v: '$$e.quantity' },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
        ],
        { session, returnDocument: 'after' },
    )

    return Boolean(updated)
}

/** Find the order a previous request with this key already created. */
async function findByIdempotency(scope, key) {
    if (!key) return null
    return orderModel.findOne({ idempotencyScope: scope, idempotencyKey: key })
}

/**
 * True for the errors that are safe to re-attempt from scratch.
 *
 * `TransientTransactionError` means the transaction **aborted**: nothing was
 * committed, so re-running the callback produces exactly one order.
 *
 * `UnknownTransactionCommitResult` is deliberately **not** here. It means the
 * commit may or may not have succeeded, and re-running an order-creating
 * transaction after one is how a customer is charged twice. With an idempotency
 * key the ambiguity is resolvable — the unique index on `(scope, key)` means a
 * committed order is found and replayed rather than duplicated — so it is
 * retried only in that case, decided by `isRetryableCommitUncertainty` below.
 */
function isTransient(error) {
    return Boolean(
        error?.hasErrorLabel?.('TransientTransactionError')
        || error?.codeName === 'WriteConflict'
        || error?.code === 112,
    )
}

/** An uncertain commit: the outcome is genuinely unknown to us. */
function isCommitUncertain(error) {
    return Boolean(error?.hasErrorLabel?.('UnknownTransactionCommitResult'))
}

/**
 * What may be done about a failed attempt. Exported so the rule can be asserted
 * directly rather than inferred from an error message.
 *
 *   `retry`            — the transaction aborted; nothing was written.
 *   `resolve-or-retry` — the commit is uncertain, but a durable idempotency key
 *                        means a committed order can be recognised.
 *   `fail-uncertain`   — the commit is uncertain and there is nothing to
 *                        recognise it by. Retrying could charge twice.
 *   `fail`             — not a transaction problem at all.
 */
export function retryPolicyFor(error, { hasIdempotencyKey = false } = {}) {
    if (isCommitUncertain(error)) return hasIdempotencyKey ? 'resolve-or-retry' : 'fail-uncertain'
    if (isTransient(error)) return 'retry'
    return 'fail'
}

/**
 * Create an order. All of it, or none of it.
 *
 * @param {object}   input
 * @param {string?}  input.userId          Verified id, or null for a guest.
 * @param {object[]} input.items           Validated lines.
 * @param {object}   input.address
 * @param {string}   input.paymentMethod
 * @param {object}   [input.idempotency]   `{ key, scope }` — see services/idempotency.js.
 * @returns {Promise<{ order: object, replayed: boolean, pricing: object }>}
 */
export async function createOrder({
    userId = null,
    items,
    address,
    paymentMethod = 'COD',
    idempotency = {},
}) {
    const { key: idempotencyKey = null, scope: idempotencyScope = null } = idempotency
    const fingerprint = idempotencyKey
        ? requestFingerprint({ items, address, paymentMethod })
        : null

    // A replay is answered before any work is done. `-1` here would be a second
    // order and a second decrement.
    if (idempotencyKey) {
        const existing = await findByIdempotency(idempotencyScope, idempotencyKey)
        if (existing) return replayOf(existing, fingerprint)
    }

    const session = await mongoose.startSession()
    let created = null

    try {
        for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
            try {
                await session.withTransaction(async () => {
                    // Everything below is rebuilt from scratch on every attempt,
                    // so a retry cannot inherit half-computed state.
                    const lines = []
                    let subtotalMinor = 0

                    for (const item of items) {
                        const product = await productModel.findById(item.productId).session(session)
                        if (!product) {
                            throw new NotFoundError('One of the products in this order is no longer available')
                        }

                        const { entry, line } = buildLine(product, item)

                        const reserved = await reserve(product._id, entry, item.quantity, session)
                        if (!reserved) {
                            // Someone else took it between the read and this
                            // write. The transaction aborts; nothing is left
                            // half-deducted.
                            throw new ConflictError('There is not enough stock for one of the products in this order', {
                                details: `product ${product._id} variant "${entry.variantId}": reservation failed`,
                            })
                        }

                        lines.push(line)
                        subtotalMinor = sumMinor(subtotalMinor, line.lineTotalMinor)
                    }

                    const deliveryFeeMinor = DELIVERY_FEE_MINOR
                    const amountMinor = sumMinor(subtotalMinor, deliveryFeeMinor)

                    const orderNumber = await nextSequenceValue({
                        sequence: ORDER_NUMBER_SEQUENCE,
                        session,
                    })

                    const [order] = await orderModel.create([{
                        ...(userId ? { userId } : {}),
                        orderNumber,
                        items: lines,
                        // Exact integers, and the same figures in the legacy
                        // major-unit fields the deployed clients still read.
                        amountMinor,
                        subtotalMinor,
                        deliveryFeeMinor,
                        amount: toMajor(amountMinor),
                        subtotal: toMajor(subtotalMinor),
                        delivery_fee: toMajor(deliveryFeeMinor),
                        currency: DEFAULT_CURRENCY,
                        address,
                        paymentMethod,
                        payment: false,
                        date: new Date(),
                        isGuestOrder: !userId,
                        status: 'Order Placed',
                        statusHistory: [{
                            status: 'Order Placed',
                            at: new Date(),
                            by: userId ? `user:${userId}` : 'guest',
                        }],
                        ...(idempotencyKey ? { idempotencyKey, idempotencyScope, idempotencyFingerprint: fingerprint } : {}),
                        schemaVersion: 2,
                    }], { session })

                    if (userId) {
                        // Both representations. Clearing only the legacy map
                        // left the canonical lines behind, so the cart came
                        // back the moment the customer reloaded.
                        await userModel.findByIdAndUpdate(
                            userId,
                            { cartData: {}, cartLines: [], $inc: { cartVersion: 1 } },
                            { session },
                        )
                    }

                    created = order
                })
                break
            } catch (error) {
                created = null

                // Another request with this exact key won the race. Its order is
                // the answer; ours was rolled back in full, stock included.
                if (error?.code === DUPLICATE_KEY && idempotencyKey) {
                    const winner = await findByIdempotency(idempotencyScope, idempotencyKey)
                    if (winner) return replayOf(winner, fingerprint)
                }

                // An uncertain commit with no key cannot be retried: the order
                // may already exist, and there is nothing durable to recognise
                // it by. The honest answer is to say the outcome is unknown.
                if (isCommitUncertain(error) && !idempotencyKey) {
                    throw new AppError(
                        'We could not confirm whether your order went through. Please check your order history before trying again.',
                        {
                            status: 409,
                            code: 'COMMIT_UNCERTAIN',
                            details: 'UnknownTransactionCommitResult with no idempotency key; retrying could place a second order',
                        },
                    )
                }

                // With a key, the ambiguity is resolvable: if the commit did
                // succeed, the unique index on (scope, key) turns the retry into
                // a replay of that same order rather than a second one.
                if (isCommitUncertain(error) && idempotencyKey) {
                    const committed = await findByIdempotency(idempotencyScope, idempotencyKey)
                    if (committed) return replayOf(committed, fingerprint)
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        await new Promise((resolve) => { setTimeout(resolve, 5 * attempt + Math.random() * 10) })
                        continue
                    }
                }

                if (isTransient(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
                    // Jittered backoff: without it, contending transactions
                    // re-collide in lockstep.
                    await new Promise((resolve) => { setTimeout(resolve, 5 * attempt + Math.random() * 10) })
                    continue
                }

                if (isTransient(error)) {
                    throw new ConflictError('The order could not be completed just now. Please try again.', {
                        details: `transaction exhausted ${MAX_TRANSACTION_ATTEMPTS} attempts: ${error?.codeName ?? error?.message}`,
                    })
                }

                throw error
            }
        }
    } finally {
        await session.endSession()
    }

    if (!created) {
        throw new AppError('The order could not be completed. Please try again.', {
            status: 409, code: 'CONFLICT', details: 'transaction produced no order',
        })
    }

    return {
        order: created,
        replayed: false,
        pricing: {
            subtotalMinor: created.subtotalMinor,
            deliveryFeeMinor: created.deliveryFeeMinor,
            amountMinor: created.amountMinor,
            subtotal: created.subtotal,
            deliveryFee: created.delivery_fee,
            amount: created.amount,
            currency: created.currency,
            lines: created.items,
        },
    }
}

/**
 * The answer to a replayed request.
 *
 * Same key, same request → the original order, with the semantics the original
 * response had. Same key, *different* request → 409: that is a client defect or
 * an attack, and quietly returning an unrelated order would be worse than
 * failing.
 */
function replayOf(order, fingerprint) {
    if (order.idempotencyFingerprint && fingerprint && order.idempotencyFingerprint !== fingerprint) {
        throw new ConflictError('That idempotency key was already used for a different order', {
            details: 'idempotency fingerprint mismatch',
        })
    }
    return {
        order,
        replayed: true,
        pricing: {
            subtotalMinor: order.subtotalMinor,
            deliveryFeeMinor: order.deliveryFeeMinor,
            amountMinor: order.amountMinor,
            subtotal: order.subtotal,
            deliveryFee: order.delivery_fee,
            amount: order.amount,
            currency: order.currency,
            lines: order.items,
        },
    }
}

/**
 * Price a set of lines without writing anything.
 *
 * Kept for callers that need a quotation rather than an order. It resolves and
 * prices exactly as `createOrder` does, and reserves nothing.
 */
export async function priceLines(items) {
    const lines = []
    let subtotalMinor = 0

    for (const item of items) {
        const product = await productModel.findById(item.productId)
        if (!product) throw new NotFoundError('One of the products in this order is no longer available')
        const { line } = buildLine(product, item)
        lines.push(line)
        subtotalMinor = sumMinor(subtotalMinor, line.lineTotalMinor)
    }

    return {
        lines,
        subtotalMinor,
        subtotal: toMajor(subtotalMinor),
    }
}

export { DELIVERY_FEE, DELIVERY_FEE_MINOR, roundMoney }

/** True when the id is a syntactically valid ObjectId. */
export const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value))
