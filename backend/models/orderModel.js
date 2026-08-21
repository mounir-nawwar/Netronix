import mongoose from 'mongoose';

import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../lib/money.js'

/**
 * Phase 2 turns an order from a pointer into a record (DB-005, DB-004, DB-007,
 * DB-008, DB-009, DB-012).
 *
 * Before, an order line was `{ productId, size, quantity }` — no name, no price,
 * no image. Both listing endpoints re-read the *current* product document and
 * merged today's fields in, so changing a price rewrote every past order,
 * renaming a product renamed it in history, and deleting one degraded the line
 * to "Product / $0". `amount` was the only record of what was charged, and until
 * Phase 1 it was client-supplied. There was no trustworthy record of what any
 * customer paid for any item.
 *
 * An order line is now a **snapshot**: what it was called, what it cost, which
 * combination it was, and what it looked like, as at the moment of purchase.
 * Nothing about it is resolved at read time.
 *
 * Everything here is additive. `items[].size`, `amount`, `subtotal` and
 * `delivery_fee` are all still present and still written, because an older
 * cached storefront or admin bundle reads them.
 */

const ORDER_STATUSES = ['Order Placed', 'Packing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']

/**
 * The address, typed (DB-009). It was `{ type: Object, required: true }`:
 * Mongoose validated nothing, so any shape at all was persisted. The validator
 * checks the same fields at the edge; this is the second line.
 *
 * `strict: false` is deliberate — an order placed before this schema existed may
 * carry a field that is not listed, and refusing to load it would be worse than
 * carrying it.
 */
const addressSchema = new mongoose.Schema({
    firstName: { type: String, required: true, maxlength: 100 },
    lastName: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, maxlength: 254 },
    street: { type: String, required: true, maxlength: 200 },
    city: { type: String, required: true, maxlength: 100 },
    state: { type: String, default: '', maxlength: 100 },
    zipcode: { type: String, default: '', maxlength: 30 },
    country: { type: String, required: true, maxlength: 100 },
    phone: { type: String, required: true, maxlength: 40 },
}, { _id: false, strict: false })

/**
 * One purchased line, captured at purchase time.
 *
 * Money is carried in both representations during the rollout: `unitPriceMinor`
 * / `lineTotalMinor` are the exact integers, `unitPrice` / `lineTotal` are the
 * major-unit floats an unmigrated reader still expects (DB-004).
 *
 * Variant identity is carried three ways for the same reason: `variantOptions`
 * is the truth, `variantId` is its canonical string form, and `variantKey` —
 * with `size`, its pre-Phase-2 name — is the legacy compatibility key (DB-003,
 * ARCH-003).
 */
const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },
    name: { type: String, required: true, maxlength: 200 },

    variantId: { type: String, default: '' },
    variantKey: { type: String, default: '' },
    variantOptions: { type: Map, of: String, default: () => new Map() },
    variantLabel: { type: String, default: '' },
    /** The pre-Phase-2 field name for `variantKey`. Dual-written, never read first. */
    size: { type: String, default: '' },

    unitPriceMinor: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    // The line's currency is the order's currency is the only currency there
    // is (DB-004). It used to be inherited from the product, so a catalog with
    // one foreign-priced item could produce a total that summed two currencies
    // under a USD label.
    currency: {
        type: String,
        default: DEFAULT_CURRENCY,
        uppercase: true,
        enum: { values: SUPPORTED_CURRENCIES, message: 'currency must be {VALUES}; this system holds one currency' },
    },

    image: { type: String, default: '' },
    brand: { type: String, default: '' },

    /**
     * True when this line's figures were **reconstructed** by a migration from
     * the catalog as it stood at migration time, not captured at purchase.
     *
     * Historical prices are not recoverable — they were never stored. Anything
     * carrying this flag is an approximation and every surface that renders it
     * says so. Orders placed after the migration are exact.
     */
    _reconstructed: { type: Boolean },
}, { _id: false, strict: false })

/** One status change: what it became, when, and who did it (DB-008). */
const statusEventSchema = new mongoose.Schema({
    status: { type: String, required: true, enum: ORDER_STATUSES },
    at: { type: Date, required: true, default: Date.now },
    by: { type: String, default: 'system' },
}, { _id: false })

const orderSchema = new mongoose.Schema({
    // A real reference now, not a bare string (DB-007). Absent for a guest.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    orderNumber: { type: Number, required: true },
    items: { type: [orderItemSchema], required: true },

    // Money. Legacy major-unit fields first, because they are what the deployed
    // clients read; the exact integers alongside them.
    amount: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
    delivery_fee: { type: Number, default: 0, min: 0 },
    amountMinor: { type: Number, min: 0 },
    subtotalMinor: { type: Number, min: 0 },
    deliveryFeeMinor: { type: Number, min: 0 },
    currency: {
        type: String,
        default: DEFAULT_CURRENCY,
        uppercase: true,
        enum: { values: SUPPORTED_CURRENCIES, message: 'currency must be {VALUES}; this system holds one currency' },
    },

    address: { type: addressSchema, required: true },

    status: { type: String, required: true, default: 'Order Placed', enum: ORDER_STATUSES },
    statusHistory: { type: [statusEventSchema], default: [] },

    paymentMethod: { type: String, required: true },
    payment: { type: Boolean, required: true, default: false },
    date: { type: Date, required: true, default: Date.now },
    isGuestOrder: { type: Boolean, default: false },

    /**
     * Idempotency (DB-012, SEC-011 remainder).
     *
     * `idempotencyScope` is the principal the key belongs to — `user:<id>` for a
     * customer, or `guest:<sha256 of the caller's address>` for a guest. It is a
     * one-way digest: nothing about the caller, and nothing from the delivery
     * address, can be read back out of it. Scoping is what stops one caller's
     * key returning another caller's order.
     *
     * `idempotencyFingerprint` is a digest of the *canonical* request — the
     * items, the quantities, the variant identities, the payment method and the
     * address. No client-supplied price is hashed, because no client-supplied
     * price is trusted (SEC-002).
     */
    idempotencyKey: { type: String },
    idempotencyScope: { type: String },
    idempotencyFingerprint: { type: String },

    /** 1 = pre-Phase-2 shape, 2 = snapshot + minor units + variant identity. */
    schemaVersion: { type: Number, default: 2 },
}, { timestamps: true, minimize: false })

// Indexes (DB-006, BE-010).
//
// `{ orderNumber: 1 }` is **not** declared here on purpose. It has to be
// *unique*, and a unique index cannot be built while duplicates exist — which
// they may, because allocation raced for as long as DB-002 was open. It is
// created by migration 003, after the duplicates it finds have been reassigned
// and the mapping reported. Declaring it here would let `autoIndex` try to build
// it at boot, before any of that has happened.
orderSchema.index({ userId: 1, date: -1 })
orderSchema.index({ status: 1, date: -1 })
orderSchema.index({ date: -1 })

// This one *is* safe to declare: the fields are new in Phase 2, so no existing
// document can violate it, and the partial filter keeps every order placed
// without a key out of the constraint entirely.
orderSchema.index(
    { idempotencyScope: 1, idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: {
            idempotencyScope: { $type: 'string' },
            idempotencyKey: { $type: 'string' },
        },
    },
)

const orderModel = mongoose.models.Order || mongoose.model('order', orderSchema);

export { ORDER_STATUSES }
export default orderModel;
