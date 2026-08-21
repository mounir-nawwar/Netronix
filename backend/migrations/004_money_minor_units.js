// 004 — integer minor units and an explicit currency (DB-004, FE-018).
//
// Every monetary value was an IEEE-754 double, and the currency was implicit and
// contradictory: `'$'` in the storefront context, "3$" in the AI prompt,
// "Lebanon (LBP ل.ل)" in the footer. `up()` adds `priceMinor`/`currency` to
// products and the minor-unit totals to orders.
//
// ## Conversion
//
// `Math.round(value * 100)`, exactly as the remediation plan specifies, with the
// result checked to be a finite safe integer within the money range. A value
// that fails that check is **reported and skipped**, never written as 0 or NaN:
// a wrong price silently persisted is worse than a missing one.
//
// ## What is not fabricated
//
// A pre-Phase-2 order line has no unit price at all. This migration does not
// invent one. It converts what exists — `amount`, `subtotal`, `delivery_fee`,
// and any line price migration 002 reconstructed (which is already flagged
// `_reconstructed`) — and nothing else.
//
// ## An unsupported currency
//
// `USD` is the only currency this system holds. A document carrying anything
// else is **quarantined**: its price is left untouched, no minor-unit field is
// written, `currencyQuarantined: true` is set, and the value is reported. It is
// never converted (`× 100` is wrong for a zero-decimal currency) and never
// relabelled (calling an LBP price "USD" makes the error unrecoverable).
// `orderService` refuses to sell a quarantined product, so the flag is a rule
// rather than a note.
//
// ## Rollback
//
// `down()` reverts exactly the fields `up()` recorded owning, on exactly the
// documents it recorded touching, and only where the stored value is still the
// one `up()` wrote. A document created afterwards, or a value something has
// changed since, is left alone and reported. The major-unit fields were never
// touched in either direction, so no restore is needed. This is step 1 of
// the five-step rollout in the remediation plan; steps 4 and 5 — reading only
// the minor fields, then dropping the major ones — are explicitly **not** in
// Phase 2.

import { DEFAULT_CURRENCY, isSupportedCurrency, isMinorAmount } from '../lib/money.js'

export const id = '004_money_minor_units'
export const name = 'Add integer minor-unit money and an explicit currency'
export const findings = ['DB-004', 'FE-018']
export const description =
    'Adds priceMinor/currency to products and amountMinor/subtotalMinor/deliveryFeeMinor plus per-line minor units to orders. Legacy major-unit fields are left in place.'
export const rollback =
    'down() unsets exactly the added fields. The major-unit originals were never modified, so nothing is lost in either direction.'

/** `Math.round(v * 100)` with every failure mode turned into `null`. */
export function convert(major) {
    const value = typeof major === 'number' ? major : Number(major)
    if (!Number.isFinite(value) || value < 0) return null
    const minor = Math.round(value * 100)
    return isMinorAmount(minor) ? minor : null
}

