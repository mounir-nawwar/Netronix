import mongoose from "mongoose"

import userModel from "../models/userModel.js"
import productModel from "../models/productModel.js"
import { canonicalVariantId, entriesOf, resolveVariant, VariantResolutionError } from "../lib/variant.js"
import { addCartQuantity, replaceCart, setCartQuantity } from "../services/cartWrites.js"
import { asyncHandler, ConflictError, NotFoundError } from "../errors/AppError.js"

// Phase 2 closes BE-004 and DB-011; the final correction closes the rest of
// DB-003 on this side.
//
// **BE-004 — the quantity was ignored.** `addToCart` destructured only
// `{ itemId, variantKey }` and hardcoded `+= 1`, while the storefront kept the
// number the customer actually chose in local state. The two carts diverged
// silently, and the divergence only surfaced at checkout.
//
// **BE-004 — nothing checked stock.** A cart could hold 500 of a product with 1
// in stock, right up to the moment the order failed.
//
// **DB-011 — removal wrote `0`.** The key stayed for ever, so a long-lived
// account accumulated zero-quantity entries indefinitely inside the user
// document, toward MongoDB's 16 MB limit. Removal now deletes the line, and a
// product whose last variant is removed loses its entry too.
//
// **DB-003 — a cart line could not name its combination.** A line was a number
// under a hyphen-joined key, so for a catalog containing
// `["16-inch","16"] × ["1TB","inch-1TB"]` the combinations `16-inch + 1TB` and
// `16 + inch-1TB` were the *same line*: the second overwrote the first. The
// identity is now kept at the moment the customer chooses it, in `cartLines`,
// as the canonical id and the option pairs themselves. `cartData` is derived
// from it on every write so a cached bundle keeps working.
//
// One deliberate limit on the stock check
// ---------------------------------------
// The cap applies to a variant the catalog can actually resolve. A key that
// resolves to nothing — a stale bookmark, a combination that was withdrawn, or
// the legacy `{ variants: [], inventory: { Black: 5 } }` shape — is still
// accepted into the cart, because **a cart is an intention, not a reservation**.
// Checkout is the enforcement point and it fails closed there (`orderService`
// returns 400 for an unknown combination and 409 for an ambiguous one). Refusing
// at add-time as well would turn a recoverable "this is no longer available at
// checkout" into an unexplained button that does nothing.

/**
 * Work out which line a request means, and what should be stored for it.
 *
 * Three outcomes, and the difference between them is the point:
 *
 *   * **Resolved.** The combination is identified — from the option pairs the
 *     client sent, or from a legacy key that names exactly one combination.
 *     Recovering a *unique* answer is not guessing. The stored line carries the
 *     canonical id, the option pairs and the legacy key.
 *   * **Unresolved.** A legacy key that names none, or more than one. Nothing
 *     invents an identity: the line is stored by its key with `variantId: null`,
 *     and `getUserCart` reports it so the customer can remove it.
 *   * **Absent product.** Same treatment — the cart keeps the intention.
 *
 * @returns {{identity: object, template: object, available: number|null, reason: string|null}}
 */
async function resolveCartLine(productId, { variantKey, variantOptions }) {
    const product = await productModel.findById(productId)
    const usable = product && !product.archived ? product : null

    if (usable) {
        try {
            const entry = resolveVariant(usable, { variantOptions, variantKey })
            return {
                identity: { variantId: entry.variantId },
                template: {
                    productId: String(productId),
                    variantId: entry.variantId,
                    variantOptions: entry.options,
                    variantKey: entry.legacyKey,
                },
                available: entry.quantity,
                reason: null,
            }
        } catch (error) {
            if (!(error instanceof VariantResolutionError)) throw error

            // Option pairs that resolve to nothing are still a canonical
            // identity — the customer named a combination, it just is not one
            // this product has. Storing the id keeps two such lines distinct.
            if (variantOptions !== undefined && variantOptions !== null) {
                const variantId = canonicalVariantId(variantOptions)
                return {
                    identity: { variantId },
                    template: {
                        productId: String(productId),
                        variantId,
                        variantOptions,
                        variantKey: variantKey ?? '',
                    },
                    available: null,
                    reason: error.code,
                }
            }

            return legacyLine(productId, variantKey ?? '', error.code)
        }
    }

    if (variantOptions !== undefined && variantOptions !== null) {
        const variantId = canonicalVariantId(variantOptions)
        return {
            identity: { variantId },
            template: {
                productId: String(productId),
                variantId,
                variantOptions,
                variantKey: variantKey ?? '',
            },
            available: null,
            reason: 'PRODUCT_GONE',
        }
    }

    return legacyLine(productId, variantKey ?? '', 'PRODUCT_GONE')
}

