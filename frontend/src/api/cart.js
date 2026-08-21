// Cart (FE-006, FE-009, FE-019, DB-003).

import { post } from './client'

/**
 * The cart as lines.
 *
 * The server serves both shapes for the length of the rollout: `cartLines`
 * names each combination losslessly, and `cartData` is the legacy map a cached
 * bundle reads. A response with only the map is read as lines with **no**
 * identity invented for any of them — the catalog decides that, later, and
 * refuses when the key is ambiguous.
 */
export async function fetchCart() {
    const data = await post('/api/cart/get', {})
    return linesOf(data)
}

/** Whichever shape came back, as lines. */
function linesOf(data) {
    if (Array.isArray(data?.cartLines)) {
        return data.cartLines.map((line) => ({
            productId: String(line.productId),
            variantId: line.variantId ?? null,
            variantOptions: line.variantOptions ?? null,
            variantKey: line.variantKey ?? '',
            quantity: Number(line.quantity),
        }))
    }

    const lines = []
    for (const [productId, variants] of Object.entries(data?.cartData ?? {})) {
        if (!variants || typeof variants !== 'object') continue
        for (const [variantKey, quantity] of Object.entries(variants)) {
            if (Number(quantity) > 0) {
                lines.push({ productId, variantId: null, variantOptions: null, variantKey, quantity: Number(quantity) })
            }
        }
    }
    return lines
}

/**
 * Add to the cart.
 *
 * `variantOptions` is sent when the client knows the combination, which is
 * every time a customer chooses one. `variantKey` remains accepted for a caller
 * that only has the legacy string.
 */
export function addCartItem({ itemId, variantKey, variantOptions, quantity = 1 }) {
    return post('/api/cart/add', {
        itemId,
        ...(variantOptions ? { variantOptions } : { variantKey: variantKey ?? '' }),
        quantity,
    })
}

export function updateCartItem({ itemId, variantKey, variantOptions, quantity }) {
    return post('/api/cart/update', {
        itemId,
        ...(variantOptions ? { variantOptions } : { variantKey: variantKey ?? '' }),
        quantity,
    })
}

/**
 * Hand the guest cart over at login (FE-009).
 *
 * One request for the whole cart, because summing quantities line by line
 * across N requests is not atomic: a failure halfway leaves a cart neither side
 * chose, and the client cannot then know whether it is safe to clear its guest
 * copy.
 *
 * `lines` carries the combinations the customer actually selected. The legacy
 * map is sent alongside only for a line that has no canonical identity — one
 * recovered from an older bundle's storage — so nothing is lost either way.
 */
export async function mergeGuestCart(lines) {
    const data = await post('/api/cart/merge', {
        lines: (lines ?? []).map((line) => ({
            productId: String(line.productId),
            ...(line.variantOptions
                ? { variantOptions: line.variantOptions }
                : { variantKey: line.variantKey ?? '' }),
            quantity: Number(line.quantity),
        })),
    })
    return { cartLines: linesOf(data), cartData: data?.cartData ?? {}, capped: data?.capped ?? [] }
}
