// Reconcile every active non-cosmetic single-axis product to reviewed USD prices.
//
//   node reconcile_variant_prices.js            # dry run
//   node reconcile_variant_prices.js --apply    # backup, write, reread, verify
//
// The plan is deliberately explicit. It does not infer prices from option order.
// Colour/finish products are outside this plan because cosmetic options normally
// share a price. AirPods connector variants are included at the same $249 MSRP:
// a non-cosmetic option is audited, not automatically made more expensive.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import dotenv from 'dotenv'

import Product from './models/productModel.js'
import { parseMongoUri } from './scripts/seedSafety.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

export const EXPECTED_DB_NAME = 'e-commerce'
const ATLAS_HOST = /\.mongodb\.(net|com)$/i
const toMinor = (major) => Math.round(Number(major) * 100)
const money = (major) => `$${Number(major).toFixed(2)}`
const optionsOf = (entry) => entry.options instanceof Map
    ? Object.fromEntries(entry.options.entries())
    : (entry.options ?? {})

export const PLAN = [
    {
        _id: '6a89ab116111a5cf6e199bef', name: 'Apple AirPods Pro', axis: 'Generation', basePrice: 249,
        finals: { '2nd Gen (USB-C)': 249, '2nd Gen (Lightning)': 249 },
        basis: 'Both second-generation charging-case versions launched at $249 MSRP.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf5', name: 'Apple MacBook M3', axis: 'Storage', basePrice: 1099,
        finals: { '256GB': 1099, '512GB': 1299 },
        basis: '13-inch M3 MacBook Air launch configurations: $1,099 / $1,299.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf6', name: 'Apple MacBook Pro 14-inch (M4)', axis: 'Storage', basePrice: 1599,
        finals: { '512GB': 1599, '1TB': 1799, '2TB': 2199 },
        basis: '14-inch base-M4 MacBook Pro configuration pricing.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf1', name: 'Apple iPhone Charger', axis: 'Type', basePrice: 19,
        finals: { '20W USB-C': 19, '35W Dual USB-C': 59 },
        basis: 'Current Apple US list prices for the two adapters.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf0', name: 'Asus TUF Gaming Laptop', axis: 'Storage', basePrice: 999,
        finals: { '512GB SSD': 999, '1TB SSD': 1099 },
        basis: 'Reviewed catalog configuration pricing; generic record has no exact SKU.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf7', name: 'LG UltraGear Gaming Monitor', axis: 'Size', basePrice: 349.99,
        finals: { '27-inch': 349.99, '32-inch': 399.99 },
        basis: '27GL83A-B $349.99 reference and equivalent 32-inch QHD UltraGear $399.99 list tier.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf3', name: 'Lenovo ThinkPad Laptop', axis: 'RAM', basePrice: 1299,
        finals: { '16GB': 1299, '32GB': 1449 },
        basis: 'Reviewed catalog configuration pricing; generic record has no exact SKU.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf8', name: 'MSI Cyborg Gaming Laptop', axis: 'GPU', basePrice: 999,
        finals: { 'RTX 4050': 999, 'RTX 4060': 1199 },
        basis: 'Reviewed same-family 4050/4060 configuration tier; generic record has no exact SKU.',
    },
    {
        _id: '6a89ab116111a5cf6e199bf9', name: 'PlayStation 5 (PS5) Slim Console', axis: 'Edition', basePrice: 449.99,
        finals: { 'Digital': 449.99, 'Standard (Disc)': 499.99 },
        basis: 'PS5 Slim US list prices.',
    },
    {
        _id: '6a89ab116111a5cf6e199bfa', name: 'Razer Cobra Gaming Mouse', axis: 'Edition', basePrice: 39.99,
        finals: { 'Standard': 39.99, 'Pro (Wireless)': 129.99 },
        basis: 'Razer launch MSRPs: Cobra $39.99 and Cobra Pro $129.99.',
    },
]

export function assertCatalogTarget(uri) {
    const parsed = parseMongoUri(uri)
    const atlas = parsed.hosts.length > 0 && parsed.hosts.every(({ host }) => ATLAS_HOST.test(host))
    if (!atlas || parsed.dbName !== EXPECTED_DB_NAME) {
        throw new Error(`Refusing catalog write: expected MongoDB Atlas database "${EXPECTED_DB_NAME}".`)
    }
    return { dbName: parsed.dbName }
}

