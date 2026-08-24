// One-off, idempotent: price the two Edition-axis products that the catalog
// pricing pass left flat.
//
//   node fix_edition_variant_prices.js            # dry run — prints the plan
//   node fix_edition_variant_prices.js --apply    # writes to MONGODB_URI
//
// Why these two products
// ----------------------
// `populate_realistic_prices.js` treats an axis as cosmetic when its name
// matches `FREE_AXIS` — `/^(colou?r|finish|style|pattern|edition)$/i`. "Edition"
// is in that list because on most of this catalog it names a colourway. On
// these two products it names the hardware: a wireless mouse against a wired
// one, a disc drive against none. Both therefore kept a zero delta on every
// combination, and the storefront showed one price whichever option was
// pressed. Widening `FREE_AXIS` would reprice every Edition axis in the
// catalog, so the fix is stated per product, by id, here.
//
// The PlayStation follows the lowest-price-base model the rest of the catalog
// uses: the cheapest combination is the product's own price and carries a zero
// delta, so the base is never a figure no combination can be bought for. That
// moves the stored base from 499.99 to 449.99 — the Digital edition — and puts
// the +50 on the disc model, which still totals the 499.99 it sold for.
//
// Safety
// ------
// This one is the mirror image of `scripts/seedSafety.js`: the seed refuses to
// touch anything but a disposable local database, and this refuses to touch
// anything *but* the production catalog, because a delta written into a
// throwaway database is a silent no-op that reads as success. The target is
// judged before a connection is attempted.
//
// Writes go through `doc.save()` so the model's `pre('validate')` hook keeps
// `price`/`priceMinor` and `inventory`/`inventoryV2` in step. Quantities,
// option pairs, variant ids and skus are never assigned to. `--apply` writes a
// timestamped snapshot of everything it is about to change first, and re-reads
// both documents afterwards to verify what actually landed.

import { writeFileSync } from 'node:fs'

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

import Product from './models/productModel.js'
import { parseMongoUri } from './scripts/seedSafety.js'

const APPLY = process.argv.includes('--apply')

/** The one database this script is allowed to write to. */
export const EXPECTED_DB_NAME = 'e-commerce'

/**
 * The intended state of each product, in major units.
 *
 * `name` is not used to find the document — the id is the identity — it is
 * asserted against what was loaded, so a script pointed at a database where
 * these ids mean something else stops instead of repricing a stranger.
 */
export const PLAN = [
    {
        _id: '6a89ab116111a5cf6e199bfa',
        name: 'Razer Cobra Gaming Mouse',
        price: 39.99,
        axis: 'Edition',
        deltas: {
            'Standard': 0,
            'Pro (Wireless)': 90,
        },
    },
    {
        _id: '6a89ab116111a5cf6e199bf9',
        name: 'PlayStation 5 (PS5) Slim Console',
        price: 449.99,
        axis: 'Edition',
        deltas: {
            'Digital': 0,
            'Standard (Disc)': 50,
        },
    },
]

export class UnsafeCatalogTargetError extends Error {
    constructor(reason, hint) {
        super(hint ? `${reason}\n  ${hint}` : reason)
        this.name = 'UnsafeCatalogTargetError'
        this.reason = reason
        this.hint = hint
    }
}

const ATLAS_HOST = /\.mongodb\.(net|com)$/i

/**
 * Judge the write target. Throws unless it is the production catalog on Atlas.
 *
 * Kept free of I/O and of `process.env` so the rule can be exercised in
 * isolation, exactly as the seed's guards are.
 */
