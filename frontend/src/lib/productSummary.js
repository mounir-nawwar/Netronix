import { entriesOf } from './variant'

// TEST-002 — the default selection helper and `isSoldOut` used to be exported from
// `components/ProductCard.jsx`. They are pure functions over a product
// document, not components, and exporting them alongside one is what
// `react-refresh/only-export-components` reports: the module can no longer be
// hot-replaced, so editing the card during development reloads the page.
//
// They live here so `ProductCard` can stay component-only and hot-reloadable.

/**
 * The default combination to put in the cart from a card, losslessly.
 *
 * Reads the product's own typed combinations (DB-003) and takes the first one
 * with stock, falling back to the first that exists. Every previous card built
 * this key with `variants.map(v => v.options[0]).join('-')`, which is the
 * ambiguous legacy encoding. The selected entry's option pairs are returned,
 * including the valid empty pair-set for a variantless product.
 */
export function defaultVariantSelection(product) {
    const entries = entriesOf(product ?? {})
    const entry = entries.find((candidate) => candidate.quantity > 0) ?? entries[0]
    return { variantOptions: entry?.options ?? {} }
}

/** True when no combination has stock. A product with no matrix is not sold out. */
export function isSoldOut(product) {
    const entries = entriesOf(product ?? {})
    if (entries.length === 0) return false
    return entries.every((entry) => entry.quantity <= 0)
}

