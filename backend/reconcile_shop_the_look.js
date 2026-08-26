// Reconcile the four products depicted in the Professional Workspace image.
// Dry-run by default; --apply backs up, uploads 16 official images, writes, then rereads.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import dotenv from 'dotenv'


import Product from './models/productModel.js'
import { parseMongoUri } from './scripts/seedSafety.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const EXPECTED_DB_NAME = 'e-commerce'
const ATLAS_HOST = /\.mongodb\.(net|com)$/i
const SHOP_SLOT = 'shop-the-look'
const toMinor = (major) => Math.round(Number(major) * 100)

export const IDS = {
    macbook: '6a89ab116111a5cf6e199bf6',
    monitor: '6a89ab116111a5cf6e199bfd',
    headset: '6a89ab116111a5cf6e199bfe',
    keyboard: '6a89ab116111a5cf6e199bff',
}

export const DISPLACED_IDS = [
    '6a89ab116111a5cf6e199bf7', // LG monitor
    '6a89ab116111a5cf6e199bf8', // MSI laptop
    '6a89ab116111a5cf6e199bfc', // generic Sony headphones
    '6a89ab116111a5cf6e199bfa', // Razer mouse
]

export const IMAGE_SOURCES = {
    monitor: [
        'https://dlcdnwebimgs.asus.com/gain/4BE715FF-0D4F-456E-A9E7-ED41A168FAEB/w800/fwebp',
        'https://dlcdnwebimgs.asus.com/gain/301C982D-55EA-4B54-8408-36861BD1617E/w800/fwebp',
        'https://dlcdnwebimgs.asus.com/gain/A8E96D2B-9F2C-4156-B983-3FDA6D1ADDCA/w800/fwebp',
        'https://dlcdnwebimgs.asus.com/gain/0030C284-E0E6-403D-88C4-AEC49A444E99/w800/fwebp',
    ],
    keyboard: [
        'https://resource.logitech.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-mini/gallery/us/mx-keys-mini-top-graphite-us.png',
        'https://resource.logitech.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-mini/gallery/us/mx-keys-mini-front-graphite-us.png',
        'https://resource.logitech.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-mini/gallery/us/mx-keys-mini-3q-flat-graphite-us.png',
        'https://resource.logitech.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-mini/gallery/us/mx-keys-mini-3q-tilted-graphite-us.png',
    ],
    headset: [
        'https://resource.logitechg.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/gaming/en/products/pro-wireless/pro-wireless-headset-gallery-1.png',
        'https://resource.logitechg.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/gaming/en/products/pro-wireless/pro-wireless-headset-gallery-2.png',
        'https://resource.logitechg.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/gaming/en/products/pro-wireless/pro-wireless-headset-gallery-3.png',
        'https://resource.logitechg.com/w_800,h_800,ar_1,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/gaming/en/products/pro-wireless/pro-wireless-headset-gallery-4.png',
    ],
    macbook: [
        'https://www.apple.com/newsroom/images/2024/10/new-macbook-pro/article/Apple-MacBook-Pro-M4-hero_big.jpg.large.jpg',
        'https://www.apple.com/newsroom/images/2024/10/new-macbook-pro/article/Apple-MacBook-Pro-M4-lineup_big.jpg.large.jpg',
        'https://www.apple.com/newsroom/images/2024/10/new-macbook-pro/article/Apple-MacBook-Pro-M4-lifestyle-01_big.jpg.large.jpg',
        'https://www.apple.com/newsroom/images/2024/10/new-macbook-pro/article/Apple-MacBook-Pro-M4-connectivity_big.jpg.large.jpg',
    ],
}

const row = (options, quantity, sku, priceDelta = 0) => ({
    options,
    quantity,
    sku,
    priceDelta,
    priceMinorDelta: toMinor(priceDelta),
})

