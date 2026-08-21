import mongoose from "mongoose";

/**
 * Two fields are new in Phase 1, and both are additive: an existing document
 * with neither still loads, and both defaults are the safe value.
 *
 *  * `role` (SEC-001, ADM-001) — the admin is now a user document with
 *    `role: 'admin'` and a bcrypt hash, instead of a pair of environment
 *    variables compared in plaintext and then signed *into* the session token.
 *    Every existing user defaults to `customer`, so adding the field grants
 *    nobody anything.
 *
 *  * `tokenVersion` (SEC-003) — the revocation counter. A token carries the
 *    version it was issued against; `authUser` and `adminAuth` compare it with
 *    the document's current value, so incrementing it invalidates every token
 *    already issued for that user. That is what makes logout mean something on
 *    a server that had no session store and no expiry at all.
 */
const userSchema = new mongoose.Schema({
    name: {type: String , required: true},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: {type: String, enum: ['customer', 'admin'], default: 'customer', required: true},
    tokenVersion: {type: Number, default: 0, required: true},
    /**
     * The legacy cart map, `{ productId: { legacyKey: quantity } }`.
     *
     * Kept and still written, because a browser tab holding a cached bundle
     * reads it — the same additive rollout `inventory`/`inventoryV2` and
     * `price`/`priceMinor` take. It is **derived** from `cartLines` on every
     * write and is lossy by construction: two combinations whose option values
     * happen to hyphen-join to the same string share one key here, and their
     * quantities are summed. That collision is precisely why `cartLines` exists.
     */
    cartData: {type: Object, default: {}},

    /**
     * The cart, losslessly (DB-003).
     *
     * A cart line used to be a number under a hyphen-joined key, so for a
     * catalog containing `["16-inch","16"] × ["1TB","inch-1TB"]` — every value
     * of which this catalog sells — the combinations `16-inch + 1TB` and
     * `16 + inch-1TB` were *the same line*. Adding the second overwrote the
     * first, and checkout had to reconstruct the options from the key and refuse
     * when it could not. Refusing stops the wrong thing being bought; it does
     * not let the customer buy the right thing.
     *
     * The identity is now kept at the moment it is known — when the customer
     * selects it — as the canonical id **and the option pairs themselves**.
     *
     * `variantId: null` marks a line recovered from a legacy key that the
     * catalog cannot resolve to exactly one combination. Nothing invents an
     * identity for it: it is carried, reported, and removable.
     */
    cartLines: {
        type: [new mongoose.Schema({
            productId: {type: String, required: true},
            variantId: {type: String, default: null},
            variantOptions: {type: Map, of: String, default: null},
            variantKey: {type: String, default: ''},
            quantity: {type: Number, required: true, min: 0},
        }, {_id: false})],
        default: [],
    },

    /**
     * Bumped by every cart write, so a whole-map replacement can tell whether
     * it is still writing over what it read.
     *
     * `addToCart` and `updateCart` write one entry atomically and need no
     * version; `mergeCart` legitimately replaces the whole map, and this is what
     * stops it erasing a line another tab added while it was merging.
     */
    cartVersion: {type: Number, default: 0},
    /**
     * Real references (DB-007). This was a bare `Array` of strings with no
     * `ref`, so nothing could be populated and a deleted product's id stayed in
     * every wishlist for ever — `Wishlist.jsx` papered over it with
     * `.filter(Boolean)`, which is how the drift stayed invisible while it grew.
     *
     * Casting a valid 24-hex string to an ObjectId is lossless, so this is
     * additive for every well-formed existing document. Malformed values are
     * reported by the migration rather than dropped.
     */
    wishlist: {type: [{type: mongoose.Schema.Types.ObjectId, ref: 'product'}], default: []}
},{minimize: false, timestamps: true})

const userModel = mongoose.models.user || mongoose.model('user', userSchema);

export default userModel
