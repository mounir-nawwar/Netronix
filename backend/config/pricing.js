// Pricing constants (SEC-002).
//
// The delivery fee lived in the browser — `ShopContext.delivery_fee = 3` — and
// the server persisted whatever arrived. It is a server-side constant now, and
// the storefront's copy is presentational only.
//
// **Representation.** Phase 2 moved this to integer minor units (DB-004).
// `DELIVERY_FEE_MINOR` is the canonical figure; `DELIVERY_FEE` is the same
// number in major units, kept because the storefront, the admin console and the
// legacy `delivery_fee` field on every order all still read it. `roundMoney`
// survives for the same reason — the major-unit fields are still written — but
// nothing computes a total with it any more.

/**
 * Flat delivery fee.
 *
 * Phase 2 makes the minor-unit figure the canonical one (DB-004). `DELIVERY_FEE`
 * remains as the major-unit view of exactly the same number, because both
 * deployed clients and the legacy `delivery_fee` order field still read it.
 */
export const DELIVERY_FEE_MINOR = 300

/** The same fee, in whole currency units. Derived, never independently set. */
export const DELIVERY_FEE = DELIVERY_FEE_MINOR / 100

/**
 * Round a computed money value to two decimal places.
 *
 * Float arithmetic over major units is exactly why DB-006 exists: 0.1 + 0.2 is
 * 0.30000000000000004, and a subtotal of enough such lines drifts. Rounding at
 * the boundary keeps the persisted figure the one a human would compute, which
 * is the best that can be done without changing the representation.
 */
export const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100
