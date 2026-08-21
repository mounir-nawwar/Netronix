// 007 — status history, timestamps, and cart pruning (DB-008, DB-009, DB-011).
//
// Three small backfills that make the tightened schemas true of the documents
// already in the collection:
//
//   * **`statusHistory`.** `updateStatus` was `findByIdAndUpdate(id, { status })`
//     with no validation of any kind, so "Delivered" could silently become
//     anything, and nothing recorded who changed what or when. Every existing
//     order is given a single opening event derived from its current status and
//     date, attributed to `migration` rather than to a person — because nobody
//     knows who set it, and inventing an actor would be worse than admitting
//     that.
//   * **A status outside the enum** is coerced to `Order Placed` and
//     **reported**, with the original value recorded so the coercion is
//     reversible and auditable.
//   * **`createdAt`/`updatedAt`** are backfilled from the existing `date`, which
//     is a `Date` on orders and epoch milliseconds on products — two
//     representations, neither of them `createdAt`, which is what
//     `Collections.jsx` has always tried to sort on.
//   * **Zero-quantity cart entries** are deleted rather than left in place.
//     Removal wrote `0` and never pruned, so a long-lived account accumulated
//     them indefinitely, toward the 16 MB document limit.
//
// ## Rollback
//
// `down()` reverts exactly the documents `up()` touched and exactly the fields it
// wrote, restoring coerced statuses and pruned cart entries from the journal
// entries written before each change. An order placed after the migration keeps
// its status history — that history is a record of things that really happened,
// not a backfill — and any value changed since `up()` ran is preserved and
// reported rather than overwritten.

export const id = '007_schema_tightening'
export const name = 'Backfill status history and timestamps, prune zeroed cart entries'
export const findings = ['DB-008', 'DB-009', 'DB-011', 'SEC-017']
export const description =
    'Gives every order an opening status event, coerces and reports out-of-enum statuses, backfills createdAt/updatedAt from the legacy date fields, and deletes zero-quantity cart entries.'
export const rollback =
    'down() unsets the added fields and restores coerced statuses and pruned cart entries from the audit report.'

export const ORDER_STATUSES = ['Order Placed', 'Packing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']

export async function up({ db, report, own, log, now }) {
    const orders = db.collection('orders')
    const users = db.collection('users')
    const products = db.collection('products')

    let touchedOrders = 0
    for await (const order of orders.find({ statusHistory: { $exists: false } })) {
        const original = order.status
        const valid = ORDER_STATUSES.includes(original)
        const status = valid ? original : 'Order Placed'

        if (!valid) {
            await report({
                kind: 'coerced-status',
                orderId: String(order._id),
                from: original,
                to: status,
                reason: 'the stored status is not in the enum; coerced to the opening status',
            })
        }

        const at = order.date instanceof Date ? order.date : new Date(order.date ?? now)
        const set = {
            status,
            statusHistory: [{ status, at, by: 'migration' }],
            createdAt: order.createdAt ?? at,
            updatedAt: order.updatedAt ?? at,
        }
        const before = {}
        for (const field of Object.keys(set)) {
            if (field in order) before[field] = order[field]
        }
        await own({ collection: 'orders', id: order._id, set, before })

        await orders.updateOne({ _id: order._id }, { $set: set })
        touchedOrders += 1
    }

    // Products carry `date` as epoch milliseconds.
    for await (const product of products.find({ createdAt: { $exists: false } })) {
        const at = typeof product.date === 'number' ? new Date(product.date) : now
        const set = { createdAt: at, updatedAt: product.updatedAt ?? at }
        const before = {}
        for (const field of Object.keys(set)) {
            if (field in product) before[field] = product[field]
        }
        await own({ collection: 'products', id: product._id, set, before })

        await products.updateOne({ _id: product._id }, { $set: set })
    }

    let prunedEntries = 0
    for await (const user of users.find({})) {
        const cartData = user.cartData ?? {}
        const next = {}
        const pruned = []
        let changed = false

        for (const [productId, variants] of Object.entries(cartData)) {
            if (!variants || typeof variants !== 'object') { changed = true; continue }
            const kept = {}
            for (const [variantKey, quantity] of Object.entries(variants)) {
                if (Number(quantity) > 0) { kept[variantKey] = quantity; continue }
                pruned.push({
                    kind: 'zero-cart-entry-pruned',
                    userId: String(user._id), productId, variantKey, quantity,
                    reason: 'removal wrote 0 rather than deleting the key (DB-011)',
                })
                prunedEntries += 1
                changed = true
            }
            if (Object.keys(kept).length > 0) next[productId] = kept
            else if (Object.keys(variants).length > 0) changed = true
        }

        for (const entry of pruned) await report(entry)

        const set = changed
            ? { cartData: next, createdAt: user.createdAt ?? now, updatedAt: now }
            : (user.createdAt ? null : { createdAt: now, updatedAt: now })

        if (set) {
            const before = {}
            for (const field of Object.keys(set)) {
                if (field in user) before[field] = user[field]
            }
            await own({ collection: 'users', id: user._id, set, before })
            await users.updateOne({ _id: user._id }, { $set: set })
        }
    }

    log(`  ${touchedOrders} order(s) given a status history, ${prunedEntries} zeroed cart entr(ies) pruned`)
}

export async function down({ log, revertOwned }) {
    // Exactly what `up()` wrote, and only where it is still what `up()` wrote.
    //
    // The old rollback ran `updateMany({}, { $unset: { statusHistory: '', … } })`
    // over every order in the collection. Orders placed *after* the migration
    // carry a real status history — every transition an administrator made,
    // with who made it and when — and that unset destroyed all of it. A
    // rollback of a backfill has no business deleting an audit trail it did not
    // write. Coerced statuses and pruned cart entries come back from the journal
    // entries written before each change.
    const { reverted, preserved } = await revertOwned()
    log(`  ${reverted} field(s) restored; ${preserved} left alone because something changed them after up()`)
}

export default { id, name, findings, description, rollback, up, down, ORDER_STATUSES }
