import mongoose from "mongoose";

import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, isMinorAmount, toMajor, toMinor } from '../lib/money.js'
import { canonicalVariantId, deriveInventoryV2, legacyInventoryFrom, legacyVariantKey } from '../lib/variant.js'
import { SHOWCASE_SLOTS } from '../lib/showcase.js'

/**
 * Phase 2 adds four things to this schema, and drops nothing (DB-003, DB-004,
 * DB-006, DB-007, DB-009).
 *
 *  * **`inventoryV2`** — typed variant inventory. The legacy `inventory` field
 *    was `{ type: Object, required: true, default: {} }`: an untyped bag whose
 *    keys were option values joined with `-`, with no key validation and no
 *    value validation. `16-inch` and `RTX-4090` broke it silently. V2 stores the
 *    option pairs themselves, so nothing has to be split back out.
 *
 *  * **`priceMinor` + `currency`** — integer minor units and an explicit ISO
 *    code. `price` stays, is still written, and is still read by anything that
 *    has not moved.
 *
 *  * **`archived`** — soft delete. Hard-deleting a product left its id in every
 *    order line, wishlist and cart, permanently and invisibly. Archiving hides
 *    it from the catalog and keeps history whole by construction.
 *
 *  * **indexes and `timestamps`** — every query in the application was a
 *    collection scan, and `date: Number` was neither `createdAt` nor comparable
 *    with `order.date: Date`.
 *
 * Everything is additive. A document written before Phase 2 loads unchanged;
 * the `pre('validate')` hook below fills the new fields in from the old ones on
 * the next write, and keeps the old ones in step on every write after that.
 */

const variantOptionSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 60 },
    options: { type: [String], required: true, default: [] }
}, { _id: false });

/**
 * One purchasable combination.
 *
 * `options` is the identity; `variantId` is its canonical, escaped, lossless
 * string form — stable, order-independent, and safe to query on. `legacyKey` is
 * the old hyphen-joined string, carried so a client or a cart written against
 * the previous contract still resolves during the rollout. It is never the
 * identity: it can collide, and when it does the resolver refuses rather than
 * guessing.
 */
const inventoryEntrySchema = new mongoose.Schema({
    // Not `required`, because the canonical identity of the single combination
    // a variant-less product has is the **empty string** — and Mongoose's
    // `required` treats an empty string as absent.
    variantId: { type: String, default: '' },
    legacyKey: { type: String, default: '' },
    options: { type: Map, of: String, required: true, default: () => new Map() },
    // `min: 0` is the database's own backstop under DB-001: even if a code path
    // were to get the arithmetic wrong, stock cannot be persisted negative.
    quantity: { type: Number, required: true, min: 0, default: 0 },
    sku: { type: String },
    priceDelta: { type: Number, default: 0 },
    priceMinorDelta: { type: Number, default: 0 },
    /** Set by the migration when a legacy key was ambiguous and was not guessed. */
    needsReview: { type: Boolean },
}, { _id: false });

// Derive the minor unit automatically so the two cannot drift.
inventoryEntrySchema.pre('save', function syncPriceMinorDelta() {
    if (this.isModified('priceDelta') && !this.isModified('priceMinorDelta')) {
        this.priceMinorDelta = Number.isFinite(this.priceDelta) ? Math.round(this.priceDelta * 100) : 0
    }
})

/**
 * One homepage surface this product is assigned to, and its position in it
 * (FE-004, PORT-001).
 *
 * Phase 3 adds this so the homepage selects by **data** rather than by literal
 * ObjectId. `order` is per-slot rather than per-product because one product
 * legitimately occupies two surfaces at two positions. `slot` is an enum, so a
 * typo fails validation instead of silently emptying a section.
 */
const showcaseSlotSchema = new mongoose.Schema({
    slot: { type: String, required: true, enum: SHOWCASE_SLOTS },
    order: { type: Number, default: 0, min: 0 },
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, required: true},

    // Money. `price` is the legacy major-unit float and is deliberately kept
    // and kept written (DB-004 step 2 of 5); `priceMinor` is the exact one.
    price: {type: Number, required: true, min: 0},
    priceMinor: {type: Number, min: 0},
    // One currency, and the schema is one of the places that says so (DB-004).
    // `maxlength: 3` accepted `LBP`, `EUR` and `XYZ` alike; the enum accepts the
    // only currency this system can actually hold.
    currency: {
        type: String,
        default: DEFAULT_CURRENCY,
        uppercase: true,
        enum: { values: SUPPORTED_CURRENCIES, message: 'currency must be {VALUES}; this system holds one currency' },
    },

    brand: {type: String, default: ""},
    image: {type: [String], required: true, default: []},
    variants: {type: [variantOptionSchema], default: []},

    // Legacy variant inventory. Retained, dual-written, never dropped in Phase 2.
    inventory: {type: Object, required: true, default: {}},
    inventoryV2: {type: [inventoryEntrySchema], default: []},
    // Incremented by checkout reservations and admin stock writes. Admin writes
    // guard on the revision they read, so sold stock cannot be restored by a
    // stale whole-matrix update.
    inventoryRevision: { type: Number, required: true, default: 0, min: 0 },

    bestSeller: {type: Boolean, default: false},
    tags: {type: [String], default: []},

    // Data-driven homepage selection (FE-004). Additive and empty by default:
    // a product written before Phase 3 simply appears in no showcase.
    showcase: {type: [showcaseSlotSchema], default: []},
    date: {type: Number, required: true},

    // Soft delete (DB-007, ADM-003).
    archived: {type: Boolean, default: false},
    archivedAt: {type: Date},
    archivedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'user'},
}, { timestamps: true, minimize: false })

