// Cart writes that do not overwrite each other (DB-011, BE-004).
//
// The defect
// ----------
// `addToCart` and `updateCart` both loaded the user, changed one entry inside
// `cartData`, and wrote the **whole map** back with
// `findByIdAndUpdate(userId, { cartData })`. Two requests in flight at once —
// two tabs, a phone and a laptop, or one double-click across two products —
// both read the same map, and the second write erased the first's line. The
// customer watched something they had just added vanish, and nothing anywhere
// reported an error.
//
// The remedy
// ----------
// Write the entry, not the map. Each operation below is a single
// aggregation-pipeline update that rebuilds **only the affected product's**
// variant object, so a concurrent write to any other line is untouched by
// construction, and the stock check rides in the *filter* so the check and the
// write are one operation rather than two.
//
// Why a pipeline and not `$inc`
// -----------------------------
// A variant-less product's key is the empty string, and `cartData.<id>.` is not
// a legal field path — MongoDB rejects it with error 56, EmptyFieldName. That is
// the same trap `orderService.reserve` documents, and the reason the entry is
// rebuilt through `$objectToArray`/`$arrayToObject` and read through
// `$getField`, both of which handle a key that a path cannot express.
//
// `mergeCart` is the one operation that legitimately replaces the whole map, so
// it takes the other standard remedy: optimistic concurrency on `cartVersion`,
// with a bounded retry.

import mongoose from 'mongoose'

import userModel from '../models/userModel.js'
import { ConflictError } from '../errors/AppError.js'

/** How many times a merge re-reads and re-applies before giving up. */
export const MAX_MERGE_ATTEMPTS = 5

const oid = (value) => new mongoose.Types.ObjectId(String(value))

/**
 * How a request names the line it means.
 *
 * `variantId` is the canonical identity and is what a line written since the
 * lossless change carries. `variantKey` is the legacy hyphen join, still used by
 * a cached bundle and by lines the catalog could not resolve. The two are
 * matched separately because they are different things: a legacy line has no
 * `variantId` at all, and inventing one for it would be the guess this whole
 * change exists to remove.
 *
 * @param {{variantId?: string|null, variantKey?: string}} identity
 */
function matchesLine(productId, identity) {
    const sameProduct = { $eq: ['$$line.productId', { $literal: String(productId) }] }

    if (identity.variantId !== undefined && identity.variantId !== null) {
        return { $and: [sameProduct, { $eq: ['$$line.variantId', { $literal: identity.variantId }] }] }
    }

    // A legacy line: matched by key, and only when it has no canonical identity
    // of its own, so naming a key never reaches a line that knows better.
    return {
        $and: [
            sameProduct,
            { $eq: [{ $ifNull: ['$$line.variantId', null] }, null] },
            { $eq: ['$$line.variantKey', { $literal: identity.variantKey ?? '' }] },
        ],
    }
}

/** The quantity that line currently holds, as an expression. 0 when absent. */
function currentQuantity(productId, identity) {
    return {
        $ifNull: [
            {
                $getField: {
                    field: 'quantity',
                    input: {
                        $first: {
                            $filter: { input: { $ifNull: ['$cartLines', []] }, as: 'line', cond: matchesLine(productId, identity) },
                        },
                    },
                },
            },
            0,
        ],
    }
}

/**
 * The legacy `cartData` map, rebuilt from `cartLines` in the same update.
 *
 * Derived rather than maintained separately, so the two representations cannot
 * drift. It is lossy on purpose: two lines whose legacy keys collide are summed
 * under the one key, because the legacy shape has no way to hold both and a sum
 * at least keeps an old bundle's count right.
 */
const DERIVE_CART_DATA = {
    $set: {
        cartData: {
            $reduce: {
                input: { $ifNull: ['$cartLines', []] },
                initialValue: {},
                in: {
                    $let: {
                        vars: { productId: { $toString: '$$this.productId' } },
                        in: {
                            $mergeObjects: [
                                '$$value',
                                {
                                    $arrayToObject: [[{
                                        k: '$$productId',
                                        v: {
                                            $let: {
                                                vars: {
                                                    variants: { $ifNull: [{ $getField: { field: '$$productId', input: '$$value' } }, {}] },
                                                },
                                                in: {
                                                    $mergeObjects: [
                                                        '$$variants',
                                                        {
                                                            $arrayToObject: [[{
                                                                k: { $ifNull: ['$$this.variantKey', ''] },
                                                                v: {
                                                                    $add: [
                                                                        { $ifNull: [{ $getField: { field: { $ifNull: ['$$this.variantKey', ''] }, input: '$$variants' } }, 0] },
                                                                        '$$this.quantity',
                                                                    ],
                                                                },
                                                            }]],
                                                        },
                                                    ],
                                                },
                                            },
                                        },
                                    }]],
                                },
                            ],
                        },
                    },
                },
            },
        },
    },
}

