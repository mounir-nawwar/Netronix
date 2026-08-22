// Product request schemas.
//
// Findings: BE-003, SEC-009 (a malformed id surfaced a raw Mongoose CastError),
//           SEC-018 (client key interpolated into a Mongo update path),
//           ADM-009 (no price validation at all — `Number(price)` accepted
//           negatives, and `Number('lots')` produced NaN).

import { z } from 'zod'

import {
    objectId,
    boundedString,
    positivePrice,
    stockQuantity,
    variantKey,
    variantOptions,
    tag,
    paginationQuery,
    includeArchivedQuery,
} from './common.js'
import { SHOWCASE_SLOTS } from '../lib/showcase.js'

export const singleProductSchema = {
    body: z.object({ productId: objectId }).strict(),
}

export const removeProductSchema = {
    body: z.object({ id: objectId }).strict(),
}

export const checkInventorySchema = {
    body: z.object({ productId: objectId }).strict(),
}

export const updateInventorySchema = {
    body: z
        .object({
            productId: objectId,
            // Character-level validation only. Whether the key names a
            // combination this product actually has needs the document, so
            // `resolveVariant` does that part in the controller (SEC-018).
            variantKey: variantKey.optional(),
            // The lossless form (DB-003). Preferred when both are sent.
            variantOptions: variantOptions.optional(),
            quantity: stockQuantity,
            priceDelta: z.number().finite().optional(),
        })
        .strict()
        .refine((body) => body.variantKey !== undefined || body.variantOptions !== undefined, {
            message: 'must name a variant (variantKey or variantOptions)',
        }),
}

export const productsByTagSchema = {
    params: z.object({ tag }).strict(),
    query: paginationQuery.merge(includeArchivedQuery),
}

/** Bounded paging plus the admin's archived filter, for the catalog listings. */
export const listProductSchema = {
    query: paginationQuery.merge(includeArchivedQuery),
}

export const tagsSchema = {
    query: includeArchivedQuery,
}

/** Soft delete and its inverse (DB-007, ADM-003). */
export const archiveProductSchema = {
    body: z.object({ id: objectId }).strict(),
}

/**
 * The text half of the add-product multipart form.
 *
 * Multipart fields are always strings, so numbers and booleans are coerced
 * explicitly rather than left to `Number(price)`, which silently produced NaN
 * for `'lots'` and accepted `-10` without comment.
 *
 * `variants`, `inventory` and `tags` arrive as JSON strings; they are parsed
 * and shape-checked by `parseJsonField` in the controller, because a parse
 * failure has to become a clean 400 rather than an uncaught `SyntaxError`.
 */
export const addProductSchema = {
    body: z
        .object({
            name: boundedString(200, 'Name'),
            description: boundedString(5000, 'Description'),
            price: z
                .string({ required_error: 'is required' })
                .trim()
                .min(1, 'is required')
                .transform((value, ctx) => {
                    const parsed = Number(value)
                    if (!Number.isFinite(parsed)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a number' })
                        return z.NEVER
                    }
                    return parsed
                })
                .pipe(positivePrice),
            brand: z.string().trim().max(100).optional().default(''),
            bestSeller: z
                .union([z.literal('true'), z.literal('false'), z.boolean()])
                .optional()
                .default(false)
                .transform((value) => value === true || value === 'true'),
            // Raw JSON strings; parsed in the controller.
            variants: z.string().max(20000).optional(),
            inventory: z.string().max(20000).optional(),
            // The lossless variant inventory (DB-003). Sent alongside the legacy
            // bag during the rollout; authoritative when present.
            inventoryV2: z.string().max(40000).optional(),
            tags: z.string().max(5000).optional(),
            // Which homepage surfaces the product belongs to (FE-004). The
            // schema is `.strict()`, so omitting this here made every add from
            // the console a 400 the moment the form started sending it.
            showcase: z.string().max(2000).optional(),
        })
        .strict(),
}

/**
 * Partial product update (ADM-002).
 *
 * The admin console could add and delete, and nothing else. Fixing a typo meant
 * deleting the product — which orphaned it in every order that referenced it
 * (DB-007) — and creating it again under a new id.
 *
 * Everything is optional and **nothing is defaulted**, because this is a PATCH:
 * a field that is absent must stay as it is, and a schema that supplied a
 * default would quietly overwrite it. That is also why `variants`, `inventory`,
 * `inventoryV2`, `tags` and `showcase` are raw strings here — a multipart form
 * sends them as JSON text, and the controller can then tell "not sent" from
 * "sent as empty".
 *
 * Images are handled by slot in the controller: an untouched slot keeps the URL
 * it already has, so editing a name does not mean re-uploading four photographs.
 */
