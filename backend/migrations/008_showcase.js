// 008 — data-driven homepage selection (FE-004, PORT-001, FE-030).
//
// Five storefront components selected the products they render by literal
// ObjectId. An id is the identity of one row in one database, so against any
// catalog not restored from the original dump every lookup missed: one section
// crashed the page, another invented a product that does not exist. Phase 0's
// workaround was to make the *seed* adopt those exact ids, documented as
// transitional with this phase as its end date.
//
// The replacement is a field on the product: which homepage surface it belongs
// to, and where in that surface it sits.
//
//     showcase: [{ slot: 'shop-the-look', order: 1 }, { slot: 'featured', order: 0 }]
//
// `up()` is **purely additive**: it writes `showcase: []` on every product that
// does not already have the field, so the path exists and reads uniformly. It
// assigns **nothing**. Deciding that a particular product is the hero product is
// an editorial judgement about a specific catalog, and a migration that guessed
// one — by picking the first four laptops, say, or by hardcoding the very ids
// this finding is about — would be re-introducing the defect under a new name.
// The seed makes those assignments for the demo catalog; the admin console makes
// them for a real one.
//
// An existing non-empty `showcase` is left exactly as it is, so re-running after
// assignments have been made cannot erase them.
//
// ## Rollback
//
// `down()` removes the field only from the products `up()` added it to, and
// only where it is still the empty array `up()` wrote. A product an
// administrator has since placed on the homepage keeps its assignments — they
// are editorial data this migration never created and has no business
// destroying — and each one is reported so a reviewer can see what was kept.

import { SHOWCASE_SLOTS } from '../lib/showcase.js'

export const id = '008_showcase'
export const name = 'Add data-driven homepage showcase metadata'
export const findings = ['FE-004', 'PORT-001', 'FE-030']
export const description =
    'Adds an empty showcase array to every product so the homepage can select by data instead of by hardcoded ObjectId. Assigns no slots: which product is featured is an editorial decision, not a derivable one.'
export const rollback =
    'down() unsets showcase on every product. Any assignments made after up() ran are reported first, because unsetting the field discards them.'

export { SHOWCASE_SLOTS }

export async function up({ db, own, log }) {
    const products = db.collection('products')

    // One at a time, because ownership is per document: `down()` must be able
    // to tell a product this migration gave `showcase: []` from one an
    // administrator has since made assignments on.
    let given = 0
    for await (const product of products.find({ showcase: { $exists: false } })) {
        await own({ collection: 'products', id: product._id, set: { showcase: [] }, before: {} })
        await products.updateOne({ _id: product._id }, { $set: { showcase: [] } })
        given += 1
    }

    log(`  ${given} product(s) given an empty showcase array; 0 slots assigned (editorial, not derivable)`)
}

export async function down({ db, report, log, revertOwned }) {
    const products = db.collection('products')

    // Assignments made after `up()` are real editorial data, and `up()` did not
    // make them. They are reported and then **left in place**: this rollback
    // removes the empty array it added, not somebody's homepage.
    for await (const product of products.find({ showcase: { $exists: true, $ne: [] } })) {
        await report({
            kind: 'showcase-assignment-kept',
            productId: String(product._id),
            showcase: product.showcase,
            reason: 'these assignments were made after up() ran, so the rollback left them alone',
        })
    }

    const { reverted, preserved } = await revertOwned()
    log(`  showcase removed from ${reverted} product(s); ${preserved} kept because they carry assignments made after up()`)
}

export default { id, name, findings, description, rollback, up, down }