export function assertCatalogTarget(uri) {
    const parsed = parseMongoUri(uri)

    const isAtlas = parsed.hosts.length > 0
        && parsed.hosts.every(({ host }) => ATLAS_HOST.test(host))
    if (!isAtlas) {
        throw new UnsafeCatalogTargetError(
            'Refusing to run: the target is not the MongoDB Atlas catalog.',
            'These two product ids only exist in the production catalog; writing them anywhere else changes nothing and reports success.',
        )
    }

    if (parsed.dbName !== EXPECTED_DB_NAME) {
        throw new UnsafeCatalogTargetError(
            `Refusing to run against database "${parsed.dbName || '(none named)'}".`,
            `This script writes to "${EXPECTED_DB_NAME}" and to nothing else.`,
        )
    }

    // Only the database name. The URI carries credentials and the host is not
    // needed to describe the target.
    return { description: `MongoDB Atlas → database "${EXPECTED_DB_NAME}"` }
}

const optionsOf = (entry) => (entry.options instanceof Map
    ? Object.fromEntries(entry.options.entries())
    : (entry.options ?? {}))

const toMinor = (major) => Math.round(major * 100)

/**
 * What one product's rows should become, and whether they already are.
 *
 * Every combination must be named by the plan and every named option must
 * exist, in both directions: an unmatched option means the catalog changed
 * under this script, and guessing at that point is how a "narrow" fix stops
 * being narrow.
 */
export function diffFor(product, intent) {
    if (product.name !== intent.name) {
        throw new Error(`${intent._id} is "${product.name}", not "${intent.name}" — refusing to reprice it.`)
    }

    const axis = (product.variants ?? []).find((variant) => variant.name === intent.axis)
    if (!axis) throw new Error(`${intent.name} has no "${intent.axis}" axis.`)

    const planned = Object.keys(intent.deltas)
    const declared = axis.options.map(String)
    const unplanned = declared.filter((option) => !planned.includes(option))
    const unknown = planned.filter((option) => !declared.includes(option))
    if (unplanned.length > 0 || unknown.length > 0) {
        throw new Error(
            `${intent.name}: the "${intent.axis}" options no longer match the plan `
            + `(declared: ${declared.join(', ')} | planned: ${planned.join(', ')}).`,
        )
    }

    const rows = (product.inventoryV2 ?? []).map((entry) => {
        const chosen = optionsOf(entry)[intent.axis]
        if (chosen === undefined || !(chosen in intent.deltas)) {
            throw new Error(`${intent.name}: no planned delta for combination "${entry.variantId}".`)
        }
        const to = intent.deltas[chosen]
        return {
            entry,
            label: chosen,
            fromDelta: Number(entry.priceDelta) || 0,
            toDelta: to,
            fromMinorDelta: Number(entry.priceMinorDelta) || 0,
            toMinorDelta: toMinor(to),
        }
    })

    const priceChanges = Number(product.price) !== intent.price
        || Number(product.priceMinor) !== toMinor(intent.price)
    const changedRows = rows.filter((row) => row.fromDelta !== row.toDelta
        || row.fromMinorDelta !== row.toMinorDelta)

    return { rows, changedRows, priceChanges, settled: !priceChanges && changedRows.length === 0 }
}

/** Everything this run is about to overwrite, in a form that can undo it. */
const snapshotOf = (product) => ({
    _id: String(product._id),
    name: product.name,
    price: product.price,
    priceMinor: product.priceMinor,
    inventoryV2: (product.inventoryV2 ?? []).map((entry) => ({
        variantId: entry.variantId,
        options: optionsOf(entry),
        quantity: entry.quantity,
        priceDelta: Number(entry.priceDelta) || 0,
        priceMinorDelta: Number(entry.priceMinorDelta) || 0,
    })),
})

const money = (major) => `$${Number(major).toFixed(2)}`