export const updateProductSchema = {
    params: z.object({ id: objectId }).strict(),
    body: z
        .object({
            name: boundedString(200, 'Name').optional(),
            description: boundedString(5000, 'Description').optional(),
            price: z
                .union([z.string(), z.number()])
                .transform((value, ctx) => {
                    const parsed = Number(value)
                    if (String(value).trim() === '' || !Number.isFinite(parsed)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a number' })
                        return z.NEVER
                    }
                    return parsed
                })
                .pipe(positivePrice)
                .optional(),
            brand: z.string().trim().max(100).optional(),
            bestSeller: z
                .union([z.literal('true'), z.literal('false'), z.boolean()])
                .transform((value) => value === true || value === 'true')
                .optional(),
            variants: z.string().max(20000).optional(),
            inventory: z.string().max(20000).optional(),
            inventoryV2: z.string().max(40000).optional(),
            // Explicit acknowledgement used only by the dedicated legacy-stock
            // review flow. Ordinary edits never send it.
            inventoryResolution: z.literal('resolve').optional(),
            tags: z.string().max(5000).optional(),
            showcase: z.string().max(2000).optional(),
            /**
             * Which image slots to clear, as a JSON array of 1-based indices.
             * Explicit because "absent" already means "leave it alone"; there
             * has to be a way to say "remove this one" that is not the same as
             * saying nothing.
             */
            clearImages: z.string().max(100).optional(),
        })
        .strict()
        .refine((body) => body.inventoryResolution !== 'resolve'
            || (body.variants !== undefined && body.inventory !== undefined && body.inventoryV2 !== undefined), {
            message: 'inventory resolution must replace variants and both inventory representations',
        })
        .refine((body) => Object.keys(body).length > 0, { message: 'must change at least one field' }),
}

/**
 * The whole inventory matrix, in one request (ADM-004).
 *
 * The console sent **one HTTP request per combination**, sequentially, aborting
 * on the first failure with every earlier combination already committed. A 3x3
 * product was nine requests and nine chances to leave the matrix half-saved.
 *
 * Each entry names its combination losslessly by `variantOptions` where the
 * client can, and by the legacy key where it cannot (DB-003). Whether the
 * combination exists on the product needs the document, so the controller does
 * that half — and it does it for *every* entry before writing any of them.
 */
export const bulkInventorySchema = {
    params: z.object({ id: objectId }).strict(),
    body: z
        .object({
            entries: z
                .array(
                    z
                        .object({
                            variantKey: variantKey.optional(),
                            variantOptions: variantOptions.optional(),
                            quantity: stockQuantity,
                            priceDelta: z.number().finite().optional(),
                        })
                        .strict()
                        .refine((entry) => entry.variantKey !== undefined || entry.variantOptions !== undefined, {
                            message: 'must name a variant (variantKey or variantOptions)',
                        }),
                )
                .min(1, 'must name at least one combination')
                .max(500, 'has too many combinations'),
        })
        .strict(),
}

/**
 * 1-based image slots an edit clears.
 *
 * Explicit, because "absent" already means "leave this slot alone". Without a
 * separate way to say "remove it", an image could be replaced but never taken
 * away.
 */
export const clearImagesShape = z
    .array(z.number().int().min(1).max(4))
    .max(4)
    .optional()
    .default([])

/** The showcase assignments a product carries (FE-004). */
export const showcaseShape = z
    .array(
        z
            .object({
                slot: z.enum(SHOWCASE_SLOTS),
                order: z.number().int().nonnegative().max(1000).optional().default(0),
            })
            .strict(),
    )
    .max(SHOWCASE_SLOTS.length)
    .optional()
    .default([])

/** Shapes the three JSON multipart fields must satisfy once parsed. */
export const variantsShape = z
    .array(
        z
            .object({
                name: boundedString(60, 'Variant name'),
                options: z.array(boundedString(60, 'Option')).min(1, 'needs at least one option').max(50),
            })
            .strict(),
    )
    .max(10)
    .optional()
    .default([])

export const inventoryShape = z
    .record(variantKey, stockQuantity)
    .refine((value) => Object.keys(value).length <= 500, { message: 'has too many combinations' })
    .optional()
    .default({})

export const tagsShape = z.array(tag).min(1, 'needs at least one tag').max(30)

/**
 * The typed variant inventory, once parsed (DB-003).
 *
 * `options` is the identity. `variantId` and `legacyKey` are derived by the
 * controller rather than accepted from the client, so a caller cannot assert an
 * identity that does not match the options it sent.
 */
export const inventoryV2Shape = z
    .array(
        z
            .object({
                options: variantOptions,
                quantity: stockQuantity,
                sku: z.string().trim().max(60).optional(),
                priceDelta: z.number().finite().optional(),
            })
            .strict(),
    )
    .max(500, 'has too many combinations')
    .optional()
    .default([])