export function diffFor(product, intent) {
    if (String(product._id) !== intent._id || product.name !== intent.name) {
        throw new Error(`${intent._id}: expected "${intent.name}", found "${product.name}".`)
    }
    const axis = (product.variants ?? []).find((candidate) => candidate.name === intent.axis)
    if (!axis) throw new Error(`${intent.name}: missing axis "${intent.axis}".`)
    const declared = axis.options.map(String)
    const planned = Object.keys(intent.finals)
    if (declared.length !== planned.length
        || declared.some((option) => !planned.includes(option))
        || planned.some((option) => !declared.includes(option))) {
        throw new Error(`${intent.name}: declared options no longer match the reviewed plan.`)
    }
    const rows = (product.inventoryV2 ?? []).map((entry) => {
        const option = optionsOf(entry)[intent.axis]
        if (!(option in intent.finals)) throw new Error(`${intent.name}: unplanned row ${entry.variantId}.`)
        const finalPrice = intent.finals[option]
        const delta = Number((finalPrice - intent.basePrice).toFixed(2))
        return {
            entry, option, finalPrice, delta,
            changed: Number(entry.priceDelta) !== delta || Number(entry.priceMinorDelta) !== toMinor(delta),
        }
    })
    if (rows.length !== planned.length) throw new Error(`${intent.name}: expected ${planned.length} inventory rows, found ${rows.length}.`)
    const baseChanged = Number(product.price) !== intent.basePrice || Number(product.priceMinor) !== toMinor(intent.basePrice)
    return { rows, baseChanged, changed: baseChanged || rows.some((row) => row.changed) }
}

const snapshotOf = (product) => ({
    _id: String(product._id), name: product.name, price: product.price, priceMinor: product.priceMinor,
    inventoryV2: (product.inventoryV2 ?? []).map((entry) => ({
        variantId: entry.variantId, options: optionsOf(entry), quantity: entry.quantity, sku: entry.sku,
        priceDelta: entry.priceDelta, priceMinorDelta: entry.priceMinorDelta,
    })),
})

async function run() {
    const apply = process.argv.includes('--apply')
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set')
    const { dbName } = assertCatalogTarget(uri)
    await mongoose.connect(uri)
    console.log(`Target: MongoDB Atlas database "${dbName}"`)
    console.log(apply ? 'Mode: APPLY\n' : 'Mode: DRY RUN\n')

    const pending = []
    for (const intent of PLAN) {
        const product = await Product.findById(intent._id)
        if (!product) throw new Error(`Missing ${intent.name} (${intent._id}).`)
        const diff = diffFor(product, intent)
        console.log(`${intent.name} [${intent.axis}]`)
        for (const row of diff.rows) {
            const current = Number(product.price) + Number(row.entry.priceDelta || 0)
            console.log(`  ${row.option.padEnd(24)} ${money(current)} → ${money(row.finalPrice)}${row.changed ? ' *' : ''}`)
        }
        if (diff.changed) pending.push({ intent, product, diff })
    }

    if (!apply) {
        console.log(`\nWould update ${pending.length} product(s). Nothing was written.`)
        await mongoose.disconnect()
        return
    }

    if (pending.length > 0) {
        const backupDir = resolve(__dirname, '../../../evidence/catalog-backups')
        mkdirSync(backupDir, { recursive: true })
        const backup = resolve(backupDir, `variant-prices-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
        writeFileSync(backup, JSON.stringify(pending.map(({ product }) => snapshotOf(product)), null, 2))
        console.log(`\nBackup written before mutation: ${backup}`)

        for (const { intent, product, diff } of pending) {
            product.price = intent.basePrice
            product.priceMinor = toMinor(intent.basePrice)
            for (const row of diff.rows) {
                row.entry.priceDelta = row.delta
                row.entry.priceMinorDelta = toMinor(row.delta)
            }
            product.markModified('inventoryV2')
            await product.save()
        }
    }

    console.log('\nFresh database verification')
    let failures = 0
    for (const intent of PLAN) {
        const fresh = await Product.findById(intent._id)
        const diff = diffFor(fresh, intent)
        if (diff.changed) {
            failures += 1
            console.log(`  FAIL ${intent.name}`)
        } else {
            const finals = diff.rows.map((row) => `${row.option} ${money(row.finalPrice)} (qty ${row.entry.quantity})`).join(', ')
            console.log(`  OK   ${intent.name}: ${finals}`)
        }
    }
    await mongoose.disconnect()
    if (failures) throw new Error(`${failures} product(s) failed verification.`)
    console.log(`\nVerified ${PLAN.length} reviewed non-cosmetic products; updated ${pending.length}.`)
}

if (process.argv[1] && process.argv[1].endsWith('reconcile_variant_prices.js')) {
    run().catch(async (error) => {
        console.error(`Failed: ${error.message}`)
        await mongoose.disconnect().catch(() => {})
        process.exit(1)
    })
}
