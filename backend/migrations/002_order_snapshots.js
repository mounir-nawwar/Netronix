// 002 — order line snapshots (DB-005, BE-002, FE-017).
//
// An order line was `{ productId, size, quantity }`. Both listing endpoints
// re-read the *current* product and merged today's name, price and image into
// the response, so order history was a view of the catalog rather than a record
// of a purchase.
//
// `up()` backfills the snapshot fields on every line that lacks them.
//
// ## The honest part
//
// **Historical prices are not recoverable.** They were never stored anywhere —
// that absence *is* DB-005. This backfill reconstructs each line from the
// catalog as it stands right now, which is the very thing being fixed. Every
// line it touches is therefore stamped `_reconstructed: true`, and every surface
// that renders one says so. Orders placed after this migration are exact;
// earlier ones are an approximation and are labelled as an approximation.
//
// A line whose product no longer exists cannot even be approximated. It is
// backfilled as "Unavailable product" at zero, stamped, and **reported**.
//
// ## Rollback
//
// `down()` removes exactly the fields `up()` added, on exactly the lines it
// stamped, leaving `{ productId, size, quantity }` as it found them. Because
// only reconstructed lines carry the stamp, a rollback cannot strip a genuine
// snapshot written by the application after the migration.
//
// ## Irreversible information
//
// None is lost by either direction. None is *gained* by `up()` either: a
// reconstructed price is not evidence of what was charged, and must never be
// presented as one.

import { ObjectId } from 'mongodb'

import { toMinor, DEFAULT_CURRENCY } from '../lib/money.js'
import { canonicalVariantId, deriveInventoryV2, entriesOf, variantLabel } from '../lib/variant.js'

export const id = '002_order_snapshots'
export const name = 'Backfill order line snapshots'
export const findings = ['DB-005', 'BE-002', 'FE-017']
export const description =
    'Adds name, variant identity, unit price, line total and image to every order line that lacks them, reconstructed from the current catalog and flagged as such.'
export const rollback =
    'down() unsets only the fields up() added, and only on lines carrying _reconstructed: true. Genuine snapshots written by the application are untouched.'

/** The fields this migration adds to a line. `down()` unsets exactly these. */
export const ADDED_FIELDS = [
    'name', 'variantId', 'variantKey', 'variantOptions', 'variantLabel',
    'unitPrice', 'unitPriceMinor', 'lineTotal', 'lineTotalMinor',
    'currency', 'image', 'brand', '_reconstructed',
]

/**
 * Load the product a line points at, whatever encoding the id is in.
 *
 * This matters because of the order these migrations run in. `order.items[]` was
 * an untyped array, so a pre-Phase-2 line holds `productId` as a **string** —
 * and 006, which casts those to real ObjectIds, runs *after* this one, because
 * snapshots have to exist before references start being enforced. Looking the
 * product up by the raw value alone would therefore find nothing on exactly the
 * data this migration exists for, and would silently reconstruct every line as
 * "Unavailable product".
 */
async function findProduct(products, productId) {
    if (productId === undefined || productId === null) return null
    const direct = await products.findOne({ _id: productId })
    if (direct) return direct
    if (typeof productId === 'string' && /^[0-9a-fA-F]{24}$/.test(productId)) {
        return products.findOne({ _id: new ObjectId(productId) })
    }
    return null
}

export async function up({ db, report, log }) {
    const orders = db.collection('orders')
    const products = db.collection('products')

    const cursor = orders.find({ items: { $elemMatch: { name: { $exists: false } } } })
    let touched = 0

    for await (const order of cursor) {
        const items = []
        for (const item of order.items ?? []) {
            if (item?.name !== undefined) {
                items.push(item)
                continue
            }

            const product = await findProduct(products, item?.productId)
            const legacyKey = String(item?.size ?? item?.variantKey ?? '')
            const quantity = Number(item?.quantity ?? 1)

            if (!product) {
                await report({
                    kind: 'unresolvable-line',
                    orderId: String(order._id),
                    productId: String(item?.productId ?? ''),
                    reason: 'the product no longer exists; the line cannot even be approximated',
                })
            }

            // The entry whose legacy key matches, when exactly one does. An
            // ambiguous key is left unresolved rather than guessed.
            //
            // The combinations are derived here rather than read from
            // `inventoryV2`, because 005 has not necessarily run yet and a
            // migration must not silently depend on a later one. When 005 *has*
            // run, its entries are used directly — the two agree, since both
            // come from `deriveInventoryV2`.
            const combinations = entriesOf(product ?? {}).length > 0
                ? entriesOf(product)
                : deriveInventoryV2(product?.variants, product?.inventory ?? {}).entries
            const candidates = combinations.filter((entry) => entry.legacyKey === legacyKey)
            if (candidates.length > 1) {
                await report({
                    kind: 'ambiguous-variant',
                    orderId: String(order._id),
                    productId: String(item?.productId ?? ''),
                    legacyKey,
                    reason: 'more than one combination produces this legacy key; options were not reconstructed',
                })
            }
            const entry = candidates.length === 1 ? candidates[0] : null

            const priceMajor = Number(product?.price ?? 0)
            const unitPriceMinor = Number.isFinite(priceMajor) && priceMajor >= 0 ? toMinor(priceMajor) : 0
            const options = entry ? entry.options : {}

            items.push({
                ...item,
                productId: item?.productId,
                name: product?.name ?? 'Unavailable product',
                variantId: entry ? entry.variantId : canonicalVariantId(options),
                variantKey: legacyKey,
                size: legacyKey,
                variantOptions: options,
                variantLabel: entry ? variantLabel(product?.variants, options) : legacyKey,
                unitPriceMinor,
                unitPrice: unitPriceMinor / 100,
                quantity,
                lineTotalMinor: unitPriceMinor * quantity,
                lineTotal: (unitPriceMinor * quantity) / 100,
                currency: product?.currency ?? DEFAULT_CURRENCY,
                image: Array.isArray(product?.image) ? (product.image[0] ?? '') : (product?.image ?? ''),
                brand: product?.brand ?? '',
                // Not what was charged. What the catalog says today.
                _reconstructed: true,
            })
        }

        await orders.updateOne({ _id: order._id }, { $set: { items, schemaVersion: 2 } })
        touched += 1
    }

    log(`  reconstructed ${touched} order(s)`)
}

export async function down({ db, log }) {
    const orders = db.collection('orders')
    const cursor = orders.find({ items: { $elemMatch: { _reconstructed: true } } })
    let touched = 0

    for await (const order of cursor) {
        const items = (order.items ?? []).map((item) => {
            if (!item?._reconstructed) return item
            const restored = { ...item }
            for (const field of ADDED_FIELDS) delete restored[field]
            return restored
        })
        await orders.updateOne({ _id: order._id }, { $set: { items }, $unset: { schemaVersion: '' } })
        touched += 1
    }

    log(`  restored ${touched} order(s)`)
}

export default { id, name, findings, description, rollback, up, down, ADDED_FIELDS }
