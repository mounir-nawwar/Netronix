// Order request schemas.
//
// Findings: SEC-002 (the browser set the price), SEC-017 (any string was an
//           order status), BE-003.
//
// The legacy pricing fields, and why they are here
// ------------------------------------------------
// The storefront used to compute `amount`, `subtotal` and `delivery_fee` in the
// browser, and the server wrote them down verbatim. The storefront no longer
// sends any of them, and `orderService` never reads them — the server resolves
// every price from the database.
//
// They are nonetheless still *accepted*, for one specific reason: a browser tab
// holding a cached copy of the previous bundle will keep sending them, and the
// correct outcome for that request is a correctly-priced order, not a 400. So
// they are declared, validated far enough that an obviously hostile value is
// still rejected, and then dropped on the floor.
//
// Every other unknown field is refused outright (`.strict()`), so a *new*
// pricing-shaped field — `total`, `lineTotal`, `price` — cannot appear later and
// be quietly ignored the way these have to be.

import { z } from 'zod'

import { objectId, quantity, variantKey, variantOptions, address, paymentMethod, orderStatus, legacyIgnoredMoney, paginationQuery } from './common.js'

/**
 * One requested line.
 *
 * Three ways of naming a combination are accepted, and the order of preference
 * is the order of losslessness (DB-003, ARCH-003):
 *
 *   * `variantOptions` — `{ Size: "16-inch", Storage: "1TB" }`. Unambiguous by
 *     construction; what a redeployed client sends.
 *   * `variantKey`     — the new name for the legacy hyphen-joined string.
 *   * `size`           — the same string under its pre-Phase-2 name. The
 *     deployed storefront sends this, so it stays accepted for the whole
 *     rollout. It is refused at the service if it turns out to be ambiguous,
 *     rather than resolved to whichever combination happens to be first.
 *
 * At least one must be present, which `.refine` enforces — an item naming no
 * combination at all was previously indistinguishable from a variant-less one.
 */
const orderItem = z
    .object({
        productId: objectId,
        size: variantKey.optional(),
        variantKey: variantKey.optional(),
        variantOptions: variantOptions.optional(),
        quantity,
    })
    .strict()
    .refine(
        (item) => item.variantOptions !== undefined || item.variantKey !== undefined || item.size !== undefined,
        { message: 'must name a variant (variantOptions, variantKey or size)' },
    )

const orderBody = z
    .object({
        items: z.array(orderItem).min(1, 'must contain at least one item').max(100),
        address,
        paymentMethod: paymentMethod.optional().default('COD'),

        // Accepted, validated, and then ignored. See the note above.
        amount: legacyIgnoredMoney.optional(),
        subtotal: legacyIgnoredMoney.optional(),
        delivery_fee: legacyIgnoredMoney.optional(),
    })
    .strict()

export const placeOrderSchema = { body: orderBody }
export const placeGuestOrderSchema = { body: orderBody }

export const updateStatusSchema = {
    body: z
        .object({
            orderId: objectId,
            // SEC-017: `findByIdAndUpdate(orderId, { status })` accepted any
            // string, so "Delivered" could silently become anything at all.
            // Transition rules and a status history are Phase 2 (DB-008); the
            // enum is the Phase 1 half.
            status: orderStatus,
        })
        .strict(),
}

/**
 * Listing routes take no body beyond the verified token, and bounded paging in
 * the query string (BE-009).
 */
export const listOrdersSchema = {
    body: z.object({}).strip(),
    query: paginationQuery,
}
