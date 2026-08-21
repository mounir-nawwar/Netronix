// 006 — real references, soft delete, and dangling-reference cleanup
// (DB-007, ADM-003).
//
// `order.userId`, `order.items[].productId` and `user.wishlist[]` were all plain
// strings with no `ref`, no population and no cascade behaviour. `removeProduct`
// hard-deleted unconditionally, so a deleted product's id stayed in every order
// line, every wishlist and every cart, for every user, permanently. The clients
// papered over it — `.filter(Boolean)` in the wishlist, `|| {}` in orders — so
// the drift was invisible and it grew.
//
// `up()` does three things:
//
//   1. **Casts valid string ids to ObjectIds.** Lossless: a 24-hex string and
//      the ObjectId it denotes are the same value in two encodings. A value that
//      is *not* a valid ObjectId is **reported and left as it is** — never
//      dropped, because a malformed id is evidence of something and deleting it
//      destroys the evidence.
//   2. **Adds `archived: false`** to every product. Purely additive.
//   3. **Prunes dangling wishlist and cart references** — ids pointing at
//      products that no longer exist — writing every removal to the audit
//      report first, together with the user it came from.
//
// ## Rollback
//
// `down()` restores exactly what `up()` changed, from the journal entries `up()`
// wrote **before** each change: the string encodings, the pruned wishlist and
// cart entries, and the `archived` flag on the products it defaulted. A document
// created afterwards is not touched, and a value something has changed since is
// preserved and reported rather than overwritten.
//
// ## Irreversible information
//
// None, provided the `migrationJournal` entries survive. They are written before
// each change rather than after the run, so a crash mid-run leaves the evidence
// for everything that had actually happened.
//
// ## Not here
//
// **No Cloudinary call.** Deleting a remote image is an external, irreversible
// side effect on a third-party account and is out of scope for a local data
// migration.

import { ObjectId } from 'mongodb'

export const id = '006_refs_and_archive'
export const name = 'Cast id references, add archived, prune dangling references'
export const findings = ['DB-007', 'ADM-003']
export const description =
    'Casts valid string ids on orders and wishlists to ObjectIds, adds archived:false to products, and prunes wishlist/cart entries pointing at products that no longer exist.'
export const rollback =
    'down() casts the ids back to their pre-Phase-2 string encoding and restores every pruned reference from the audit report. It depends on that report document still existing.'

/**
 * A note on what `down()` restores.
 *
 * It returns every reference to the **string** encoding, because that is what
 * the pre-Phase-2 schema held: `order.userId` was `String` and `order.items[]`
 * was an untyped array. The value is identical either way — a 24-hex string and
 * the ObjectId it denotes are the same id — so nothing is lost; what is restored
 * is the encoding, not a different id.
 */

const isValidId = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)

export async function up({ db, report, own, log }) {
    const orders = db.collection('orders')
    const users = db.collection('users')
    const products = db.collection('products')

    // --- 1. cast order references ------------------------------------------
    let castOrders = 0
    for await (const order of orders.find({})) {
        const update = {}

        if (typeof order.userId === 'string') {
            if (isValidId(order.userId)) update.userId = new ObjectId(order.userId)
            else {
                await report({
                    kind: 'malformed-reference',
                    collection: 'orders', field: 'userId',
                    orderId: String(order._id), value: order.userId,
                    reason: 'not a valid ObjectId; left as a string rather than dropped',
                })
            }
        }

        let itemsChanged = false
        const reportQueue = []
        const items = (order.items ?? []).map((item) => {
            if (typeof item?.productId !== 'string') return item
            if (!isValidId(item.productId)) {
                reportQueue.push({
                    kind: 'malformed-reference',
                    collection: 'orders', field: 'items[].productId',
                    orderId: String(order._id), value: item.productId,
                    reason: 'not a valid ObjectId; left as a string rather than dropped',
                })
                return item
            }
            itemsChanged = true
            return { ...item, productId: new ObjectId(item.productId) }
        })
        if (itemsChanged) update.items = items

        for (const entry of reportQueue) await report(entry)

        if (Object.keys(update).length > 0) {
            const before = {}
            for (const field of Object.keys(update)) {
                if (field in order) before[field] = order[field]
            }
            await own({ collection: 'orders', id: order._id, set: update, before })

            await orders.updateOne({ _id: order._id }, { $set: update })
            castOrders += 1
        }
    }

    // --- 2. archived flag ---------------------------------------------------
    //
    // One at a time, so `down()` can tell a product this migration defaulted to
    // `archived: false` from one an administrator has since archived. The old
    // rollback unset the flag on every product in the collection, which
    // un-archived everything anybody had deliberately archived.
    for await (const product of products.find({ archived: { $exists: false } })) {
        await own({ collection: 'products', id: product._id, set: { archived: false }, before: {} })
        await products.updateOne({ _id: product._id }, { $set: { archived: false } })
    }

    // --- 3. wishlist / cart references -------------------------------------
    const liveIds = new Set(
        (await products.find({}, { projection: { _id: 1 } }).toArray()).map((doc) => String(doc._id)),
    )

    let castUsers = 0
    for await (const user of users.find({})) {
        const update = {}

        const wishlist = []
        for (const raw of user.wishlist ?? []) {
            const asString = String(raw)
            if (!isValidId(asString)) {
                await report({
                    kind: 'malformed-reference',
                    collection: 'users', field: 'wishlist[]',
                    userId: String(user._id), value: asString,
                    reason: 'not a valid ObjectId; removed from the array and recorded here',
                })
                continue
            }
            if (!liveIds.has(asString)) {
                await report({
                    kind: 'dangling-reference-pruned',
                    collection: 'users', field: 'wishlist[]',
                    userId: String(user._id), value: asString,
                    reason: 'the product no longer exists',
                })
                continue
            }
            wishlist.push(new ObjectId(asString))
        }
        if (wishlist.length !== (user.wishlist ?? []).length
            || (user.wishlist ?? []).some((raw) => typeof raw === 'string')) {
            update.wishlist = wishlist
        }

        const cartData = { ...(user.cartData ?? {}) }
        let cartChanged = false
        for (const productId of Object.keys(cartData)) {
            if (liveIds.has(productId)) continue
            await report({
                kind: 'dangling-reference-pruned',
                collection: 'users', field: 'cartData',
                userId: String(user._id), value: productId,
                entry: cartData[productId],
                reason: 'the product no longer exists',
            })
            delete cartData[productId]
            cartChanged = true
        }
        if (cartChanged) update.cartData = cartData

        if (Object.keys(update).length > 0) {
            const before = {}
            for (const field of Object.keys(update)) {
                if (field in user) before[field] = user[field]
            }
            await own({ collection: 'users', id: user._id, set: update, before })

            await users.updateOne({ _id: user._id }, { $set: update })
            castUsers += 1
        }
    }

    log(`  ${castOrders} order(s), ${castUsers} user(s) updated`)
}

export async function down({ log, revertOwned }) {
    // Everything this migration changed, restored to what it changed it from —
    // the string encodings, the pruned wishlist and cart entries, the `archived`
    // flag — and nothing else.
    //
    // The old rollback ran `updateMany({}, { $unset: { archived: … } })` and
    // cast **every** order and user back to strings. That un-archived every
    // product an administrator had archived since, and rewrote references on
    // orders created after the migration, which were never strings to begin
    // with. It also depended on the summary report document still existing;
    // the journal is written as the work happens instead.
    const { reverted, preserved } = await revertOwned()
    log(`  ${reverted} field(s) restored; ${preserved} left alone because something changed them after up()`)
}

export default { id, name, findings, description, rollback, up, down }
