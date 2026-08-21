#!/usr/bin/env node
// Netronix demo seed (DB-010).
//
//   node scripts/seed.js --uri=mongodb://127.0.0.1:27017/netronix_dev
//   node scripts/seed.js --uri=... --reset --yes
//
// Safety, in order of application:
//   1. The target must be passed explicitly (--uri or SEED_MONGODB_URI).
//      MONGODB_URI is never consulted — see scripts/seedSafety.js.
//   2. The target must survive every guard in `assertSafeSeedTarget`:
//      loopback host, no SRV, no credentials, and a database name that
//      contains test / local / dev / demo.
//   3. Only the target host and database name are printed. Credentials never
//      reach stdout or an error message.
//   4. --reset deletes documents and therefore requires --yes or an
//      interactive confirmation typed as the database name.
//   5. Only the products, users, and orders collections are touched.
//
// Normal runs are idempotent: every document is written by `_id` with fixed
// content, so running the seed twice leaves the database in the same state.

import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import readline from 'readline'
import { pathToFileURL } from 'url'

import productModel from '../models/productModel.js'
import userModel from '../models/userModel.js'
import orderModel from '../models/orderModel.js'
import counterModel, { ORDER_NUMBER_SEQUENCE, setSequenceValue } from '../models/counterModel.js'
import { assertSafeSeedTarget, resolveSeedUri, UnsafeSeedTargetError } from './seedSafety.js'
import { DEFAULT_CURRENCY, toMinor } from '../lib/money.js'
import { canonicalVariantId, deriveInventoryV2, entriesOf, legacyVariantKey, variantLabel } from '../lib/variant.js'
import {
    products as productFixtures,
    users as userFixtures,
    orders as orderFixtures,
    DEMO_CUSTOMER_PASSWORD,
    DEMO_BCRYPT_SALT,
    DEMO_CUSTOMER_EMAIL,
    SHOWCASE_PRODUCT_IDS,
    EXPECTED_TAGS,
} from './seedData.js'

/** Collections the seed is permitted to write to. Nothing else is touched. */
const MANAGED_MODELS = [
    { label: 'products', model: productModel },
    { label: 'users', model: userModel },
    { label: 'orders', model: orderModel },
]

export function parseSeedArgs(argv = []) {
    return {
        reset: argv.includes('--reset'),
        yes: argv.includes('--yes'),
        allowCredentials: argv.includes('--allow-credentials'),
        quiet: argv.includes('--quiet'),
    }
}

/**
 * Fixtures with the Phase 2 representations derived from them (DB-003, DB-004,
 * DB-007, DB-009).
 *
 * Derived rather than written out by hand, for two reasons: the two
 * representations of price and of inventory cannot drift apart if only one of
 * them is authored, and the derivation is a pure function of fixed data, so the
 * result is still byte-identical on every run.
 */
export function buildProductDocuments() {
    return productFixtures.map((document) => {
        const at = new Date(document.date)
        return {
            ...document,
            priceMinor: toMinor(document.price),
            currency: DEFAULT_CURRENCY,
            inventoryV2: deriveInventoryV2(document.variants, document.inventory).entries,
            archived: false,
            // Set explicitly rather than left to Mongoose, so a second run
            // produces the same bytes (see `upsertAll`).
            createdAt: at,
            updatedAt: at,
        }
    })
}

export function buildUserDocuments() {
    return userFixtures.map((user) => ({
        ...user,
        password: bcrypt.hashSync(DEMO_CUSTOMER_PASSWORD, DEMO_BCRYPT_SALT),
    }))
}

/**
 * Order fixtures with a full line snapshot attached (DB-005, DB-004, DB-008).
 *
 * The fixtures declare what was bought; the snapshot is derived from the product
 * fixture that line points at, exactly as `orderService` derives it at purchase
 * time. Seeded history is therefore self-contained: editing a seeded product's
 * price afterwards does not rewrite a seeded order, which is the property
 * DB-005 exists to give.
 *
 * These are **not** flagged `_reconstructed`: they are not a reconstruction of
 * anything, they are fixtures whose price is fixed by the same file that fixes
 * the catalog's.
 */