async function run() {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set')

    const { description } = assertCatalogTarget(uri)

    await mongoose.connect(uri)
    console.log(`\nTarget: ${description}`)
    console.log(APPLY ? 'Mode:   APPLY (writing)\n' : 'Mode:   DRY RUN — pass --apply to write\n')

    const pending = []
    const written = []

    // Read, validate and plan the entire change set before writing anything.
    // A failure on the second product must not leave the first one mutated.
    for (const intent of PLAN) {
        const product = await Product.findById(intent._id)
        if (!product) throw new Error(`Product ${intent._id} (${intent.name}) was not found.`)

        const diff = diffFor(product, intent)
        const { rows, changedRows, priceChanges, settled } = diff

        console.log(`${product.name}  [${intent.axis}]`)
        if (settled) {
            console.log(`    already at ${money(intent.price)} base; no change\n`)
            written.push(intent)
            continue
        }

        if (priceChanges) {
            console.log(`    base price   ${money(product.price)}  →  ${money(intent.price)}`)
        }
        for (const row of rows) {
            const mark = changedRows.includes(row) ? ' *' : '  '
            console.log(
                `   ${mark}${row.label.padEnd(18)} delta ${money(row.fromDelta)}  →  ${money(row.toDelta)}`
                + `   (final ${money(intent.price + row.toDelta)}, qty ${row.entry.quantity} unchanged)`,
            )
        }
        console.log('')
        pending.push({ intent, product, diff })
    }

    if (APPLY && pending.length > 0) {
        // Persist the rollback material BEFORE the first mutation. If a later
        // save fails or the process is interrupted, the original state is
        // already durable on disk rather than trapped in process memory.
        const file = `edition-price-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        writeFileSync(file, JSON.stringify(pending.map(({ product }) => snapshotOf(product)), null, 2))
        console.log(`Wrote pre-change snapshot to ${file}\n`)

        for (const { intent, product, diff } of pending) {
            // Both representations, explicitly. The model's pre('validate')
            // hook reconciles them, and reconciling a pair that already agrees
            // is the only way it cannot pick the wrong one.
            product.price = intent.price
            product.priceMinor = toMinor(intent.price)
            for (const row of diff.rows) {
                row.entry.priceDelta = row.toDelta
                row.entry.priceMinorDelta = row.toMinorDelta
            }
            product.markModified('inventoryV2')
            await product.save()
            written.push(intent)
        }
    }

    if (!APPLY) {
        console.log('Nothing was written.')
        await mongoose.disconnect()
        return
    }

    // Verify against the database rather than against the objects just saved.
    console.log('Verifying persisted values')
    let failures = 0
    for (const intent of PLAN) {
        const fresh = await Product.findById(intent._id).lean()
        const problems = []
        if (Number(fresh.price) !== intent.price) problems.push(`price is ${fresh.price}`)
        if (Number(fresh.priceMinor) !== toMinor(intent.price)) problems.push(`priceMinor is ${fresh.priceMinor}`)
        for (const entry of fresh.inventoryV2 ?? []) {
            const chosen = optionsOf(entry)[intent.axis]
            const expected = intent.deltas[chosen]
            if (Number(entry.priceDelta) !== expected) problems.push(`${chosen} priceDelta is ${entry.priceDelta}`)
            if (Number(entry.priceMinorDelta) !== toMinor(expected)) problems.push(`${chosen} priceMinorDelta is ${entry.priceMinorDelta}`)
            if (!Number.isFinite(Number(entry.quantity))) problems.push(`${chosen} lost its quantity`)
        }
        if (problems.length > 0) {
            failures += 1
            console.log(`  FAIL ${fresh.name}: ${problems.join('; ')}`)
            continue
        }
        const finals = (fresh.inventoryV2 ?? [])
            .map((entry) => {
                const chosen = optionsOf(entry)[intent.axis]
                return `${chosen} ${money(fresh.price + Number(entry.priceDelta))} (qty ${entry.quantity})`
            })
            .join(', ')
        console.log(`  OK   ${fresh.name}: base ${money(fresh.price)} — ${finals}`)
    }

    await mongoose.disconnect()
    if (failures > 0) process.exit(1)
    console.log(`\n${written.length} product(s) at their intended prices.`)
}

// Importable for tests; only the direct invocation connects to anything.
if (process.argv[1] && process.argv[1].endsWith('fix_edition_variant_prices.js')) {
    run().catch(async (error) => {
        console.error(`\nFailed: ${error?.name}: ${error?.message}\n`)
        await mongoose.disconnect().catch(() => { })
        process.exit(1)
    })
}