/**
 * The cart as lines, whichever shape it is stored in.
 *
 * A cart written before `cartLines` existed lives entirely in `cartData`. It is
 * read as lines here so every path below has one representation to work with.
 */
function storedLinesOf(userData) {
    const lines = userData?.cartLines ?? []
    return lines.length > 0 ? lines : linesFromLegacyCartData(userData?.cartData)
}

/**
 * Populate `cartLines` from the legacy map before writing to it.
 *
 * Not a migration and not destructive: it derives an additive field from data
 * that is already there, and `cartData` is rebuilt to exactly what it was. It
 * has to happen before a write because every write re-derives `cartData` **from**
 * `cartLines` — so touching one line of a legacy-only cart would otherwise
 * rebuild the map from a single line and drop the rest.
 *
 * The filter makes it a no-op if another request got there first.
 */
async function upgradeLegacyCart(userId, userData) {
    if ((userData?.cartLines ?? []).length > 0) return userData

    const legacy = linesFromLegacyCartData(userData?.cartData)
    if (legacy.length === 0) return userData

    // Each key is resolved through the catalog on the way in. A key naming
    // exactly one combination gains its canonical identity and its option pairs
    // — recovering a *unique* answer is not guessing — and one naming none or
    // more than one keeps `variantId: null` and stays quarantined.
    const upgraded = []
    for (const line of legacy) {
        const { template } = await resolveCartLine(line.productId, { variantKey: line.variantKey })
        upgraded.push({ ...template, quantity: line.quantity })
    }

    await userModel.collection.updateOne(
        {
            _id: new mongoose.Types.ObjectId(String(userId)),
            $or: [{ cartLines: { $exists: false } }, { cartLines: { $size: 0 } }],
        },
        { $set: { cartLines: upgraded } },
    )
    return userModel.findById(userId).lean()
}

/** A line with no identity but the key it came with. Never an invented one. */
function legacyLine(productId, variantKey, reason) {
    return {
        identity: { variantKey },
        template: {
            productId: String(productId),
            variantId: null,
            variantOptions: null,
            variantKey,
        },
        available: null,
        reason,
    }
}

// add products to user cart
const addToCart = asyncHandler(async (req, res) => {
    const { itemId, variantKey, variantOptions, quantity = 1 } = req.validated.body

    const userData = await userModel.findById(req.auth.userId).lean()
    if (!userData) throw new NotFoundError('User not found')
    await upgradeLegacyCart(req.auth.userId, userData)

    const { identity, template, available } = await resolveCartLine(itemId, { variantKey, variantOptions })

    // One operation: the addition, the cap and the pruning of a line that goes
    // to zero. It used to be read-whole-map, change one entry, write whole map
    // back — so two additions in flight at once lost one of them, and two
    // additions of the last unit could both pass a check neither of them held.
    const { matched } = await addCartQuantity({
        userId: req.auth.userId,
        productId: itemId,
        identity,
        template,
        delta: Number(quantity),
        available,
    })

    if (!matched) {
        const stored = await currentQuantityOf(req.auth.userId, itemId, identity)
        throw new ConflictError('There is not enough stock for that option', {
            details: `product ${itemId} variant "${template.variantId ?? template.variantKey}": ${available} available, ${stored + Number(quantity)} requested`,
        })
    }

    res.json({ success: true, message: "Cart Updated" })
})

/** What the cart holds for one line right now. Used only to explain a refusal. */
async function currentQuantityOf(userId, productId, identity) {
    const user = await userModel.findById(userId).lean()
    const line = (user?.cartLines ?? []).find((candidate) => sameLine(candidate, productId, identity))
    return Number(line?.quantity ?? 0)
}

/** Whether a stored line is the one an identity names. */
function sameLine(line, productId, identity) {
    if (String(line.productId) !== String(productId)) return false
    if (identity.variantId !== undefined && identity.variantId !== null) {
        return line.variantId === identity.variantId
    }
    return (line.variantId ?? null) === null && (line.variantKey ?? '') === (identity.variantKey ?? '')
}