export const PRODUCT_PLAN = {
    monitor: {
        _id: IDS.monitor,
        name: 'ASUS ROG Strix XG27AQ Gaming Monitor',
        description: 'ASUS ROG Strix XG27AQ 27-inch Fast IPS gaming monitor with 2560×1440 resolution, up to 170Hz refresh rate, 1ms response time, G-SYNC compatibility, DisplayHDR 400, DisplayPort and HDMI connectivity.',
        price: 499.99,
        currency: 'USD',
        brand: 'ASUS ROG',
        variants: [],
        inventoryV2: [row({}, 12, 'XG27AQ')],
        bestSeller: true,
        tags: ['Gaming', 'Accessories', 'Monitors'],
        showcase: [{ slot: 'featured', order: 16 }, { slot: SHOP_SLOT, order: 0 }],
    },
    macbook: {
        _id: IDS.macbook,
        name: 'Apple MacBook Pro 14-inch (M4)',
        description: 'Apple 14-inch MacBook Pro with the M4 chip, 16GB unified memory, Liquid Retina XDR display, 12MP Center Stage camera, three Thunderbolt 4 ports, HDMI, SDXC and MagSafe 3.',
        price: 1599,
        currency: 'USD',
        brand: 'Apple',
        variants: [{ name: 'Storage', options: ['512GB', '1TB', '2TB'] }],
        inventoryV2: [
            row({ Storage: '512GB' }, 6, 'MW2U3LL/A', 0),
            row({ Storage: '1TB' }, 4, 'MW2V3LL/A', 200),
            row({ Storage: '2TB' }, 1, 'MBP14-M4-16-2TB', 600),
        ],
        bestSeller: true,
        tags: ['Laptops', 'MacBooks'],
        showcase: [{ slot: 'featured', order: 9 }, { slot: SHOP_SLOT, order: 1 }],
    },
    headset: {
        _id: IDS.headset,
        name: 'Logitech G PRO X Wireless Gaming Headset',
        description: 'Logitech G PRO X Wireless LIGHTSPEED gaming headset with 50mm PRO-G drivers, Blue VO!CE microphone technology, DTS Headphone:X 2.0 surround sound and up to 20 hours of battery life.',
        price: 179.99,
        currency: 'USD',
        brand: 'Logitech G',
        variants: [],
        inventoryV2: [row({}, 11, '981-000906')],
        bestSeller: true,
        tags: ['Headphones', 'Gaming', 'Accessories'],
        showcase: [{ slot: 'featured', order: 17 }, { slot: SHOP_SLOT, order: 2 }],
    },
    keyboard: {
        _id: IDS.keyboard,
        name: 'Logitech MX Keys Mini Wireless Keyboard',
        description: 'Logitech MX Keys Mini compact wireless illuminated keyboard with smart backlighting, Perfect Stroke low-profile keys, Easy-Switch for up to three devices, Bluetooth Low Energy and USB-C charging.',
        price: 99.99,
        currency: 'USD',
        brand: 'Logitech',
        variants: [{ name: 'Color', options: ['Graphite', 'Pale Gray', 'Rose', 'Black'] }],
        inventoryV2: [
            row({ Color: 'Graphite' }, 14, '920-010388'),
            row({ Color: 'Pale Gray' }, 8, '920-010473'),
            row({ Color: 'Rose' }, 6, '920-010474'),
            row({ Color: 'Black' }, 5, '920-010475'),
        ],
        bestSeller: true,
        tags: ['Accessories', 'Keyboards'],
        showcase: [{ slot: 'featured', order: 18 }, { slot: SHOP_SLOT, order: 3 }],
    },
}

export function assertTarget(uri) {
    const parsed = parseMongoUri(uri)
    const atlas = parsed.hosts.length > 0 && parsed.hosts.every(({ host }) => ATLAS_HOST.test(host))
    if (!atlas || parsed.dbName !== EXPECTED_DB_NAME) {
        throw new Error(`Refusing catalog write: expected MongoDB Atlas database "${EXPECTED_DB_NAME}".`)
    }
    return parsed
}

export function withoutShopSlot(showcase = []) {
    return showcase.filter(({ slot }) => slot !== SHOP_SLOT)
}

export function validatePlan(plan = PRODUCT_PLAN) {
    const products = Object.values(plan)
    if (products.length !== 4) throw new Error('The workspace plan must contain exactly four products.')
    const orders = products.map((product) => product.showcase.find(({ slot }) => slot === SHOP_SLOT)?.order)
    if (new Set(orders).size !== 4 || orders.some((order) => ![0, 1, 2, 3].includes(order))) {
        throw new Error('Workspace showcase orders must be exactly 0, 1, 2 and 3.')
    }
    for (const [key, product] of Object.entries(plan)) {
        if (IMAGE_SOURCES[key]?.length !== 4) throw new Error(`${key} must have exactly four source images.`)
        if (toMinor(product.price) < 1) throw new Error(`${key} has an invalid price.`)
        const expectedRows = product.variants.reduce((count, axis) => count * axis.options.length, 1)
        if (product.inventoryV2.length !== expectedRows) throw new Error(`${key} has an incomplete inventory matrix.`)
    }
    return true
}

const serialise = (doc) => doc ? doc.toObject({ flattenMaps: true }) : null