export async function up({ db, report, own, log }) {
    const products = db.collection('products')
    const orders = db.collection('orders')

    let productCount = 0
    let quarantined = 0
    for await (const product of products.find({ priceMinor: { $exists: false } })) {
        // A currency this system does not hold is **quarantined, not
        // converted**. `Math.round(v * 100)` assumes two decimal places; LBP has
        // none, so converting an LBP price produces a number that is wrong by a
        // factor of a hundred and then labels it in a currency the rest of the
        // system will treat as dollars. Relabelling it `USD` — which is what
        // `product.currency ?? DEFAULT_CURRENCY` did downstream — is worse
        // still: it makes the error unrecoverable.
        //
        // So the price is left exactly as it is, no `priceMinor` is written,
        // the document is flagged, and a human is told. `orderService` refuses
        // to sell a flagged product, so the quarantine has teeth.
        if (product.currency !== undefined && product.currency !== null && !isSupportedCurrency(product.currency)) {
            await report({
                kind: 'unsupported-currency',
                collection: 'products',
                productId: String(product._id),
                productName: product.name,
                currency: product.currency,
                price: product.price,
                reason: `this system holds ${DEFAULT_CURRENCY} only; the price was not converted and the product is quarantined until a human decides what it costs`,
            })
            await own({ collection: 'products', id: product._id, set: { currencyQuarantined: true }, before: {} })
            await products.updateOne({ _id: product._id }, { $set: { currencyQuarantined: true } })
            quarantined += 1
            continue
        }

        const minor = convert(product.price)
        if (minor === null) {
            await report({
                kind: 'malformed-price',
                productId: String(product._id),
                price: product.price,
                reason: 'not a finite, non-negative, in-range number; priceMinor was not written',
            })
            continue
        }
        const set = { priceMinor: minor, currency: product.currency ?? DEFAULT_CURRENCY }
        const before = {}
        for (const field of Object.keys(set)) {
            if (field in product) before[field] = product[field]
        }
        // Recorded before the write, so a crash leaves evidence of work that
        // may not have happened rather than no evidence of work that did.
        await own({ collection: 'products', id: product._id, set, before })

        await products.updateOne({ _id: product._id }, { $set: set })
        productCount += 1
    }

    let orderCount = 0
    for await (const order of orders.find({ amountMinor: { $exists: false } })) {
        // Same rule for an order that was placed in another currency: its
        // totals are not converted and its label is not rewritten.
        if (order.currency !== undefined && order.currency !== null && !isSupportedCurrency(order.currency)) {
            await report({
                kind: 'unsupported-currency',
                collection: 'orders',
                orderId: String(order._id),
                orderNumber: order.orderNumber,
                currency: order.currency,
                amount: order.amount,
                reason: `this system holds ${DEFAULT_CURRENCY} only; the totals were not converted and the order is quarantined for review`,
            })
            await own({ collection: 'orders', id: order._id, set: { currencyQuarantined: true }, before: {} })
            await orders.updateOne({ _id: order._id }, { $set: { currencyQuarantined: true } })
            quarantined += 1
            continue
        }

        const set = { currency: order.currency ?? DEFAULT_CURRENCY }
        const failures = []

        for (const [majorField, minorField] of [
            ['amount', 'amountMinor'],
            ['subtotal', 'subtotalMinor'],
            ['delivery_fee', 'deliveryFeeMinor'],
        ]) {
            if (order[majorField] === undefined || order[majorField] === null) continue
            const minor = convert(order[majorField])
            if (minor === null) failures.push(majorField)
            else set[minorField] = minor
        }

        if (failures.length > 0) {
            await report({
                kind: 'malformed-order-total',
                orderId: String(order._id),
                fields: failures,
                reason: 'not finite, non-negative and in range; those minor fields were not written',
            })
        }

        // Lines: convert only a price that is actually there. Nothing is invented.
        const items = (order.items ?? []).map((item) => {
            if (item?.unitPriceMinor !== undefined) return item
            const unit = convert(item?.unitPrice)
            if (unit === null) return item
            const quantity = Number(item?.quantity ?? 1)
            return {
                ...item,
                unitPriceMinor: unit,
                lineTotalMinor: unit * quantity,
                currency: item?.currency ?? DEFAULT_CURRENCY,
            }
        })

        const written = { ...set, items }
        const before = {}
        for (const field of Object.keys(written)) {
            if (field in order) before[field] = order[field]
        }
        await own({ collection: 'orders', id: order._id, set: written, before })

        await orders.updateOne({ _id: order._id }, { $set: written })
        orderCount += 1
    }

    log(`  ${productCount} product(s), ${orderCount} order(s) converted; ${quarantined} quarantined for an unsupported currency`)
}

export async function down({ log, revertOwned }) {
    // Exactly what `up()` wrote, and only where it is still what `up()` wrote.
    //
    // This used to be `updateMany({}, { $unset: { priceMinor, currency, … } })`
    // across both collections. That is right for the instant after `up()` and
    // wrong from then on: a product created by the running application carries
    // `priceMinor` as its *price*, not as a backfill, and unsetting it destroys
    // the only exact record of what the product costs. Same for an order's
    // `amountMinor` — the only exact record of what a customer was charged.
    const { reverted, preserved } = await revertOwned()
    log(`  ${reverted} field(s) restored; ${preserved} left alone because something changed them after up()`)
}

export default { id, name, findings, description, rollback, up, down, convert }
