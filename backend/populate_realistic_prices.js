// One-off: give every variant combination a realistic, escalating price delta.
//
//   node populate_realistic_prices.js            # dry run — prints the plan
//   node populate_realistic_prices.js --apply    # writes to MONGODB_URI
//
// Rules (from the brief)
// ----------------------
//   * A product whose only axis is Colour keeps every delta at 0.
//   * Every other product gets deltas that escalate with the option's rank
//     within its axis, with the cheapest combination at exactly 0.
//
// Why ranking rather than a lookup table
// --------------------------------------
// The previous version matched literal strings — `"16GB"`, `"4K OLED"` — so any
// value it had not been told about scored 0, and the base option scored a
// non-zero delta because nothing anchored the cheapest combination to zero.
// This ranks each axis's declared options by a parsed weight (capacity,
// resolution, chip tier, screen size, GPU model number), so an option nobody
// anticipated still lands in the right order, and rank 0 is always free.
//
// Writes go through `doc.save()` so the model's `pre('validate')` hook runs and
// keeps `inventory`/`inventoryV2` in step. `--apply` snapshots every document's
// current matrix to a timestamped JSON file first.

import { writeFileSync } from 'node:fs'

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

import Product from './models/productModel.js'

const APPLY = process.argv.includes('--apply')

/** Axes that never move the price, however many options they declare. */
const FREE_AXIS = /^(colou?r|finish|style|pattern|edition)$/i

/**
 * What one rank step costs on a given axis, before scaling.
 * The default covers an axis this script has never seen.
 */
const AXIS_STEP = [
    [/^(gpu|graphics|video)/i, 350],
    [/^(chip|cpu|processor|soc)/i, 300],
    [/^(size|screen size)/i, 200],
    [/^(display|screen|resolution|panel)/i, 175],
    [/^(ram|memory)/i, 150],
    [/^(storage|ssd|drive|capacity|hard drive)/i, 125],
]

const stepFor = (axisName) => {
    const hit = AXIS_STEP.find(([pattern]) => pattern.test(axisName))
    return hit ? hit[1] : 100
}

/**
 * A comparable weight for one option value.
 *
 * Everything is expressed on its own scale; only the ordering within a single
 * axis is ever compared, so the scales never have to agree with each other.
 * `null` means "nothing parseable", and the caller falls back to declaration
 * order — which is the order an administrator typed them in, cheapest first by
 * convention.
 */
