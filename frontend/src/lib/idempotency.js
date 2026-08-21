// One checkout attempt, one key (DB-012).
//
// The server has supported `Idempotency-Key` since Phase 2 and the storefront
// never sent one, so the guarantee existed and nobody had it: a double-clicked
// "Place Order", a retry after a timeout, or a refresh mid-request each created
// a second order and decremented stock twice. `isSubmitting` is not a
// substitute — it does not survive the page reload that a customer performs
// precisely when they are unsure whether the order went through.
//
// The rule this module encodes:
//
//   * one key per **attempt**, where an attempt is a particular cart, address
//     and payment method;
//   * the same key is reused for every retry of that attempt, including after a
//     response the client cannot interpret — a timeout, a network failure, a
//     5xx — which is exactly when a retry is most likely and a duplicate order
//     most costly;
//   * a new key only when the request genuinely changes, or when the previous
//     attempt has been settled by an order actually being placed.

import { canonicalVariantId, toOptionsObject } from './variant.js'

/** The header the API reads. Must be on the CORS allow-list to survive preflight. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

/**
 * A fresh key.
 *
 * The character set is the server's (`KEY_PATTERN`): letters, digits, and
 * `_ . : @ -`. The prefix makes one legible in a log without identifying
 * anybody — there is nothing of the customer or the cart in it.
 */
export function newIdempotencyKey() {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (typeof uuid === 'string' && uuid !== '') return `netronix-${uuid}`
    // Older browsers, and jsdom without webcrypto. Not a security boundary:
    // the key only has to be unique among this browser's own attempts.
    return `netronix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** Stable JSON: object keys sorted, so field order cannot change the result. */
function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

/**
 * What makes two submissions the same attempt.
 *
 * Deliberately the same three things the server fingerprints — the lines, the
 * address and the payment method — so that "the client thinks this is a retry"
 * and "the server thinks this is a retry" cannot disagree.
 */
export function attemptFingerprint({ items = [], address = {}, paymentMethod = 'COD' } = {}) {
    const grouped = new Map()
    for (const item of items) {
        const productId = String(item?.productId ?? '')
        const variant = item?.variantOptions !== undefined && item?.variantOptions !== null
            ? canonicalVariantId(toOptionsObject(item.variantOptions))
            : typeof item?.variantId === 'string'
                ? item.variantId
                : typeof (item?.variantKey ?? item?.size) === 'string'
                    ? (item.variantKey ?? item.size)
                    : ''
        const key = `${productId}\u0000${variant}`
        const quantity = Number(item?.quantity ?? 0)
        const current = grouped.get(key)
        if (current) current.quantity += quantity
        else grouped.set(key, { productId, variant, quantity })
    }
    const lines = [...grouped.values()].sort((a, b) => {
        const left = `${a.productId}|${a.variant}`
        const right = `${b.productId}|${b.variant}`
        return left < right ? -1 : left > right ? 1 : 0
    })

    return canonicalJson({ lines, address, paymentMethod: String(paymentMethod) })
}

/** The browser slot holding the one checkout attempt that is not settled yet. */
export const CHECKOUT_ATTEMPT_STORAGE_KEY = 'netronix.checkoutAttempt.v1'

/** Read/write storage defensively: privacy settings may deny either operation. */
function readStoredAttempt(storage) {
    if (!storage) return null
    try {
        const parsed = JSON.parse(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY) || 'null')
        if (!parsed || typeof parsed.key !== 'string' || typeof parsed.fingerprint !== 'string') return null
        return parsed
    } catch {
        return null
    }
}

function storeAttempt(storage, value) {
    if (!storage) return
    try {
        if (value) storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(value))
        else storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
    } catch {
        // Idempotency still works for this mount when storage is unavailable.
    }
}

/**
 * The key-holder a checkout screen keeps until the outcome is definitive.
 * Session storage survives component remounts and reloads, but not a completed
 * attempt or a future browser session.
 *
 * @returns {{ keyFor: (request: object) => string, settle: () => void, current: string|null }}
 */
export function createCheckoutAttempt(storage) {
    if (storage === undefined) {
        try { storage = globalThis.sessionStorage } catch { storage = null }
    }
    const restored = readStoredAttempt(storage)
    let key = restored?.key ?? null
    let fingerprint = restored?.fingerprint ?? null

    return {
        /** The key for this submission: the one in hand, or a new one. */
        keyFor(request) {
            const next = attemptFingerprint(request)
            if (key === null || next !== fingerprint) {
                key = newIdempotencyKey()
                fingerprint = next
                storeAttempt(storage, { key, fingerprint })
            }
            return key
        },
        /**
         * The attempt is over — an order was placed. The next submission is a
         * new attempt even if it is byte-for-byte identical, because the
         * customer deliberately ordering the same things twice is a thing that
         * happens and must not be swallowed as a replay.
         */
        settle() {
            key = null
            fingerprint = null
            storeAttempt(storage, null)
        },
        get current() { return key },
    }
}
