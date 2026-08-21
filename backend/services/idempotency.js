// Idempotency keys for order creation (DB-012, the remainder of SEC-011).
//
// There was no idempotency anywhere. A double-click, a retried request or a
// flaky connection created **two orders and decremented inventory twice**; the
// storefront's only guard was an `isSubmitting` flag, which does not survive a
// page refresh mid-request. The guest endpoint is unauthenticated, so replay was
// trivially scriptable.
//
// Three decisions worth stating.
//
// **Scope.** A key alone is not enough. `abc-123` is a plausible thing for two
// unrelated callers to send, and if the key were the whole identity the second
// of them would be handed the first one's order — address included. So the
// unique constraint is over `(scope, key)`, where the scope is the principal:
// `user:<id>` for a customer, and for a guest a **digest** of the caller's
// network address. It is one-way: nothing about the caller can be read back out
// of a stored scope, and no part of the delivery address is in it.
//
// **Fingerprint.** Replaying a key with a *different* payload is a client bug or
// an attack, not a retry, so it is a 409 rather than a silent success. The
// fingerprint is taken over the canonicalised request — items sorted, variant
// identity canonical, address included — and **never over a client-supplied
// price**, because no client-supplied price is trusted (SEC-002).
//
// **Absent keys stay legal.** The deployed storefront does not send one. Making
// the header mandatory would break every cached bundle, so an order without a
// key behaves exactly as it did before and is excluded from the unique index by
// its partial filter. When a key *is* supplied, replay behaviour is guaranteed.

import { createHash } from 'node:crypto'

import { canonicalVariantId, toOptionsObject } from '../lib/variant.js'
import { ValidationError } from '../errors/AppError.js'

export const IDEMPOTENCY_HEADER = 'idempotency-key'
/**
 * Bounds, not an entropy policy.
 *
 * The server cannot verify that a key is unpredictable, so the floor only
 * rejects the values that are obviously not keys at all — an empty string, a
 * single character, a stray `-`. The ceiling is the one that matters: it is what
 * keeps an unbounded header out of a unique index.
 */
export const MIN_KEY_LENGTH = 4
export const MAX_KEY_LENGTH = 200
/** Printable, unambiguous, and safe to put in a log line or an index. */
export const KEY_PATTERN = /^[A-Za-z0-9_.:@-]+$/

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/**
 * Read and validate the header.
 *
 * @returns {string|null} the key, or null when the caller sent none.
 * @throws {ValidationError} when one was sent but is unusable.
 */
export function readIdempotencyKey(req) {
    const raw = req?.headers?.[IDEMPOTENCY_HEADER]
    if (raw === undefined || raw === null) return null

    // A repeated header arrives as an array. Two different values is not a
    // retry of anything.
    if (Array.isArray(raw)) {
        throw new ValidationError('Invalid request', {
            fields: { 'Idempotency-Key': ['must be sent at most once'] },
        })
    }

    const key = String(raw).trim()
    if (key === '') return null

    if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
        throw new ValidationError('Invalid request', {
            fields: { 'Idempotency-Key': [`must be between ${MIN_KEY_LENGTH} and ${MAX_KEY_LENGTH} characters`] },
        })
    }
    if (!KEY_PATTERN.test(key)) {
        throw new ValidationError('Invalid request', {
            fields: { 'Idempotency-Key': ['contains characters that are not allowed'] },
        })
    }
    return key
}

/**
 * The principal a key belongs to.
 *
 * A customer is their user id — stable, already authenticated, and not a secret
 * to the server. A guest has no identity, so the closest safe stand-in is a
 * digest of the network address the request came from. Two different guests
 * therefore cannot collide onto each other's orders, and the stored value
 * reveals nothing: it is a SHA-256 digest, and the delivery address is not part
 * of it.
 */
export function idempotencyScope({ userId = null, req = null } = {}) {
    if (userId) return `user:${userId}`
    const address = req?.ip ?? req?.socket?.remoteAddress ?? 'unknown'
    return `guest:${sha256(String(address))}`
}

/** Stable JSON: object keys sorted, so field order cannot change a digest. */
function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

/**
 * The identity of one requested combination, in whichever form it was named.
 *
 * The bug this replaces read `item.variantId ?? item.variantKey ?? item.size`
 * and stopped there. `variantOptions` — the **lossless** form, the one the
 * validator prefers and the redeployed storefront sends — has none of those
 * three fields, so every line fingerprinted to the empty string and two
 * checkout attempts for two *different* combinations of the same product were
 * indistinguishable. Under one key the second was answered as a retry of the
 * first, and the customer who ordered White received the order for Black.
 *
 * `canonicalVariantId` is injective and order-independent, so `{Size:'L',
 * Colour:'Black'}` and `{Colour:'Black', Size:'L'}` are the same request and a
 * different combination never is.
 *
 * The canonical and legacy forms share this one field without ambiguity: a
 * canonical identity always contains `=`, and `VARIANT_KEY_PATTERN` does not
 * permit `=` in a legacy key, so no legacy key can collide with the identity of
 * a different combination. Both forms agree on the empty string, which is the
 * one combination a variant-less product has.
 */
function variantIdentity(item) {
    if (item?.variantOptions !== undefined && item?.variantOptions !== null) {
        return canonicalVariantId(toOptionsObject(item.variantOptions))
    }
    if (typeof item?.variantId === 'string') return item.variantId
    const legacy = item?.variantKey ?? item?.size
    return typeof legacy === 'string' ? legacy : ''
}

/**
 * A digest of what was actually asked for.
 *
 * Lines are sorted by product and variant identity so that reordering the cart
 * is not treated as a different request. Money is absent by construction —
 * the caller does not get to state a price, so a price cannot be part of what
 * makes two requests "the same".
 */
export function requestFingerprint({ items = [], address = {}, paymentMethod = 'COD' } = {}) {
    const grouped = new Map()
    for (const item of items) {
        const productId = String(item.productId ?? '')
        const variant = variantIdentity(item)
        const key = `${productId}\u0000${variant}`
        const quantity = Number(item.quantity ?? 0)
        const current = grouped.get(key)
        if (current) current.quantity += quantity
        else grouped.set(key, { productId, variant, quantity })
    }
    const lines = [...grouped.values()]
        .sort((a, b) => {
            const left = `${a.productId}|${a.variant}`
            const right = `${b.productId}|${b.variant}`
            return left < right ? -1 : left > right ? 1 : 0
        })

    return sha256(canonicalJson({ lines, address, paymentMethod: String(paymentMethod) }))
}

export { variantIdentity }