// update products to user cart
const updateCart = asyncHandler(async (req, res) => {
    const { itemId, variantKey, variantOptions, quantity } = req.validated.body

    const loaded = await userModel.findById(req.auth.userId).lean()
    if (!loaded) throw new NotFoundError('User not found')
    const userData = await upgradeLegacyCart(req.auth.userId, loaded)

    const { identity, template, available } = await resolveCartLine(itemId, { variantKey, variantOptions })

    // `cartData[itemId][variantKey] = quantity` on an absent entry threw
    // "Cannot set properties of undefined", and that text was returned to the
    // client verbatim. It is a 404 now: the entry genuinely is not there.
    const present = storedLinesOf(userData).some((line) => sameLine(line, itemId, identity))
    if (!present) throw new NotFoundError('That item is not in your cart')

    // The existence check rides in the filter as well as being read above, so a
    // line another request removed in the meantime is not silently recreated —
    // and, as with `addToCart`, only this one line is written.
    const { matched } = await setCartQuantity({
        userId: req.auth.userId,
        productId: itemId,
        identity,
        template,
        quantity: Number(quantity),
        available: Number(quantity) > 0 ? available : null,
    })

    if (!matched) {
        const stored = await currentQuantityOf(req.auth.userId, itemId, identity)
        if (stored === 0) throw new NotFoundError('That item is not in your cart')
        throw new ConflictError('There is not enough stock for that option', {
            details: `product ${itemId} variant "${template.variantId ?? template.variantKey}": ${available} available, ${quantity} requested`,
        })
    }

    res.json({ success: true, message: "Cart Updated" })
})

/**
 * Merge a guest cart into the signed-in customer's cart (FE-009).
 *
 * A guest cart lived in `localStorage`, and signing in threw it away: the login
 * path called `getUserCart`, which replaced local state wholesale. Everything
 * chosen before signing in vanished with no message — the customer's own work,
 * silently discarded at exactly the moment they committed to the site.
 *
 * Three properties this has to have, and each is a decision:
 *
 *   * **Summed, not replaced.** Both carts are the same person's intent. Two of
 *     something in each is four, not two.
 *   * **Capped at real stock**, resolved through the Phase 2 variant helpers so
 *     `16-inch` and `RTX-4090` cap against the row the customer actually chose.
 *     A combination the catalog cannot identify keeps the summed quantity, for
 *     the same reason `addToCart` does: a cart is an intention, not a
 *     reservation, and checkout is where it fails closed.
 *   * **One write**, guarded by the version it was built from. Without that
 *     guard a line added in another tab while the merge was resolving stock was
 *     simply erased.
 *
 * Both guest shapes are accepted: `lines`, which names each combination
 * losslessly, and the legacy `cart` map, which a cached bundle still sends.
 */
const mergeCart = asyncHandler(async (req, res) => {
    const { cart, lines } = req.validated.body

    const incoming = []
    for (const line of lines ?? []) {
        incoming.push({
            productId: line.productId,
            variantKey: line.variantKey,
            variantOptions: line.variantOptions,
            quantity: Number(line.quantity),
        })
    }
    for (const [productId, variants] of Object.entries(cart ?? {})) {
        for (const [variantKey, quantity] of Object.entries(variants)) {
            incoming.push({ productId, variantKey, variantOptions: undefined, quantity: Number(quantity) })
        }
    }

    const loaded = await userModel.findById(req.auth.userId).lean()
    if (!loaded) throw new NotFoundError('User not found')
    await upgradeLegacyCart(req.auth.userId, loaded)

    // Resolved once, outside the retry: the catalog does not change between
    // attempts and a 3x3 matrix would otherwise be read nine times per attempt.
    const resolved = []
    for (const line of incoming) {
        if (line.quantity <= 0) continue
        resolved.push({ ...(await resolveCartLine(line.productId, line)), quantity: line.quantity })
    }

    const { user, cartLines: merged, extra } = await replaceCart({
        userId: req.auth.userId,
        async build(userData) {
            const next = storedLinesOf(userData).map((line) => ({
                productId: String(line.productId),
                variantId: line.variantId ?? null,
                variantOptions: line.variantOptions ?? null,
                variantKey: line.variantKey ?? '',
                quantity: Number(line.quantity),
            }))
            const capped = []

            for (const { identity, template, available, quantity } of resolved) {
                const index = next.findIndex((line) => sameLine(line, template.productId, identity))
                const existing = index === -1 ? 0 : next[index].quantity
                let wanted = existing + quantity

                if (available !== null && wanted > available) {
                    capped.push({
                        productId: template.productId,
                        variantKey: template.variantKey,
                        variantId: template.variantId,
                        requested: wanted,
                        available,
                    })
                    wanted = available
                }

                if (wanted <= 0) {
                    if (index !== -1) next.splice(index, 1)
                    continue
                }
                if (index === -1) next.push({ ...template, quantity: wanted })
                else next[index] = { ...next[index], ...template, quantity: wanted }
            }

            return { cartLines: next, extra: { capped } }
        },
    })

    if (!user) throw new NotFoundError('User not found')

    res.json({
        success: true,
        message: 'Cart Merged',
        cartData: legacyProjection(merged),
        cartLines: presentLines(merged),
        capped: extra.capped,
    })
})

