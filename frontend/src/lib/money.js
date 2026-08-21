// ---------------------------------------------------------------------------
// MIRROR of `backend/lib/money.js`. Keep the two byte-identical below this line.
//
// There is no shared package in this repository (ARCH-004) and creating one is
// Phase 3's API-client work. Until then the contract is held by a test rather
// than by a build step: `src/test/lib/money.contract.test.js` runs the same
// table of values as the backend's, so a divergence fails a suite instead of
// producing a total that disagrees with the server's.
// ---------------------------------------------------------------------------
// Money as integer minor units (DB-004, FE-018).
//
// Why this file exists
// --------------------
// Every monetary value in this project was an IEEE-754 double. `0.1 + 0.2` is
// `0.30000000000000004`, and `getCartAmount` accumulated `price * quantity`
// across an unbounded number of lines before the figure was persisted verbatim.
// Currency was implicit and contradictory — `'$'` in the storefront context,
// "3$" in the AI prompt, "Lebanon (LBP ل.ل)" in the footer.
//
// The representation is now an **integer count of minor units** (cents) plus an
// explicit ISO-4217 code. Integers are exact under addition and multiplication
// by a whole quantity, which is every arithmetic operation this system performs.
//
// What this is NOT
// ----------------
// This is not multi-currency support. `USD` is the single canonical currency;
// there is no exchange rate anywhere and none is implied. The `currency` field
// exists so that the number is unambiguous, not so that it can vary.
//
// Rollout
// -------
// Additive. `price` (major units, float) and `amount`/`subtotal`/`delivery_fee`
// stay on the documents and stay written, because an older cached browser bundle
// still reads them and because a rollback must not need a restore. Nothing in
// Phase 2 drops a legacy money field.
//
// This module is duplicated verbatim in `frontend/src/lib/money.js` and
// `admin/src/lib/money.js`. There is no shared package (ARCH-004) and creating
// one is Phase 3's API-client work; until then each copy carries the same
// contract test over the same table of values, so a divergence fails a suite.

/** The single canonical currency. ISO 4217. */
export const DEFAULT_CURRENCY = 'USD'

/** Currencies the code knows how to hold. Deliberately one entry. */
export const SUPPORTED_CURRENCIES = ['USD']

/**
 * Whether a value names a currency this system can actually hold.
 *
 * The constant above existed from Phase 2 and nothing consulted it, which is
 * how the schemas came to accept any three characters, migration 004 came to
 * preserve a legacy `LBP` while converting its price with `× 100` (wrong for a
 * zero-decimal currency), and an order total came to be a sum of two currencies
 * with a `USD` label on it. Every one of those paths asks this question now.
 *
 * Case-insensitive because the schemas upper-case on write and legacy documents
 * may not have.
 */
export function isSupportedCurrency(currency) {
    return typeof currency === 'string'
        && SUPPORTED_CURRENCIES.includes(currency.trim().toUpperCase())
}

export const MINOR_UNITS_PER_MAJOR = 100

/** The largest minor-unit value accepted anywhere: $1,000,000,000 - 0.01. */
export const MAX_MINOR = 100_000_000_000

/** True when `value` is an integer minor-unit amount this system will store. */
export const isMinorAmount = (value) =>
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR

/**
 * Convert a major-unit value (19.99) to minor units (1999).
 *
 * `Math.round(value * 100)` is the conversion the remediation plan specifies.
 * It is correct for every value a price field can legitimately hold, and the
 * guards below turn everything else — NaN, Infinity, a string, a negative, an
 * implausible magnitude — into a thrown error rather than a silent 0 or NaN
 * written to a document.
 *
 * @param {number} major
 * @returns {number} integer minor units
 */
export function toMinor(major) {
    const value = typeof major === 'number' ? major : Number(major)
    if (!Number.isFinite(value)) {
        throw new RangeError(`cannot convert a non-finite value to minor units: ${String(major)}`)
    }
    if (value < 0) {
        throw new RangeError('cannot convert a negative value to minor units')
    }
    const minor = Math.round(value * MINOR_UNITS_PER_MAJOR)
    if (!isMinorAmount(minor)) {
        throw new RangeError(`minor-unit conversion produced an unusable integer: ${minor}`)
    }
    return minor
}

/**
 * Convert minor units back to a major-unit number, for the legacy fields and
 * for any consumer that has not moved yet.
 *
 * The division is the only place a float appears, and it happens at the edge,
 * after all arithmetic is done.
 */
export function toMajor(minor) {
    if (!isMinorAmount(minor)) {
        throw new RangeError(`not an integer minor-unit amount: ${String(minor)}`)
    }
    return minor / MINOR_UNITS_PER_MAJOR
}

/** Exact multiplication of a minor amount by a whole quantity. */
export function multiplyMinor(minor, quantity) {
    if (!isMinorAmount(minor)) throw new RangeError(`not an integer minor-unit amount: ${String(minor)}`)
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
        throw new RangeError(`quantity must be a non-negative whole number: ${String(quantity)}`)
    }
    const total = minor * quantity
    if (!isMinorAmount(total)) throw new RangeError(`line total overflows the money range: ${total}`)
    return total
}

/** Exact addition. Variadic so a cart total is one call and one check. */
export function sumMinor(...amounts) {
    let total = 0
    for (const amount of amounts.flat()) {
        if (!isMinorAmount(amount)) throw new RangeError(`not an integer minor-unit amount: ${String(amount)}`)
        total += amount
    }
    if (!isMinorAmount(total)) throw new RangeError(`total overflows the money range: ${total}`)
    return total
}

/**
 * Read a money value off a document that may be in either representation.
 *
 * This is the dual-read half of the rollout: a product written before the
 * migration has `price` and no `priceMinor`; one written after has both. Order
 * lines are the same. Preferring the minor field means a migrated document is
 * exact, and falling back to the major field means an unmigrated one still
 * renders rather than showing zero.
 *
 * @param {object} source
 * @param {string} minorField
 * @param {string} majorField
 * @returns {number|null} minor units, or null when neither field is usable
 */
export function readMinor(source, minorField, majorField) {
    if (!source || typeof source !== 'object') return null
    const minor = source[minorField]
    if (isMinorAmount(minor)) return minor
    const major = source[majorField]
    if (typeof major === 'number' && Number.isFinite(major) && major >= 0) {
        try {
            return toMinor(major)
        } catch {
            return null
        }
    }
    return null
}

/**
 * Format for display. `Intl.NumberFormat`, never string concatenation.
 *
 * FE-018 was `{currency} {getCartAmount()}.00`, which rendered a float total as
 * `$1299.99.00`. There is no way to build a correct money string by hand; there
 * is a built-in that does it.
 */
export function formatMoney(minor, { currency = DEFAULT_CURRENCY, locale = 'en-US' } = {}) {
    const amount = isMinorAmount(minor) ? minor / MINOR_UNITS_PER_MAJOR : 0
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)
}

/** Format a major-unit value that has not been migrated yet. */
export function formatMajor(major, options = {}) {
    const value = typeof major === 'number' && Number.isFinite(major) && major >= 0 ? major : 0
    return formatMoney(Math.round(value * MINOR_UNITS_PER_MAJOR), options)
}