async function verifyImages(key) {
    const verified = []
    for (const [index, source] of IMAGE_SOURCES[key].entries()) {
        const response = await fetch(source, { signal: AbortSignal.timeout(60_000) })
        const type = response.headers.get('content-type') ?? ''
        const bytes = Number(response.headers.get('content-length') ?? 0)
        if (!response.ok || !type.startsWith('image/')) {
            throw new Error(`${key} image ${index + 1} is unavailable (${response.status}, ${type || 'no content type'}).`)
        }
        // Consume the body: a 200 response with a truncated body is not a usable
        // gallery image. The source files are deliberately bounded product art.
        const body = await response.arrayBuffer()
        if (body.byteLength < 10_000) throw new Error(`${key} image ${index + 1} is suspiciously small.`)
        verified.push(source)
        console.log(`  ${key} image ${index + 1}: ${type}, ${body.byteLength || bytes} bytes`)
    }
    return verified
}

async function run() {
    validatePlan()
    const apply = process.argv.includes('--apply')
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set.')
    const target = assertTarget(uri)
    await mongoose.connect(uri)
    console.log(`Target: MongoDB Atlas database "${target.dbName}"`)
    console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN')

    const touchedIds = [...Object.values(IDS), ...DISPLACED_IDS]
    const before = await Product.find({ _id: { $in: touchedIds } })
    const current = new Map(before.map((doc) => [String(doc._id), doc]))

    console.log('\nPlanned workspace order')
    for (const [key, product] of Object.entries(PRODUCT_PLAN)) {
        const exists = current.has(product._id)
        console.log(`  ${product.showcase.find(({ slot }) => slot === SHOP_SLOT).order}: ${product.name} — $${product.price.toFixed(2)} — ${exists ? 'update' : 'create'} — 4 images`)
    }
    console.log(`  Remove obsolete workspace assignment from ${DISPLACED_IDS.length} record(s).`)

    if (!apply) {
        console.log('\nNothing was written.')
        await mongoose.disconnect()
        return
    }

    const backupDir = resolve(__dirname, '../../../evidence/catalog-backups')
    mkdirSync(backupDir, { recursive: true })
    const backup = resolve(backupDir, `shop-the-look-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(backup, JSON.stringify({ touchedIds, documents: before.map(serialise) }, null, 2))
    console.log(`\nBackup written before first mutation: ${backup}`)

    console.log('\nVerifying official product images')
    const images = {}
    for (const key of Object.keys(PRODUCT_PLAN)) images[key] = await verifyImages(key)

    for (const id of DISPLACED_IDS) {
        const doc = current.get(id)
        if (!doc) continue
        doc.showcase = withoutShopSlot(doc.showcase)
        await doc.save()
    }

    for (const [key, plan] of Object.entries(PRODUCT_PLAN)) {
        const doc = current.get(plan._id) ?? new Product({ _id: plan._id, date: Date.now() })
        for (const [field, value] of Object.entries(plan)) {
            if (field !== '_id') doc.set(field, value)
        }
        doc.image = images[key]
        doc.priceMinor = toMinor(plan.price)
        doc.currency = 'USD'
        doc.archived = false
        doc.markModified('inventoryV2')
        await doc.save()
    }

    console.log('\nFresh database verification')
    const fresh = await Product.find({ 'showcase.slot': SHOP_SLOT }).sort({ 'showcase.order': 1 }).lean({ flattenMaps: true })
    if (fresh.length !== 4) throw new Error(`Expected four workspace products, found ${fresh.length}.`)
    for (const [order, product] of fresh.entries()) {
        const assignment = product.showcase.find(({ slot }) => slot === SHOP_SLOT)
        if (assignment.order !== order) throw new Error(`${product.name} is in workspace order ${assignment.order}, expected ${order}.`)
        if (product.image.length !== 4) throw new Error(`${product.name} has ${product.image.length} images.`)
        if (product.inventoryV2.length < 1) throw new Error(`${product.name} has no purchasable inventory.`)
        console.log(`  OK ${order}: ${product.name} — $${product.price.toFixed(2)} — ${product.image.length} images — ${product.inventoryV2.length} combination(s)`)
    }

    await mongoose.disconnect()
    console.log('\nWorkspace catalog reconciliation complete.')
}

if (process.argv[1]?.endsWith('reconcile_shop_the_look.js')) {
    run().catch(async (error) => {
        console.error(`Failed: ${error.message}`)
        await mongoose.disconnect().catch(() => {})
        process.exit(1)
    })
}