function weightOf(value) {
    const text = String(value)

    // Capacity: 8GB, 512 GB, 1TB, 2 TB, 512MB. Normalised to GB.
    const capacity = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i)
    if (capacity) {
        const amount = Number(capacity[1])
        const unit = capacity[2].toUpperCase()
        return unit === 'TB' ? amount * 1024 : unit === 'MB' ? amount / 1024 : amount
    }

    // Resolution: 2.8K OLED, 4K, 5K, 6K.
    const resolution = text.match(/(\d+(?:\.\d+)?)\s*K\b/i)
    if (resolution) return Number(resolution[1]) * 1000

    // Screen size: 14-inch, 16", 13.6 inch.
    const inches = text.match(/(\d+(?:\.\d+)?)\s*(?:-?\s*inch|")/i)
    if (inches) return Number(inches[1])

    // GPU model numbers: RTX 4070, RX 7900.
    const model = text.match(/\b([3-9]\d{3})\b/)
    if (model) return Number(model[1])

    // Chip tier, plus core count as a tie-break: "M4 Pro (12-core)".
    const tier = /\bultra\b/i.test(text) ? 3
        : /\bmax\b/i.test(text) ? 2
            : /\bpro\b/i.test(text) ? 1
                : /\b(air|base|standard)\b/i.test(text) ? 0
                    : null
    if (tier !== null) {
        const cores = text.match(/(\d+)\s*-?\s*core/i)
        return tier * 100 + (cores ? Number(cores[1]) : 0)
    }

    return null
}

/**
 * Rank each declared option of one axis, cheapest first.
 * @returns {Map<string, number>} option value → rank, starting at 0
 */
function rankAxis(axis) {
    const options = axis.options.map(String)
    const weights = options.map(weightOf)
    const parseable = weights.every((weight) => weight !== null)

    const ordered = parseable
        ? [...options].sort((a, b) => weightOf(a) - weightOf(b))
        : options // declaration order: what the administrator typed

    // Equal weights share a rank, so two same-capacity options cost the same.
    const ranks = new Map()
    let rank = 0
    ordered.forEach((option, index) => {
        if (index > 0) {
            const previous = ordered[index - 1]
            const same = parseable && weightOf(option) === weightOf(previous)
            if (!same) rank += 1
        }
        ranks.set(option, rank)
    })
    return ranks
}

const roundTo5 = (value) => Math.round(value / 5) * 5

/**
 * The intended delta for every combination of one product.
 * @returns {Map<string, number>} variantId → delta in major units
 */
function planFor(product) {
    const axes = (product.variants ?? [])
        .filter((variant) => variant?.name && Array.isArray(variant.options) && variant.options.length > 0)

    const plan = new Map()
    const entries = product.inventoryV2 ?? []

    const priced = axes.filter((axis) => !FREE_AXIS.test(axis.name))
    if (axes.length === 0 || priced.length === 0) {
        // No axes at all, or Colour on its own: nothing costs extra.
        for (const entry of entries) plan.set(entry.variantId, 0)
        return plan
    }

    // A $250 accessory should not gain a $350 upgrade; a $4,000 workstation
    // should gain more than a $900 laptop. Bounded so it stays sane at both
    // ends.
    const base = Number(product.price) || 0
    const scale = Math.min(2, Math.max(0.2, base / 1200))

    const ranksByAxis = new Map(priced.map((axis) => [axis.name, rankAxis(axis)]))

    for (const entry of entries) {
        const options = entry.options instanceof Map
            ? Object.fromEntries(entry.options.entries())
            : (entry.options ?? {})

        let delta = 0
        for (const axis of priced) {
            const chosen = options[axis.name]
            if (chosen === undefined) continue
            const rank = ranksByAxis.get(axis.name).get(String(chosen)) ?? 0
            delta += rank * stepFor(axis.name) * scale
        }
        plan.set(entry.variantId, roundTo5(delta))
    }
    return plan
}

async function run() {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set')

    await mongoose.connect(uri)
    // Host and database only. The URI carries credentials.
    const { host, name } = mongoose.connection
    console.log(`\nTarget: ${host}/${name}`)
    console.log(APPLY ? 'Mode:   APPLY (writing)\n' : 'Mode:   DRY RUN — pass --apply to write\n')

    const products = await Product.find({})
    const snapshot = []
    let changedProducts = 0
    let changedRows = 0

    for (const product of products) {
        if (!product.inventoryV2 || product.inventoryV2.length === 0) continue

        const plan = planFor(product)
        const axisNames = (product.variants ?? []).map((variant) => variant.name)
        const rows = []
        let modified = false

        // Captured before anything is reassigned, so the file can undo this run.
        const before = {
            _id: String(product._id),
            name: product.name,
            inventoryV2: product.inventoryV2.map((entry) => ({
                variantId: entry.variantId,
                priceDelta: Number(entry.priceDelta) || 0,
                priceMinorDelta: Number(entry.priceMinorDelta) || 0,
            })),
        }

        for (const entry of product.inventoryV2) {
            const intended = plan.get(entry.variantId) ?? 0
            const intendedMinor = Math.round(intended * 100)
            const currentDelta = Number(entry.priceDelta) || 0

            if (currentDelta !== intended || Number(entry.priceMinorDelta) !== intendedMinor) {
                rows.push({ label: entry.legacyKey || entry.variantId || '(default)', from: currentDelta, to: intended })
                entry.priceDelta = intended
                entry.priceMinorDelta = intendedMinor
                modified = true
                changedRows += 1
            }
        }

        if (!modified) continue
        changedProducts += 1

        console.log(`${product.name}  ($${product.price})  [${axisNames.join(' × ') || 'no axes'}]`)
        for (const row of rows) console.log(`    ${row.label.padEnd(34)} ${row.from}  →  +${row.to}`)
        console.log('')

        if (APPLY) {
            snapshot.push(before)
            product.markModified('inventoryV2')
            await product.save()
        }
    }

    if (APPLY && snapshot.length > 0) {
        const file = `price-delta-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        writeFileSync(file, JSON.stringify(snapshot, null, 2))
        console.log(`Wrote pre-change snapshot to ${file}`)
    }

    console.log(`${APPLY ? 'Updated' : 'Would update'} ${changedRows} combination(s) across ${changedProducts} product(s).`)
    await mongoose.disconnect()
}

run().catch(async (error) => {
    console.error(`\nFailed: ${error?.name}: ${error?.message}\n`)
    await mongoose.disconnect().catch(() => { })
    process.exit(1)
})
