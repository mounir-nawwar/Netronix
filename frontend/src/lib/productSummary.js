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


/* ---------------------------------------------------------------------------
   What a card says about a product instead of inventing a rating.

   Every card rendered `★★★★★` — or, on the showcase variant, `★ 4.5` — for
   every product in the catalog. There is no review model behind either: no
   `rating` field, no `reviews` collection, nothing that could ever make the
   number move. Five amber stars that are the same on all twenty products are
   not a signal, they are a texture, and they are the single loudest tell that a
   page was assembled rather than designed.

   The catalog does carry real things worth saying, and this is all three of
   them. Each reads the typed inventory (`entriesOf`, DB-003) rather than the
   legacy bag, so none of them can disagree with what the cart will accept.
   --------------------------------------------------------------------------- */

/** How many purchasable combinations the product has. Zero axes means one. */
export function configCount(product) {
    return entriesOf(product ?? {}).length
}

/** Units on the shelf across every combination. */
export function totalStock(product) {
    return entriesOf(product ?? {}).reduce((total, entry) => total + Math.max(0, entry.quantity), 0)
}

/** The threshold at which remaining stock is worth putting on a card. */
export const LOW_STOCK_THRESHOLD = 3

/**
 * The one stock fact a card shows, or none.
 *
 * Three states, deliberately:
 *
 *   * `sold-out` — every combination is at zero. `isSoldOut` already decides
 *     this, and it is reused rather than re-derived so the badge and the
 *     disabled quick-add can never disagree.
 *   * `low` — some stock, at or under the threshold. The number is real.
 *   * `none` — anything else, including a product whose matrix is genuinely
 *     absent. "No inventory recorded" is not "none available" (DB-003), and a
 *     card that says "Sold out" because nobody has entered stock yet is a
 *     claim the catalog cannot support.
 *
 * @returns {{ kind: 'sold-out'|'low'|'none', quantity: number }}
 */
export function stockSignal(product) {
    if (isSoldOut(product)) return { kind: 'sold-out', quantity: 0 }

    const entries = entriesOf(product ?? {})
    if (entries.length === 0) return { kind: 'none', quantity: 0 }

    const quantity = totalStock(product)
    if (quantity > 0 && quantity <= LOW_STOCK_THRESHOLD) return { kind: 'low', quantity }
    return { kind: 'none', quantity }
}

/**
 * The product's own spec line — "16-inch · 1TB", "RTX 4090 · 32GB".
 *
 * Built from the *declared* axes' first option values, which is the
 * configuration a card is showing the price of. It is never prose and never
 * generated: if a product declares no variants there is nothing true to say
 * here and the function returns an empty string, so the card drops the line
 * rather than padding it with filler.
 *
 * `limit` keeps a five-axis workstation from wrapping the card; the count is
 * still available through `configCount` for the "N configs" affordance.
 */
export function specLine(product, { limit = 3, separator = ' · ' } = {}) {
    const axes = Array.isArray(product?.variants) ? product.variants : []

    const values = axes
        .filter((axis) => axis && Array.isArray(axis.options) && axis.options.length > 0)
        .map((axis) => String(axis.options[0]).trim())
        .filter((value) => value !== '')

    return values.slice(0, limit).join(separator)
}
