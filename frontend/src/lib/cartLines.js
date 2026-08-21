// The cart, as lines (DB-003).
//
// A cart line used to be a number under a hyphen-joined key. For a catalog that
// really contains `["16-inch","16"] × ["1TB","inch-1TB"]` — every value of which
// this catalog sells — both `16-inch + 1TB` and `16 + inch-1TB` produce the key
// `16-inch-1TB`, so the two combinations were **the same line**: adding the
// second overwrote the first, and checkout had to reconstruct the options from
// the key and refuse when it could not.
//
// Refusing the reconstruction stops the wrong thing being bought. It does not
// let the customer buy the right thing. The identity has to be kept at the
// moment it is known, which is when the customer selects it — so a line carries
// the canonical id **and the option pairs themselves**.
//
// These live outside the provider so the context module exports components and
// context only, and so both the provider and the pages can share one definition
// of what a line is.

/**
 * Where it lives now (DB-003).
 *
 * A separate key, written beside the old one rather than over it: a cart line is
 * no longer a number under a hyphen-joined key but a record naming the
 * combination the customer chose. Both are written, so a browser that goes back
 * to a cached bundle still finds a cart it understands.
 */
export const GUEST_CART_LINES_KEY = 'guestCartLines'

/** A stable identity for a line, canonical where there is one. */
export const lineIdOf = (line) => (line?.variantId ?? `legacy:${line?.variantKey ?? ''}`)

/** The legacy `{ productId: { legacyKey: quantity } }` view of a line list. */
export function legacyProjection(lines) {
    const cartData = {}
    for (const line of lines ?? []) {
        const productId = String(line.productId)
        const key = line.variantKey ?? ''
        cartData[productId] = cartData[productId] ?? {}
        cartData[productId][key] = (cartData[productId][key] ?? 0) + Number(line.quantity)
    }
    return cartData
}

/** A legacy cart map, read as lines with no identity invented for them. */
export function linesFromLegacyCart(cartData) {
    const lines = []
    for (const [productId, variants] of Object.entries(cartData ?? {})) {
        if (!variants || typeof variants !== 'object') continue
        for (const [variantKey, quantity] of Object.entries(variants)) {
            const amount = Number(quantity)
            if (Number.isFinite(amount) && amount > 0) {
                lines.push({ productId, variantId: null, variantOptions: null, variantKey, quantity: amount })
            }
        }
    }
    return lines
}

/**
 * The guest cart's lines, or `null` when this browser has none stored.
 *
 * Untrusted input, exactly like `readGuestCart`: `localStorage` is editable and
 * survives across versions of this application, so a malformed line is dropped
 * rather than allowed to reach the cart maths as `NaN`.
 */
export function readGuestCartLines(storage = localStorage) {
    let raw
    try {
        raw = storage.getItem(GUEST_CART_LINES_KEY)
    } catch {
        return null
    }
    if (!raw) return null

    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return null
        return parsed
            .filter((line) => line && typeof line === 'object'
                && typeof line.productId === 'string'
                && Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0)
            .map((line) => ({
                productId: line.productId,
                variantId: typeof line.variantId === 'string' ? line.variantId : null,
                variantOptions: line.variantOptions && typeof line.variantOptions === 'object'
                    ? line.variantOptions
                    : null,
                variantKey: typeof line.variantKey === 'string' ? line.variantKey : '',
                quantity: Number(line.quantity),
            }))
    } catch {
        try { storage.removeItem(GUEST_CART_LINES_KEY) } catch { /* nothing to do */ }
        return null
    }
}

/**
 * What a caller means by "this combination".
 *
 * A string is the legacy key, which is what every existing call site sends. An
 * object either names the option pairs explicitly or *is* the option pairs.
 */
export function selectionOf(value) {
    if (typeof value === 'string') return { variantKey: value }
    if (value && typeof value === 'object') {
        if (value.variantOptions !== undefined || value.variantKey !== undefined || value.variantId !== undefined) {
            return { variantOptions: value.variantOptions, variantKey: value.variantKey, variantId: value.variantId }
        }
        return { variantOptions: value }
    }
    return { variantKey: '' }
}
