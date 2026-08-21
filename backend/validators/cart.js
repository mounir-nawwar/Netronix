// Cart request schemas.
//
// Findings: BE-003 (the cart accepted an `itemId` that was not a product id at
//           all, and `cartData[itemId][variantKey] = quantity` threw a raw
//           TypeError back to the client when the entry did not exist).
//
// BE-004 — that `addToCart` ignored the `quantity` it was sent and hardcoded
// `+= 1` — is fixed in Phase 2, task 2.8. The field is now read by the
// controller, so its bounds are the bounds of what a single request can add.
// `0` remains legal and means "remove", which is what pruning a zeroed entry
// requires (DB-011).

import { z } from 'zod'

import { objectId, variantKey, variantOptions, stockQuantity } from './common.js'

/**
 * Naming a combination, in order of losslessness (DB-003).
 *
 * `variantOptions` is the identity: the option pairs themselves, unambiguous by
 * construction. `variantKey` is the pre-existing hyphen-joined string, still
 * accepted for the whole rollout because a cached storefront bundle sends it —
 * and still refused at the point of use when it turns out to name more than one
 * combination.
 *
 * At least one must be present. A request naming no combination at all was
 * previously indistinguishable from one naming the variant-less combination,
 * whose key is the empty string.
 */
const namesACombination = (body) => body.variantKey !== undefined || body.variantOptions !== undefined
const NAMING_MESSAGE = { message: 'must name a variant (variantKey or variantOptions)' }

export const addToCartSchema = {
    body: z
        .object({
            itemId: objectId,
            variantKey: variantKey.optional(),
            variantOptions: variantOptions.optional(),
            // Read by the controller since Phase 2 (BE-004). Defaults to 1 so a
            // client that sends no quantity behaves exactly as it always did.
            quantity: stockQuantity.optional().default(1),
        })
        .strict()
        .refine(namesACombination, NAMING_MESSAGE),
}

export const updateCartSchema = {
    body: z
        .object({
            itemId: objectId,
            variantKey: variantKey.optional(),
            variantOptions: variantOptions.optional(),
            quantity: stockQuantity,
        })
        .strict()
        .refine(namesACombination, NAMING_MESSAGE),
}

export const getCartSchema = {
    body: z.object({}).strip(),
}

/**
 * The guest cart handed over at login (FE-009).
 *
 * A guest cart lived only in `localStorage` and was **orphaned** the moment the
 * customer signed in: `getUserCart` overwrote local state with the server's, and
 * everything chosen before signing in was gone with no message. Merging it needs
 * the whole map in one request, because summing quantities per line across N
 * requests is not atomic and a failure halfway leaves the cart in a state
 * neither side chose.
 *
 * Bounds are deliberate: the payload comes from browser storage, which anyone
 * can edit, so a merge cannot be used to write an unbounded document.
 */
const MAX_MERGE_PRODUCTS = 200
const MAX_MERGE_VARIANTS_PER_PRODUCT = 50

const MAX_MERGE_LINES = MAX_MERGE_PRODUCTS * MAX_MERGE_VARIANTS_PER_PRODUCT

export const mergeCartSchema = {
    body: z
        .object({
            /**
             * The legacy guest cart, `{ productId: { legacyKey: quantity } }`.
             * Still accepted: a cached bundle has nothing else to send.
             */
            cart: z
                .record(
                    objectId,
                    z
                        .record(variantKey, stockQuantity)
                        .refine((variants) => Object.keys(variants).length <= MAX_MERGE_VARIANTS_PER_PRODUCT, {
                            message: `must name ${MAX_MERGE_VARIANTS_PER_PRODUCT} variants or fewer`,
                        }),
                )
                .refine((cart) => Object.keys(cart).length <= MAX_MERGE_PRODUCTS, {
                    message: `must name ${MAX_MERGE_PRODUCTS} products or fewer`,
                })
                .optional(),

            /**
             * The lossless guest cart. Two combinations whose keys collide are
             * two entries here, which is the whole reason this field exists.
             */
            lines: z
                .array(
                    z
                        .object({
                            productId: objectId,
                            variantKey: variantKey.optional(),
                            variantOptions: variantOptions.optional(),
                            quantity: stockQuantity,
                        })
                        .strict()
                        .refine(namesACombination, NAMING_MESSAGE),
                )
                .max(MAX_MERGE_LINES, `must name ${MAX_MERGE_LINES} lines or fewer`)
                .optional(),
        })
        .strict()
        .refine((body) => body.cart !== undefined || body.lines !== undefined, {
            message: 'must carry a cart or a list of lines',
        }),
}

export { MAX_MERGE_PRODUCTS, MAX_MERGE_VARIANTS_PER_PRODUCT }
