// 005 — lossless variant inventory (DB-003, ARCH-002, ARCH-003).
//
// `inventory` was an untyped bag keyed by option values joined with `-`, with no
// key validation and no value validation. In a computer-hardware catalog that
// breaks on the first realistic option: `16-inch`, `RTX-4090`, `Wi-Fi 6E`,
// `USB-C`. `up()` writes `inventoryV2` — typed entries carrying the option pairs
// themselves — **alongside** the legacy bag, which is not touched.
//
// ## Ambiguity is reported, never guessed
//
// Axes `["16-inch","16"] × ["1TB","inch-1TB"]` both produce the key
// `"16-inch-1TB"`. There is no algorithmic way to know which combination the
// stored number belonged to. Those entries are written with `needsReview: true`
// and **no quantity claimed**, the affected keys are listed in the migration
// report, and the legacy value is left exactly where it is for a human to
// resolve. Guessing would silently move stock between two real combinations.
//
// Keys present in the bag that no combination generates are reported as orphans
// and left in place — the same reasoning.
//
// ## Rollback
//
// `down()` reverts exactly the products `up()` converted, and only where the
// array it wrote is still the array stored. A product created afterwards keeps
// its `inventoryV2` — for such a product that array is the stock record itself,
// not a backfill of one, and the legacy bag cannot represent a hyphenated
// option value. The legacy bag is the untouched original either way.
//
// ## Irreversible information
//
// None. `up()` adds a strictly more informative representation and removes
// nothing; `down()` removes only what `up()` added.

import { deriveInventoryV2 } from '../lib/variant.js'

export const id = '005_inventory_v2'
export const name = 'Write typed variant inventory alongside the legacy bag'
export const findings = ['DB-003', 'ARCH-002', 'ARCH-003']
export const description =
    'Derives inventoryV2 from each product\'s variant definition and legacy inventory. Ambiguous and orphaned legacy keys are reported, not resolved.'
export const rollback =
    'down() unsets inventoryV2. The legacy inventory object was never modified, so nothing is lost in either direction.'

export async function up({ db, report, own, log }) {
    const products = db.collection('products')
    let converted = 0
    let flagged = 0

    for await (const product of products.find({ inventoryV2: { $exists: false } })) {
        const { entries, ambiguousKeys, orphanKeys } = deriveInventoryV2(product.variants, product.inventory ?? {})

        for (const key of ambiguousKeys) {
            flagged += 1
            await report({
                kind: 'ambiguous-variant-key',
                productId: String(product._id),
                productName: product.name,
                legacyKey: key,
                reason: 'more than one combination produces this key; the stored quantity was NOT assigned to either. Resolve by hand.',
            })
        }
        for (const key of orphanKeys) {
            await report({
                kind: 'orphan-inventory-key',
                productId: String(product._id),
                productName: product.name,
                legacyKey: key,
                quantity: product.inventory?.[key],
                reason: 'no combination of the declared variants generates this key; it was left in the legacy bag untouched.',
            })
        }

        const set = { inventoryV2: entries, archived: product.archived ?? false }
        const before = {}
        for (const field of Object.keys(set)) {
            if (field in product) before[field] = product[field]
        }
        await own({ collection: 'products', id: product._id, set, before })

        await products.updateOne({ _id: product._id }, { $set: set })
        converted += 1
    }

    log(`  ${converted} product(s) converted, ${flagged} ambiguous key(s) reported`)
}

export async function down({ log, revertOwned }) {
    // `updateMany({}, { $unset: { inventoryV2: '' } })` was wrong the moment the
    // application created its first product: a product written after `up()` has
    // `inventoryV2` as its **only** typed stock record, and the legacy bag beside
    // it cannot represent a hyphenated option value. Unsetting it lost real
    // stock. Only the documents this migration converted are reverted, and only
    // where the array it wrote is still the array stored.
    const { reverted, preserved } = await revertOwned()
    log(`  inventoryV2 removed from ${reverted} product(s); ${preserved} left alone because something changed them after up()`)
}

export default { id, name, findings, description, rollback, up, down }