/**
 * The stages that set one line to `quantity`, dropping it when that is not
 * positive (DB-011: removal deletes the line, it does not write 0).
 *
 * `template` is the whole line as it should be stored — identity, option pairs
 * and legacy key — so a line that did not exist is created complete, and one
 * that did is refreshed with whatever the catalog can now say about it.
 */
function writeLine(productId, identity, template, quantity) {
    const others = {
        $filter: {
            input: { $ifNull: ['$cartLines', []] },
            as: 'line',
            cond: { $not: matchesLine(productId, identity) },
        },
    }

    return [
        {
            $set: {
                cartLines: {
                    $concatArrays: [
                        others,
                        {
                            $cond: [
                                { $gt: [quantity, 0] },
                                [{ $mergeObjects: [{ $literal: template }, { quantity }] }],
                                [],
                            ],
                        },
                    ],
                },
            },
        },
        DERIVE_CART_DATA,
        { $set: { cartVersion: { $add: [{ $ifNull: ['$cartVersion', 0] }, 1] } } },
    ]
}

/**
 * Add to one line.
 *
 * @param {object} options
 * @param {object} options.identity  `{ variantId }` or `{ variantKey }`
 * @param {object} options.template  the complete line to store
 * @param {number|null} options.available stock, or null when the catalog cannot
 *        resolve the combination — in which case no cap is applied, because a
 *        cart is an intention and checkout is the enforcement point.
 * @returns {Promise<{matched: boolean}>} false means the cap would have been
 *        exceeded (or the user is gone); nothing was written either way.
 */
export async function addCartQuantity({ userId, productId, identity, template, delta, available = null }) {
    const next = { $add: [currentQuantity(productId, identity), Number(delta)] }

    const filter = { _id: oid(userId) }
    if (available !== null && available !== undefined) {
        // The check *is* the write. Two concurrent additions of the last unit
        // cannot both pass, because only one of them matches.
        filter.$expr = { $lte: [next, Number(available)] }
    }

    const result = await userModel.collection.updateOne(filter, writeLine(productId, identity, template, next))
    return { matched: result.matchedCount === 1 }
}

/**
 * Set one line to an absolute quantity, or remove it when that is not positive.
 *
 * `requireExisting` puts the "that item is not in your cart" check in the same
 * operation as the write, so a line another request removed in the meantime is
 * not silently recreated.
 */
export async function setCartQuantity({ userId, productId, identity, template, quantity, available = null, requireExisting = true }) {
    const current = currentQuantity(productId, identity)
    const guards = []

    if (requireExisting) guards.push({ $gt: [current, 0] })
    if (available !== null && available !== undefined && Number(quantity) > 0) {
        guards.push({ $lte: [Number(quantity), Number(available)] })
    }

    const filter = { _id: oid(userId) }
    if (guards.length > 0) filter.$expr = guards.length === 1 ? guards[0] : { $and: guards }

    const result = await userModel.collection.updateOne(
        filter,
        writeLine(productId, identity, template, { $literal: Number(quantity) }),
    )
    return { matched: result.matchedCount === 1 }
}

/**
 * Replace the whole cart, but only if nobody else has changed it since it was
 * read.
 *
 * `build(user)` is called with a freshly read user on every attempt, so a retry
 * merges against the cart as it actually is rather than against the copy that
 * lost the race.
 *
 * @returns {Promise<{user: object|null, cartLines: object[], extra: object}>}
 */
export async function replaceCart({ userId, build, attempts = MAX_MERGE_ATTEMPTS }) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const user = await userModel.findById(userId).lean()
        if (!user) return { user: null, cartLines: [], extra: {} }

        const version = user.cartVersion ?? 0
        const { cartLines, extra = {} } = await build(user)

        const result = await userModel.collection.updateOne(
            {
                _id: oid(userId),
                // `null` also matches a document written before `cartVersion`
                // existed, which is every user from Phase 0 and 1.
                cartVersion: version === 0 ? { $in: [0, null] } : version,
            },
            [
                { $set: { cartLines } },
                DERIVE_CART_DATA,
                { $set: { cartVersion: { $add: [{ $ifNull: ['$cartVersion', 0] }, 1] } } },
            ],
        )

        if (result.matchedCount === 1) return { user, cartLines, extra }
    }

    throw new ConflictError('Your cart changed while it was being merged. Please try again.', {
        details: `merge lost ${attempts} attempts to a concurrent cart write`,
    })
}