export function buildOrderDocuments() {
    const catalog = new Map(buildProductDocuments().map((product) => [String(product._id), product]))

    return orderFixtures.map((order) => {
        const at = new Date(order.date)
        let subtotalMinor = 0

        const items = order.items.map((item) => {
            const product = catalog.get(String(item.productId))
            const legacyKey = String(item.size ?? '')
            const entry = entriesOf(product ?? {}).find((candidate) => candidate.legacyKey === legacyKey)
            const options = entry ? entry.options : {}
            const unitPriceMinor = product ? toMinor(product.price) : 0
            const lineTotalMinor = unitPriceMinor * item.quantity
            subtotalMinor += lineTotalMinor

            return {
                productId: item.productId,
                name: product?.name ?? 'Unavailable product',
                variantId: entry ? entry.variantId : canonicalVariantId(options),
                variantKey: legacyKey,
                size: legacyKey,
                variantOptions: options,
                variantLabel: entry ? variantLabel(product?.variants, options) : legacyKey,
                unitPriceMinor,
                unitPrice: unitPriceMinor / 100,
                quantity: item.quantity,
                lineTotalMinor,
                lineTotal: lineTotalMinor / 100,
                currency: DEFAULT_CURRENCY,
                image: Array.isArray(product?.image) ? (product.image[0] ?? '') : '',
                brand: product?.brand ?? '',
            }
        })

        const deliveryFeeMinor = toMinor(order.delivery_fee)

        return {
            ...order,
            items,
            subtotalMinor,
            deliveryFeeMinor,
            amountMinor: subtotalMinor + deliveryFeeMinor,
            currency: DEFAULT_CURRENCY,
            // One opening event, at the order's own fixed timestamp. A seeded
            // order has no change history to invent (DB-008).
            statusHistory: [{ status: order.status, at, by: 'seed' }],
            schemaVersion: 2,
            createdAt: at,
            updatedAt: at,
        }
    })
}

/** Write one document by `_id`, replacing whatever is there. */
async function upsertAll(model, documents) {
    let inserted = 0
    let replaced = 0
    for (const { _id, ...fields } of documents) {
        // `timestamps: false` because the fixtures set `createdAt`/`updatedAt`
        // themselves. Letting Mongoose stamp them would make every run differ,
        // which is exactly the idempotency the seed promises.
        const result = await model.replaceOne({ _id }, fields, { upsert: true, timestamps: false })
        if (result.upsertedCount > 0) inserted += 1
        else replaced += 1
    }
    return { inserted, replaced }
}

async function confirmReset(target, { input = process.stdin, output = process.stdout } = {}) {
    const rl = readline.createInterface({ input, output })
    const answer = await new Promise((resolve) => {
        // `close` fires on EOF. Without it a closed stdin would leave the
        // promise pending and the process would exit 0 having done nothing,
        // which reads like success.
        rl.on('close', () => resolve(''))
        rl.question(
            `\n⚠️  --reset will DELETE every product, user, and order in "${target.dbName}".\n` +
            `   Type the database name to continue: `,
            resolve,
        )
    })
    rl.close()
    return answer.trim() === target.dbName
}

/**
 * Seed a database that has already been judged safe and connected to.
 * Exposed separately so tests can drive it against an in-memory server.
 */
export async function seedInto({ reset = false, logger = console, quiet = false } = {}) {
    const log = (...args) => { if (!quiet) logger.log(...args) }

    if (reset) {
        for (const { label, model } of MANAGED_MODELS) {
            const { deletedCount } = await model.deleteMany({})
            log(`   reset: removed ${deletedCount} ${label}`)
        }
    }

    const productDocs = buildProductDocuments()
    const userDocs = buildUserDocuments()
    const orderDocs = buildOrderDocuments()

    const productResult = await upsertAll(productModel, productDocs)
    const userResult = await upsertAll(userModel, userDocs)
    const orderResult = await upsertAll(orderModel, orderDocs)
    const orderSequence = await advanceOrderSequence(orderDocs)

    return {
        products: { ...productResult, total: productDocs.length },
        users: { ...userResult, total: userDocs.length },
        orders: { ...orderResult, total: orderDocs.length },
        orderSequence,
    }
}

/**
 * Move the order-number allocator past the numbers the seed just used (DB-002).
 *
 * The seed writes fixed order numbers — 1001, 1002, … — because a demo order
 * has to be reproducible. The allocator is a counter document, and a freshly
 * migrated database has none, so the *first* order anyone placed was allocated
 * 1000 and then rejected by the unique index migration 003 builds: HTTP 409,
 * "That record already exists", on a brand new store with nothing wrong with it.
 *
 * Found by the browser end-to-end suite's guest checkout, and reachable by
 * anyone who follows the README: seed a database, then place an order.
 *
 * Only ever raised, never lowered. A database whose counter is already past the
 * seeded range has issued real orders, and winding it back would hand out
 * numbers that are already taken — the very thing this prevents.
 *
 * @returns {Promise<number|null>} the sequence value after seeding
 */
async function advanceOrderSequence(orderDocs) {
    const highest = orderDocs.reduce((max, doc) => Math.max(max, doc.orderNumber ?? 0), 0)
    if (highest === 0) return null

    const current = await counterModel.findById(ORDER_NUMBER_SEQUENCE).lean()
    if (current && Number.isFinite(current.seq) && current.seq >= highest) return current.seq

    await setSequenceValue(ORDER_NUMBER_SEQUENCE, highest)
    return highest
}

