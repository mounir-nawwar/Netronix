// Domain validation — the checks that need a database document.
//
// A zod schema can prove that `variantKey` is a string of permitted characters.
// It cannot prove that the key exists on *this* product, and that second half is
// what SEC-018 is actually about: `updateInventory` interpolated the key into a
// Mongo update path (`inventory.${variantKey}`), so a key the product never had
// still created a field, and a key containing a dot created a nested object.
//
// These run after schema validation, inside the controller's flow, because they
// need an `await`. They throw the same typed errors the middleware does, so the
// client-facing result is identical either way.

import { ValidationError, NotFoundError } from '../errors/AppError.js'
import { VARIANT_KEY_PATTERN } from './common.js'

/**
 * The set of inventory keys a product legitimately has.
 *
 * Two sources, because the two are not always in step in existing data:
 *   * the keys already present on `inventory`;
 *   * every combination its `variants` axes generate.
 *
 * A product with no variants has exactly one legitimate key: the empty string.
 * That encoding is BE-006 / DB-003 and is Phase 2's to change — Phase 1 only
 * has to stop *unknown* keys being written, not fix what the known one is.
 */
export function allowedInventoryKeys(product) {
    const keys = new Set(Object.keys(product?.inventory ?? {}))

    const axes = (product?.variants ?? []).map((variant) => variant?.options ?? []).filter((options) => options.length > 0)

    if (axes.length === 0) {
        keys.add('')
    } else {
        let combinations = ['']
        for (const options of axes) {
            const next = []
            for (const prefix of combinations) {
                for (const option of options) {
                    next.push(prefix === '' ? String(option) : `${prefix}-${option}`)
                }
            }
            combinations = next
        }
        for (const combination of combinations) keys.add(combination)
    }

    return keys
}

/**
 * Assert that `variantKey` is one the product actually has.
 *
 * The character check is repeated here rather than trusted from the schema, so
 * that a caller reaching this function by another route still cannot build a
 * field path. Belt and braces on the one place where a client value becomes
 * part of a query key.
 *
 * @throws {ValidationError} when the key is malformed or unknown to the product.
 */
export function assertVariantKeyBelongsTo(product, variantKey) {
    if (typeof variantKey !== 'string' || !VARIANT_KEY_PATTERN.test(variantKey)) {
        throw new ValidationError('Invalid request', {
            fields: { variantKey: ['is not a valid variant key'] },
            details: 'variantKey failed the character allowlist',
        })
    }

    if (!allowedInventoryKeys(product).has(variantKey)) {
        throw new ValidationError('Invalid request', {
            fields: { variantKey: ['is not a variant of this product'] },
            details: 'variantKey is not among the product\'s combinations',
        })
    }

    return variantKey
}

/**
 * Parse a multipart text field that carries JSON.
 *
 * `addProduct` did `JSON.parse(variants)` outside any try/catch, so a malformed
 * value produced an uncaught `SyntaxError` whose message — complete with the
 * character offset — was returned to the client (BE-003 / SEC-009).
 *
 * @param {string|undefined} raw
 * @param {import('zod').ZodTypeAny} schema Shape the parsed value must satisfy.
 * @param {string} field Field name, used only in the client-facing error.
 */
export function parseJsonField(raw, schema, field) {
    if (raw === undefined || raw === null || raw === '') return schema.parse(undefined)

    let parsed
    try {
        parsed = JSON.parse(raw)
    } catch {
        throw new ValidationError('Invalid request', {
            fields: { [field]: ['must be valid JSON'] },
            details: `${field} was not parseable JSON`,
        })
    }

    const result = schema.safeParse(parsed)
    if (!result.success) {
        throw new ValidationError('Invalid request', {
            fields: { [field]: result.error.issues.map((issue) => `${issue.path.join('.') || field} ${issue.message}`) },
        })
    }
    return result.data
}

/** Load a product by id or fail with a real 404 rather than a null body. */
export async function findProductOr404(productModel, productId) {
    const product = await productModel.findById(productId)
    if (!product) throw new NotFoundError('Product not found')
    return product
}
