// 001 — query indexes (DB-006, BE-010).
//
// The only index in the entire schema set was `users.email: unique`. Every other
// query was a collection scan: the customer's order page, tag browsing, the
// best-sellers endpoint, the catalog sort, and — on **every single checkout** —
// `orders.findOne().sort('-orderNumber')`.
//
// ## Rollback
//
// `down()` drops exactly the indexes `up()` **created**, which is not the same
// as the indexes it lists. `createIndex` is idempotent, so an index an operator
// had already built by that name was silently adopted and then dropped by the
// rollback — a rollback removing something it did not add. `up()` now records
// which ones it created and `down()` drops only those. Indexes are pure
// optimisation: dropping one changes no document and loses no information.
//
// ## Deliberately not here
//
// **No unique index.** `orders.orderNumber` must be unique, but a unique index
// cannot be built while duplicates exist — and duplicates may exist, because
// allocation raced for as long as DB-002 was open. It is built by migration 003,
// after the duplicates it finds are reassigned and the mapping is reported.

export const id = '001_indexes'
export const name = 'Query indexes for orders and products'
export const findings = ['DB-006', 'BE-010']
export const description =
    'Creates the non-unique query indexes every list and lookup path needs. Adds no constraint.'
export const rollback =
    'down() drops the same indexes by name. Indexes carry no information, so nothing can be lost.'

/** `[collection, keys, options]` — the options carry the name `down()` drops. */
export const INDEXES = [
    ['orders', { userId: 1, date: -1 }, { name: 'userId_1_date_-1' }],
    ['orders', { status: 1, date: -1 }, { name: 'status_1_date_-1' }],
    ['orders', { date: -1 }, { name: 'date_-1' }],
    ['products', { tags: 1 }, { name: 'tags_1' }],
    ['products', { bestSeller: 1 }, { name: 'bestSeller_1' }],
    ['products', { date: -1 }, { name: 'date_-1' }],
    ['products', { archived: 1, date: -1 }, { name: 'archived_1_date_-1' }],
    // Justified: both clients filter the whole catalog in the browser today,
    // and a server-side search is the only way that stops being O(catalog) per
    // keystroke. Text indexes are expensive to build and cheap to drop.
    ['products', { name: 'text', description: 'text' }, { name: 'name_text_description_text' }],
]

/** The names already present on a collection, or none when it does not exist. */
async function existingIndexNames(db, collection) {
    try {
        const indexes = await db.collection(collection).indexes()
        return new Set(indexes.map((index) => index.name))
    } catch (error) {
        if (error?.code === 26) return new Set()   // NamespaceNotFound
        throw error
    }
}

export async function up({ db, own, log }) {
    for (const [collection, keys, options] of INDEXES) {
        // An index of the same name may already be there — created by an
        // operator, by a previous tool, or by an earlier partial run. `down()`
        // must not drop one this migration did not create, so what it created is
        // recorded rather than assumed. `createIndex` is idempotent, which used
        // to make the two cases indistinguishable.
        const present = await existingIndexNames(db, collection)
        if (present.has(options.name)) {
            log(`  = ${collection}.${options.name} (already present; not owned by this migration)`)
            continue
        }

        await own({
            collection: 'system.indexes',
            id: `${collection}.${options.name}`,
            set: { created: true },
            before: {},
        })

        // `background: true` matters on a populated collection: the build does
        // not hold a write lock, so reads and writes continue while it runs.
        await db.collection(collection).createIndex(keys, { ...options, background: true })
        log(`  + ${collection}.${options.name}`)
    }
}

export async function down({ db, log, ownedByUp }) {
    // Only the indexes this migration actually created, newest first.
    const owned = await ownedByUp()
    const created = new Set(owned.map((record) => record.target.id))

    for (const [collection, , options] of [...INDEXES].reverse()) {
        const key = `${collection}.${options.name}`
        if (!created.has(key)) {
            log(`  = ${key} (not created by this migration; left alone)`)
            continue
        }
        try {
            await db.collection(collection).dropIndex(options.name)
            log(`  - ${key}`)
        } catch (error) {
            // IndexNotFound (27) / NamespaceNotFound (26): already absent, which
            // is the state `down()` is trying to reach.
            if (error?.code !== 27 && error?.code !== 26) throw error
        }
    }
}

export default { id, name, findings, description, rollback, up, down, INDEXES }