/**
 * Keep both representations true on every write.
 *
 * This lives on the model rather than in each of the half-dozen call sites that
 * write a product — the controller, the seed, the test helpers, three
 * migrations — because "the two representations agree" is a property of the
 * document, and a property enforced in six places is a property enforced in
 * five.
 *
 * It never *guesses*: an ambiguous legacy key produces an entry marked
 * `needsReview` with no quantity claimed, and the legacy value it could not be
 * derived from is left exactly as it is for a human to resolve.
 */
productSchema.pre('validate', function syncRepresentations() {
    // --- money -------------------------------------------------------------
    if (typeof this.price === 'number' && Number.isFinite(this.price) && this.price >= 0) {
        const derived = toMinor(this.price)
        // A caller that set `priceMinor` explicitly wins; otherwise derive it.
        if (!isMinorAmount(this.priceMinor) || !this.isModified('priceMinor')) {
            this.priceMinor = derived
        }
    }
    if (isMinorAmount(this.priceMinor) && (typeof this.price !== 'number' || this.isModified('priceMinor'))) {
        this.price = toMajor(this.priceMinor)
    }
    if (!this.currency) this.currency = DEFAULT_CURRENCY

    // --- variants ----------------------------------------------------------
    const hasV2 = Array.isArray(this.inventoryV2) && this.inventoryV2.length > 0

    if (!hasV2) {
        const { entries } = deriveInventoryV2(this.variants, this.inventory ?? {})
        this.inventoryV2 = entries
    } else {
        // Recompute the derived fields so an entry written with only `options`
        // still gains its identity and its compatibility key.
        for (const entry of this.inventoryV2) {
            const options = entry.options instanceof Map
                ? Object.fromEntries(entry.options.entries())
                : (entry.options ?? {})
            entry.variantId = canonicalVariantId(options)
            entry.legacyKey = legacyVariantKey(this.variants, options)
        }

        // The last line of defence against a duplicated combination.
        //
        // `resolveVariant` reads the first row with a matching `variantId` and
        // `orderService.reserve` decrements every one of them, so two rows for
        // one combination means one unit sold takes two off the shelf and the
        // rows disagree from then on. The write endpoints refuse this through
        // `normaliseInventoryV2`; refusing it here as well means no code path —
        // a script, a seed, a future controller — can store it by accident.
        const seen = new Set()
        for (const entry of this.inventoryV2) {
            if (seen.has(entry.variantId)) {
                this.invalidate(
                    'inventoryV2',
                    `the combination "${entry.variantId || '(no options)'}" is listed more than once`,
                )
                break
            }
            seen.add(entry.variantId)
        }
    }

    const nextInventory = legacyInventoryFrom(this.inventoryV2, this.inventory ?? {})
    const currentInventory = this.inventory && typeof this.inventory === 'object'
        ? this.inventory
        : {}
    const nextKeys = Object.keys(nextInventory)
    const representationsDiffer = nextKeys.length !== Object.keys(currentInventory).length
        || nextKeys.some((key) => currentInventory[key] !== nextInventory[key])

    // Do not mark a representation modified merely because validation ran. A
    // name/price/image-only save may have read the product before checkout
    // reserved stock; writing its unchanged, stale legacy bag afterward would
    // restore sold quantity in `inventory` while `inventoryV2` stayed correct.
    if (representationsDiffer) {
        this.inventory = nextInventory
        this.markModified('inventory')
    }
})

// Indexes (DB-006, BE-010). Every one of these queries was a collection scan.
// Note what is *not* here: no unique index. The only unique constraint Phase 2
// adds to a product-adjacent collection is `orders.orderNumber`, and it is built
// by a migration after duplicates are resolved, never by `autoIndex`.
productSchema.index({ tags: 1 })
productSchema.index({ bestSeller: 1 })
productSchema.index({ date: -1 })
productSchema.index({ archived: 1, date: -1 })
// The homepage asks for one slot at a time (FE-004).
productSchema.index({ 'showcase.slot': 1 })
// Justified by the storefront's search box and the admin's product filter, both
// of which filter the whole catalog in the browser today.
productSchema.index({ name: 'text', description: 'text' })

const productModel = mongoose.models.product || mongoose.model("product", productSchema)

export default productModel