/** The legacy `{ productId: { legacyKey: quantity } }` view of a line list. */
function legacyProjection(lines) {
    const cartData = {}
    for (const line of lines ?? []) {
        const productId = String(line.productId)
        const key = line.variantKey ?? ''
        cartData[productId] = cartData[productId] ?? {}
        cartData[productId][key] = (cartData[productId][key] ?? 0) + Number(line.quantity)
    }
    return cartData
}

/** A stored line in the shape the API serves. `Map` options become an object. */
function presentLines(lines) {
    return (lines ?? []).map((line) => ({
        productId: String(line.productId),
        variantId: line.variantId ?? null,
        variantOptions: line.variantOptions
            ? (line.variantOptions instanceof Map ? Object.fromEntries(line.variantOptions) : line.variantOptions)
            : null,
        variantKey: line.variantKey ?? '',
        quantity: Number(line.quantity),
    }))
}

/**
 * Every cart line the catalog cannot identify, and why (DB-003).
 *
 * A legacy cart key is a hyphen join, and for a catalog that really contains
 * `["16-inch","16"] × ["1TB","inch-1TB"]` the key `16-inch-1TB` names two
 * different combinations. Nothing may choose between them — picking the first,
 * which `labelFor` used to do, moves stock at random and shows the customer a
 * combination they did not select.
 *
 * So the line stays in the cart exactly as it is (a cart is an intention, and
 * deleting someone's line for them is not this endpoint's decision) and it is
 * *reported*, with a reason the client can act on. The storefront's recovery
 * path is already there: an unresolvable line blocks checkout and every row has
 * a remove control.
 */
async function describeLines(lines) {
    const productIds = [...new Set((lines ?? []).map((line) => String(line.productId)))]
    if (productIds.length === 0) return { lines: [], unresolvable: [] }

    const products = await productModel.find({ _id: { $in: productIds } })
    const byId = new Map(products.map((product) => [String(product._id), product]))

    const described = []
    const unresolvable = []

    for (const line of lines) {
        const productId = String(line.productId)
        const product = byId.get(productId)
        const served = presentLines([line])[0]

        if (!product) {
            unresolvable.push({
                productId,
                variantKey: served.variantKey,
                variantId: served.variantId,
                reason: 'PRODUCT_GONE',
                message: 'This product is no longer in the catalog.',
            })
            described.push({ ...served, unresolvable: 'PRODUCT_GONE' })
            continue
        }

        try {
            const entry = resolveVariant(product, {
                variantOptions: served.variantOptions ?? undefined,
                variantId: served.variantId ?? undefined,
                ...(served.variantId === null ? { variantKey: served.variantKey } : {}),
            })
            // A legacy line whose key names exactly one combination is served
            // with the options recovered — a unique answer is not a guess — but
            // it is not rewritten in storage until something writes to it.
            described.push({
                ...served,
                variantId: served.variantId ?? entry.variantId,
                variantOptions: served.variantOptions ?? entry.options,
                unresolvable: null,
            })
        } catch (error) {
            if (!(error instanceof VariantResolutionError)) throw error
            unresolvable.push({
                productId,
                variantKey: served.variantKey,
                variantId: served.variantId,
                reason: error.code,
                message: error.code === 'AMBIGUOUS_VARIANT'
                    ? 'This option matches more than one combination and cannot be identified. Please remove it and choose again.'
                    : 'This option is no longer available. Please remove it and choose again.',
            })
            described.push({ ...served, unresolvable: error.code })
        }
    }

    return { lines: described, unresolvable }
}

/**
 * A cart written before `cartLines` existed, read as lines.
 *
 * Nothing is written back: the upgrade happens the next time the customer
 * touches the line, which keeps this endpoint a read.
 */
function linesFromLegacyCartData(cartData) {
    const lines = []
    for (const [productId, variants] of Object.entries(cartData ?? {})) {
        if (!variants || typeof variants !== 'object') continue
        for (const [variantKey, quantity] of Object.entries(variants)) {
            if (Number(quantity) <= 0) continue
            lines.push({ productId, variantId: null, variantOptions: null, variantKey, quantity: Number(quantity) })
        }
    }
    return lines
}

// get user cart data
const getUserCart = asyncHandler(async (req, res) => {
    const userData = await userModel.findById(req.auth.userId).lean()
    if (!userData) throw new NotFoundError('User not found')

    const stored = storedLinesOf(userData)

    const { lines, unresolvable } = await describeLines(stored)

    res.json({
        success: true,
        // The legacy map, still first, still the shape a cached bundle reads.
        cartData: legacyProjection(stored),
        // The lossless view: one entry per combination the customer chose.
        cartLines: lines,
        // Additive: an older bundle ignores it, a current one can explain the
        // line instead of showing "0 available" for something it cannot even
        // identify.
        unresolvable,
    })
})

export { addToCart, updateCart, getUserCart, mergeCart, entriesOf }
