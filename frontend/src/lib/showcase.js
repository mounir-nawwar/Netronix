// ---------------------------------------------------------------------------
// MIRROR of `backend/lib/showcase.js`. Keep the two byte-identical below this line.
//
// There is no shared package in this repository (ARCH-004). The contract is
// held by a test rather than by a build step: the mirror check in
// `src/test/lib/shared-helpers.contract.test.js` compares this file byte for
// byte with the backend original, so a silent edit to either copy fails a suite
// instead of producing a homepage section that shows the wrong products.
// ---------------------------------------------------------------------------
// Data-driven homepage selection (FE-004, PORT-001, FE-030).
//
// The defect
// ----------
// Five storefront components picked the products they display by **literal
// ObjectId**:
//
//     const productId = "680262846be92b2511550a66"   // HeroVideo, FeaturedProduct
//     macbooks: ['680897a3a9a5ffb06b2e52c8', …]      // FeaturedProducts
//     macbook: '680897a3a9a5ffb06b2e52c8'            // ShopTheLook
//
// An id is the identity of one row in one database. Against any catalog not
// restored from the original dump every `.find()` returned `undefined`:
// `ShopTheLook` then dereferenced it and took the whole page down, and
// `FeaturedProduct` invented a product that does not exist. Phase 0 worked
// around it by making the seed adopt those exact ids — a documented shim with
// this phase as its end date.
//
// The representation
// ------------------
// A product declares *where it belongs*, not *which page mentions it*:
//
//     showcase: [{ slot: 'shop-the-look', order: 1 }, { slot: 'featured', order: 0 }]
//
//   * `slot`  — which homepage surface. A closed vocabulary, enforced by the
//               schema, so a typo is a validation error rather than a section
//               that silently renders nothing.
//   * `order` — position **within that slot**. Per-slot rather than per-product
//               because one product legitimately appears in two surfaces at two
//               positions: the MacBook Pro is the first featured product and
//               the second Shop-the-Look hotspot.
//
// Selection is then `catalog.filter(in slot).sort(by order)` — a pure function
// of data the storefront already holds, so no component needs its own fetch and
// an empty catalog produces an empty section rather than a crash or a fiction.

/** Every surface a product can be assigned to. */
export const SHOWCASE_SLOTS = Object.freeze([
    /** The single large product panel below the comparison section. */
    'featured-product',
    /** The product the autoplaying video's call to action points at. */
    'hero-video',
    /** The tabbed "Best Sellers" grid. Tabs are derived from tags. */
    'featured',
    /** The hotspots on the workspace photograph. */
    'shop-the-look',
])

const SLOT_SET = new Set(SHOWCASE_SLOTS)

/** True when `slot` is one of the declared surfaces. */
export const isShowcaseSlot = (slot) => SLOT_SET.has(slot)

/**
 * Normalise whatever shape came off a document into plain `{ slot, order }`.
 *
 * Tolerates a bare string (`'featured'`) so a hand-written fixture or a document
 * from a future simplification still reads, and drops anything whose slot is not
 * in the vocabulary rather than letting it reach a component.
 */
export function showcaseEntriesOf(product) {
    const raw = product?.showcase
    if (!Array.isArray(raw)) return []
    return raw
        .map((entry) => (typeof entry === 'string' ? { slot: entry, order: 0 } : entry))
        .filter((entry) => entry && isShowcaseSlot(entry.slot))
        .map((entry) => ({ slot: entry.slot, order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0 }))
}

/** The product's position in `slot`, or null when it is not in that slot. */
export function showcaseOrderIn(product, slot) {
    const entry = showcaseEntriesOf(product).find((candidate) => candidate.slot === slot)
    return entry ? entry.order : null
}

/** True when the product is assigned to `slot`. */
export const isInShowcase = (product, slot) => showcaseOrderIn(product, slot) !== null

/**
 * Every product in `slot`, ordered.
 *
 * Sorted by the declared order, then by `date` descending, then by `_id`, so the
 * result is total and therefore identical on every render and every machine —
 * two products sharing an order never swap places between loads.
 */
export function selectShowcase(products, slot, { limit } = {}) {
    if (!isShowcaseSlot(slot)) return []
    const selected = (Array.isArray(products) ? products : [])
        .filter((product) => isInShowcase(product, slot))
        .sort((a, b) => {
            const byOrder = showcaseOrderIn(a, slot) - showcaseOrderIn(b, slot)
            if (byOrder !== 0) return byOrder
            const byDate = Number(b?.date ?? 0) - Number(a?.date ?? 0)
            if (byDate !== 0) return byDate
            return String(a?._id ?? '').localeCompare(String(b?._id ?? ''))
        })
    return typeof limit === 'number' ? selected.slice(0, limit) : selected
}

/** The first product in `slot`, or null. For the single-product surfaces. */
export function selectShowcaseOne(products, slot) {
    return selectShowcase(products, slot, { limit: 1 })[0] ?? null
}