/** Facts worth printing after a seed, all read back from the database. */
export async function summariseSeed() {
    const [productCount, userCount, orderCount] = await Promise.all([
        productModel.countDocuments({}),
        userModel.countDocuments({}),
        orderModel.countDocuments({}),
    ])

    const stored = await productModel.find({}, { _id: 1, tags: 1, inventory: 1, price: 1 }).lean()
    const storedIds = new Set(stored.map((p) => String(p._id)))
    const missingShowcaseIds = SHOWCASE_PRODUCT_IDS.filter((id) => !storedIds.has(id))

    const tags = new Set()
    for (const p of stored) for (const tag of p.tags ?? []) tags.add(tag)
    const missingTags = EXPECTED_TAGS.filter((tag) => !tags.has(tag))

    let outOfStockCombinations = 0
    let singleUnitCombinations = 0
    for (const p of stored) {
        for (const quantity of Object.values(p.inventory ?? {})) {
            if (quantity === 0) outOfStockCombinations += 1
            if (quantity === 1) singleUnitCombinations += 1
        }
    }

    const statuses = await orderModel.distinct('status')
    const guestOrders = await orderModel.countDocuments({ isGuestOrder: true })

    return {
        productCount,
        userCount,
        orderCount,
        missingShowcaseIds,
        missingTags,
        tags: [...tags].sort(),
        outOfStockCombinations,
        singleUnitCombinations,
        statuses: statuses.sort(),
        guestOrders,
        authenticatedOrders: orderCount - guestOrders,
    }
}

function printSummary(summary, logger = console) {
    logger.log('\n── Seed summary ──────────────────────────────────────')
    logger.log(`   products                 ${summary.productCount}`)
    logger.log(`   users                    ${summary.userCount}`)
    logger.log(`   orders                   ${summary.orderCount}  (${summary.guestOrders} guest, ${summary.authenticatedOrders} authenticated)`)
    logger.log(`   order statuses           ${summary.statuses.join(', ')}`)
    logger.log(`   tags                     ${summary.tags.join(', ')}`)
    logger.log(`   zero-stock combinations  ${summary.outOfStockCombinations}`)
    logger.log(`   single-unit combinations ${summary.singleUnitCombinations}`)

    if (summary.missingShowcaseIds.length === 0) {
        logger.log(`   showcase products        all ${SHOWCASE_PRODUCT_IDS.length} present (FE-004: selected by data, not by id)`)
    } else {
        logger.warn(`   ⚠️  showcase products missing: ${summary.missingShowcaseIds.join(', ')}`)
    }
    if (summary.missingTags.length > 0) {
        logger.warn(`   ⚠️  category tags missing: ${summary.missingTags.join(', ')}`)
    }

    logger.log('\n   Demo customer')
    logger.log(`     email     ${DEMO_CUSTOMER_EMAIL}`)
    logger.log(`     password  ${DEMO_CUSTOMER_PASSWORD}`)
    logger.log('     This account exists only in seeded demo databases.')
    logger.log('\n   No admin user is created. Make one with `npm run create-admin`.')
    logger.log('   from the environment and never touches the users collection (SEC-001).')
    logger.log('──────────────────────────────────────────────────────\n')
}

export async function main({ argv = process.argv.slice(2), env = process.env, logger = console } = {}) {
    const options = parseSeedArgs(argv)

    const uri = resolveSeedUri({ argv, env })
    const target = assertSafeSeedTarget(uri, { allowCredentials: options.allowCredentials })

    logger.log('\n=== Netronix demo seed ===')
    logger.log(`   target: ${target.description}`)
    logger.log(`   mode:   ${options.reset ? 'reset (destructive)' : 'idempotent upsert'}`)

    if (options.reset && !options.yes) {
        if (!process.stdin.isTTY) {
            throw new UnsafeSeedTargetError(
                '--reset is destructive and stdin is not interactive, so it cannot be confirmed.',
                'Re-run with --yes to state the intent explicitly.',
            )
        }
        const confirmed = await confirmReset(target)
        if (!confirmed) {
            logger.error('\n❌ Confirmation did not match. Nothing was changed.\n')
            return { cancelled: true }
        }
    }

    await mongoose.connect(uri)
    try {
        const written = await seedInto({ reset: options.reset, logger, quiet: options.quiet })
        const summary = await summariseSeed()
        if (!options.quiet) printSummary(summary, logger)
        return { written, summary, target: target.description }
    } finally {
        await mongoose.disconnect()
    }
}

// Only run when invoked directly, so tests can import the helpers above.
const invokedDirectly =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
    main().then((result) => {
        // A cancelled reset must not look like a successful run.
        if (result?.cancelled) process.exit(1)
    }).catch((error) => {
        if (error instanceof UnsafeSeedTargetError) {
            console.error(`\n❌ ${error.message}\n`)
            process.exit(1)
        }
        console.error(`\n❌ Seed failed: ${error.message}\n`)
        process.exit(1)
    })
}
