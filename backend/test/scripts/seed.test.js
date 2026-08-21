// Seed behaviour (DB-010), driven against an in-memory MongoDB replica set.
// No external database is contacted.

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api } from '../helpers/api.js'
import { UnsafeSeedTargetError } from '../../scripts/seedSafety.js'
import productModel from '../../models/productModel.js'
import userModel from '../../models/userModel.js'
import orderModel from '../../models/orderModel.js'
import { seedInto, summariseSeed, buildProductDocuments, main as runSeedCli } from '../../scripts/seed.js'
import {
    products as productFixtures,
    SHOWCASE_PRODUCT_IDS,
    SHOWCASE_BY_SLOT,
    EXPECTED_TAGS,
    DEMO_CUSTOMER_EMAIL,
    DEMO_CUSTOMER_PASSWORD,
    VARIANT_LESS_KEY,
} from '../../scripts/seedData.js'
import { SHOWCASE_SLOTS, selectShowcase } from '../../lib/showcase.js'
import { ORDER_NUMBER_SEQUENCE, nextSequenceValue, setSequenceValue } from '../../models/counterModel.js'

useTestDatabase()

const rawDocuments = async (collection) =>
    mongoose.connection.db.collection(collection).find({}).sort({ _id: 1 }).toArray()

describe('seed: catalog shape', () => {
    beforeEach(async () => {
        await seedInto({ quiet: true })
    })

    it('writes 15 to 20 products', async () => {
        const count = await productModel.countDocuments({})
        expect(count).toBeGreaterThanOrEqual(15)
        expect(count).toBeLessThanOrEqual(20)
        expect(count).toBe(productFixtures.length)
    })

    it('gives every product a name, description, brand, price, image and at least one tag', async () => {
        const products = await productModel.find({}).lean()
        for (const product of products) {
            expect(product.name, `${product._id} name`).toBeTruthy()
            expect(product.description.length, `${product._id} description`).toBeGreaterThan(40)
            expect(product.brand, `${product._id} brand`).toBeTruthy()
            expect(product.price, `${product._id} price`).toBeGreaterThan(0)
            expect(product.image.length, `${product._id} images`).toBeGreaterThan(0)
            expect(product.tags.length, `${product._id} tags`).toBeGreaterThan(0)
        }
    })

    it('covers the full category taxonomy the storefront slider expects', async () => {
        const { missingTags } = await summariseSeed()
        expect(missingTags).toEqual([])
    })

    it('includes variant-less, single-axis and multi-axis products', async () => {
        const products = await productModel.find({}).lean()
        const axes = products.map((p) => p.variants.length)
        expect(axes).toContain(0) // variant-less
        expect(axes).toContain(1) // single axis
        expect(axes).toContain(2) // multi axis
    })

    it('stores variant-less stock under the key the storefront actually generates', async () => {
        // Product.jsx:83-90 joins the selected options with "-", which is the
        // empty string when a product has no variants. Seeding under any other
        // key ("default", say) would make those products unbuyable.
        const variantLess = await productModel.find({ variants: { $size: 0 } }).lean()
        expect(variantLess.length).toBeGreaterThan(0)
        for (const product of variantLess) {
            expect(Object.keys(product.inventory), product.name).toEqual([VARIANT_LESS_KEY])
        }
    })

    it('includes zero-stock, single-unit and normally stocked combinations', async () => {
        const { outOfStockCombinations, singleUnitCombinations } = await summariseSeed()
        expect(outOfStockCombinations).toBeGreaterThan(0)
        expect(singleUnitCombinations).toBeGreaterThan(0)

        const products = await productModel.find({}).lean()
        const quantities = products.flatMap((p) => Object.values(p.inventory))
        expect(quantities.some((q) => q > 1)).toBe(true)
    })

    it('includes hyphenated option values so DB-003 is reachable from seeded data', async () => {
        const products = await productModel.find({}).lean()
        const optionValues = products.flatMap((p) => p.variants.flatMap((v) => v.options))
        expect(optionValues).toContain('16-inch')
        expect(optionValues).toContain('RTX-4090')

        // And the resulting inventory keys are genuinely ambiguous: splitting
        // "16-inch-1TB" on "-" cannot recover ["16-inch", "1TB"].
        const macbook = products.find((p) => p._id.toString() === '680897a3a9a5ffb06b2e52c8')
        expect(Object.keys(macbook.inventory)).toContain('16-inch-1TB')
        expect('16-inch-1TB'.split('-')).toHaveLength(3)
    })

    it('includes a product priced above $1,000 (FE-003 needs one to be visible)', async () => {
        expect(await productModel.countDocuments({ price: { $gt: 1000 } })).toBeGreaterThan(0)
    })

    it('persists the showcase metadata the homepage selects on (FE-004)', async () => {
        // Phase 0 deliberately stripped this field, because `productModel` had
        // no such path and Mongoose would have dropped it silently. Phase 3
        // adds the path, so the assignment is now the mechanism rather than a
        // note about a future one.
        expect(productFixtures.some((p) => p.showcase.length > 0)).toBe(true)
        expect(buildProductDocuments().some((d) => d.showcase.length > 0)).toBe(true)

        const macbook = (await rawDocuments('products'))
            .find((d) => String(d._id) === '680897a3a9a5ffb06b2e52c8')
        expect(macbook.showcase).toEqual([
            { slot: 'featured', order: 0 },
            { slot: 'shop-the-look', order: 1 },
        ])
    })

    it('leaves a product that belongs to no surface with an empty showcase', async () => {
        const document = (await rawDocuments('products'))
            .find((d) => String(d._id) === '65f3c0d2e5c25ad8e9a3ca01')
        expect(document.showcase).toEqual([])
    })
})

describe('seed: data-driven homepage selection (FE-004 / PORT-001)', () => {
    beforeEach(async () => {
        await seedInto({ quiet: true })
    })

    it('seeds every product it assigns to a homepage surface', async () => {
        const { missingShowcaseIds } = await summariseSeed()
        expect(missingShowcaseIds).toEqual([])
        expect(SHOWCASE_PRODUCT_IDS).toHaveLength(14)
    })

    it('fills every showcase slot, so no homepage section renders empty', async () => {
        const stored = await productModel.find({}).lean()

        for (const name of SHOWCASE_SLOTS) {
            const selected = selectShowcase(stored, name)
            expect(selected.length, `slot "${name}" has no products`).toBeGreaterThan(0)
        }
    })

    it('selects each slot in the declared order, deterministically', async () => {
        const stored = await productModel.find({}).lean()

        for (const [name, expected] of Object.entries(SHOWCASE_BY_SLOT)) {
            expect(selectShowcase(stored, name).map((p) => String(p._id)), name).toEqual(expected)
        }

        // The tabbed grid derives its three tabs from tags within the featured
        // set, so each tab needs products (FeaturedProducts.jsx).
        const featured = selectShowcase(stored, 'featured')
        for (const tag of ['Laptops', 'Gaming PCs', 'MacBooks']) {
            expect(featured.some((p) => p.tags.includes(tag)), `no featured product tagged ${tag}`).toBe(true)
        }
    })

    it('names no product by literal id in any storefront component', async () => {
        // The coupling this file used to assert — "the seed must adopt the ids
        // the components hardcode" — is gone. This is the assertion that
        // replaces it, and it lives here too because the seed is what made the
        // shim work: if a literal ever comes back, both halves fail.
        const { readFileSync, readdirSync, statSync } = await import('node:fs')
        const { join, resolve } = await import('node:path')

        const root = resolve(process.cwd(), '..', 'frontend', 'src')

        // Comments are stripped first. `lib/showcase.js` documents the removed
        // defect by quoting the literals it removed, which is prose about the
        // finding and not an instance of it.
        const withoutComments = (text) =>
            text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                if (entry === 'test' || entry === 'assets') continue
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) { walk(full); continue }
                if (!/\.jsx?$/.test(entry)) continue
                if (/['"][0-9a-f]{24}['"]/.test(withoutComments(readFileSync(full, 'utf8')))) offenders.push(full)
            }
        }
        walk(root)
        expect(offenders).toEqual([])
    })
})

describe('seed: users', () => {
    beforeEach(async () => {
        await seedInto({ quiet: true })
    })

    it('creates exactly one demo customer whose password verifies', async () => {
        const users = await userModel.find({}).lean()
        expect(users).toHaveLength(1)
        expect(users[0].email).toBe(DEMO_CUSTOMER_EMAIL)
        expect(await bcrypt.compare(DEMO_CUSTOMER_PASSWORD, users[0].password)).toBe(true)
    })

    it('gives the demo customer a populated cart and wishlist', async () => {
        const user = await userModel.findOne({ email: DEMO_CUSTOMER_EMAIL }).lean()
        expect(Object.keys(user.cartData).length).toBeGreaterThan(0)
        expect(user.wishlist.length).toBeGreaterThan(0)
    })

    it('creates no admin user — admin auth never reads the users collection (SEC-001)', async () => {
        const users = await userModel.find({}).lean()
        expect(users).toHaveLength(1)
        expect(users[0].email).not.toBe(process.env.ADMIN_EMAIL)
    })
})

describe('seed: orders', () => {
    beforeEach(async () => {
        await seedInto({ quiet: true })
    })

    it('covers every status the admin UI can set', async () => {
        const { statuses } = await summariseSeed()
        expect(statuses).toEqual(['Delivered', 'Order Placed', 'Out for Delivery', 'Packing', 'Shipped'].sort())
    })

    it('includes both guest and authenticated orders', async () => {
        const { guestOrders, authenticatedOrders } = await summariseSeed()
        expect(guestOrders).toBeGreaterThan(0)
        expect(authenticatedOrders).toBeGreaterThan(0)
    })

    it('gives every order a distinct order number', async () => {
        const numbers = (await orderModel.find({}).lean()).map((o) => o.orderNumber)
        expect(new Set(numbers).size).toBe(numbers.length)
    })

    it('uses the item shape the checkout actually writes — a full snapshot', async () => {
        // FLIPPED IN PHASE 2, tasks 2.2/2.6/2.9. Was `{ productId, size,
        // quantity }` with no price or name (DB-005). A seeded line now carries
        // what was bought, at what price, in both money representations and
        // with the variant identity in both forms, exactly as `orderService`
        // writes it — so editing a seeded product afterwards cannot rewrite
        // seeded history.
        const products = new Map(
            (await productModel.find({}).lean()).map((product) => [String(product._id), product]),
        )

        for (const order of await orderModel.find({}).lean()) {
            for (const item of order.items) {
                expect(Object.keys(item).sort()).toEqual([
                    'brand', 'currency', 'image', 'lineTotal', 'lineTotalMinor', 'name',
                    'productId', 'quantity', 'size', 'unitPrice', 'unitPriceMinor',
                    'variantId', 'variantKey', 'variantLabel', 'variantOptions',
                ])

                const product = products.get(String(item.productId))
                expect(item.name).toBe(product.name)
                expect(item.unitPriceMinor).toBe(Math.round(product.price * 100))
                expect(item.lineTotalMinor).toBe(item.unitPriceMinor * item.quantity)
                // `size` is still written under its pre-Phase-2 name (ARCH-003).
                expect(item.size).toBe(item.variantKey)
                // Fixtures are not a reconstruction of anything.
                expect(item._reconstructed).toBeUndefined()
            }
        }
    })

    it('seeds every order total in integer minor units as well (DB-004)', async () => {
        for (const order of await orderModel.find({}).lean()) {
            expect(order.currency).toBe('USD')
            expect(order.subtotalMinor).toBe(Math.round(order.subtotal * 100))
            expect(order.deliveryFeeMinor).toBe(Math.round(order.delivery_fee * 100))
            expect(order.amountMinor).toBe(order.subtotalMinor + order.deliveryFeeMinor)
            // The lines add up to the subtotal exactly, with no float drift.
            const lines = order.items.reduce((total, item) => total + item.lineTotalMinor, 0)
            expect(lines).toBe(order.subtotalMinor)
        }
    })

    it('seeds the typed variant inventory alongside the legacy bag (DB-003)', async () => {
        for (const product of await productModel.find({}).lean()) {
            expect(Array.isArray(product.inventoryV2)).toBe(true)
            expect(product.priceMinor).toBe(Math.round(product.price * 100))
            expect(product.currency).toBe('USD')
            expect(product.archived).toBe(false)

            // Every V2 entry has a distinct canonical identity, and each agrees
            // with the legacy bag it was derived from.
            const ids = product.inventoryV2.map((entry) => entry.variantId)
            expect(new Set(ids).size).toBe(ids.length)
            for (const entry of product.inventoryV2) {
                if (entry.needsReview) continue
                expect(product.inventory[entry.legacyKey]).toBe(entry.quantity)
            }
        }
    })

    it('resolves the hyphenated seeded options in both directions (DB-003)', async () => {
        // The two the audit names by name. Both are real seeded catalog values,
        // and both are ordered by a seeded order.
        const hyphenated = ['16-inch-1TB', 'Gateron-Red-ANSI']
        for (const legacyKey of hyphenated) {
            const order = await orderModel.findOne({ 'items.size': legacyKey }).lean()
            expect(order, `no seeded order uses "${legacyKey}"`).toBeTruthy()

            const line = order.items.find((item) => item.size === legacyKey)
            const product = await productModel.findById(line.productId).lean()
            const entry = product.inventoryV2.find((candidate) => candidate.variantId === line.variantId)

            // forward: options → the same legacy key the checkout posted
            expect(entry.legacyKey).toBe(legacyKey)
            // backward: the stored identity recovers the option values, which a
            // `split('-')` of the legacy key cannot do
            expect(Object.keys(line.variantOptions).length).toBe(product.variants.length)
            expect(Object.values(line.variantOptions).join('-')).toBe(legacyKey)
        }
    })

    it('references only products that exist', async () => {
        const ids = new Set((await productModel.find({}, { _id: 1 }).lean()).map((p) => String(p._id)))
        for (const order of await orderModel.find({}).lean()) {
            for (const item of order.items) {
                expect(ids.has(String(item.productId)), `order ${order.orderNumber} → ${item.productId}`).toBe(true)
            }
        }
    })
})

describe('seed: determinism and idempotency', () => {
    it('produces byte-identical documents on a second run', async () => {
        await seedInto({ quiet: true })
        const first = {
            products: await rawDocuments('products'),
            users: await rawDocuments('users'),
            orders: await rawDocuments('orders'),
        }

        await seedInto({ quiet: true })
        const second = {
            products: await rawDocuments('products'),
            users: await rawDocuments('users'),
            orders: await rawDocuments('orders'),
        }

        expect(second).toEqual(first)
    })

    it('does not accumulate documents across runs', async () => {
        await seedInto({ quiet: true })
        const after1 = await summariseSeed()
        await seedInto({ quiet: true })
        await seedInto({ quiet: true })
        const after3 = await summariseSeed()

        expect(after3.productCount).toBe(after1.productCount)
        expect(after3.userCount).toBe(after1.userCount)
        expect(after3.orderCount).toBe(after1.orderCount)
    })

    it('reports every document as an insert first and a replace afterwards', async () => {
        const first = await seedInto({ quiet: true })
        expect(first.products.inserted).toBe(first.products.total)
        expect(first.products.replaced).toBe(0)

        const second = await seedInto({ quiet: true })
        expect(second.products.inserted).toBe(0)
        expect(second.products.replaced).toBe(second.products.total)
    })

    it('restores hand-edited documents rather than leaving them drifted', async () => {
        await seedInto({ quiet: true })
        await productModel.updateOne({ _id: '680262846be92b2511550a66' }, { $set: { price: 1, name: 'Tampered' } })

        await seedInto({ quiet: true })

        const restored = await productModel.findById('680262846be92b2511550a66').lean()
        expect(restored.name).toBe('Razer Cobra Pro')
        expect(restored.price).toBe(129.99)
    })

    it('--reset clears the managed collections before writing', async () => {
        await seedInto({ quiet: true })
        await productModel.create({
            _id: '5eedffffffffffffffffffff',
            name: 'Left over from an earlier run',
            description: 'Should not survive a reset.',
            price: 1,
            image: ['x'],
            inventory: {},
            tags: ['Accessories'],
            date: 1,
        })
        expect(await productModel.countDocuments({})).toBe(productFixtures.length + 1)

        await seedInto({ reset: true, quiet: true })

        expect(await productModel.countDocuments({})).toBe(productFixtures.length)
        expect(await productModel.findById('5eedffffffffffffffffffff')).toBeNull()
    })
})

describe('seed: the seeded catalog satisfies the tag taxonomy endpoint', () => {
    it('exposes only real tags — no fabricated categories', async () => {
        await seedInto({ quiet: true })
        const { tags } = await summariseSeed()
        for (const tag of tags) {
            expect(EXPECTED_TAGS, `unexpected tag "${tag}"`).toContain(tag)
        }
    })
})

describe('seed CLI: refuses before it connects', () => {
    // A never-connected local URI. Every assertion below must fail on the
    // guards, so nothing here ever opens a socket.
    const localUri = 'mongodb://127.0.0.1:27017/netronix_dev'
    const silent = { log() { }, warn() { }, error() { } }

    it('refuses --reset when stdin cannot confirm and --yes was not passed', async () => {
        // Under vitest, process.stdin.isTTY is falsy.
        await expect(runSeedCli({ argv: [`--uri=${localUri}`, '--reset'], env: {}, logger: silent }))
            .rejects.toThrow(/cannot be confirmed/)
    })

    it('refuses an unsafe target without attempting a connection', async () => {
        const readyStateBefore = mongoose.connection.readyState
        await expect(runSeedCli({
            argv: ['--uri=mongodb+srv://cluster0.ab12c.mongodb.net/netronix_dev'],
            env: {},
            logger: silent,
        })).rejects.toThrow(UnsafeSeedTargetError)
        // The suite's own in-memory connection is untouched.
        expect(mongoose.connection.readyState).toBe(readyStateBefore)
        expect(mongoose.connection.host).not.toContain('mongodb.net')
    })

    it('refuses to run against the application database', async () => {
        await expect(runSeedCli({ argv: ['--uri=mongodb://127.0.0.1:27017/e-commerce'], env: {}, logger: silent }))
            .rejects.toThrow(/does not identify it as disposable/)
    })

    it('refuses to inherit MONGODB_URI', async () => {
        await expect(runSeedCli({ argv: [], env: { MONGODB_URI: localUri }, logger: silent }))
            .rejects.toThrow(/No seed target was supplied/)
    })
})

// ---------------------------------------------------------------------------
// PHASE 3 RECOVERY — the seed and the order-number allocator agree (DB-002).
//
// Found by the browser end-to-end suite's guest checkout, and reachable by
// anyone following the README: seed a database, place an order, receive
// HTTP 409 "That record already exists". The seed writes fixed order numbers so
// that a demo is reproducible; the allocator is a counter document that a fresh
// database does not have, so the first order was allocated 1000 — a number the
// seed had already used — and the unique index migration 003 builds rejected it.
describe('seed: the order-number sequence', () => {
    it('moves the allocator past every order number it wrote', async () => {
        const result = await seedInto({ quiet: true })

        const orders = await orderModel.find({}).sort({ orderNumber: -1 }).lean()
        const highest = orders[0].orderNumber

        expect(result.orderSequence).toBe(highest)

        const counter = await mongoose.connection.db
            .collection('counters')
            .findOne({ _id: ORDER_NUMBER_SEQUENCE })
        expect(counter.seq).toBe(highest)
    })

    it('hands the next order a number no seeded order already has', async () => {
        await seedInto({ quiet: true })

        const taken = new Set((await orderModel.find({}).lean()).map((order) => order.orderNumber))
        const next = await nextSequenceValue()

        expect(taken.has(next)).toBe(false)
        expect(next).toBeGreaterThan(Math.max(...taken))
    })

    it('never winds a counter backwards', async () => {
        // A database that has issued real orders well past the seeded range.
        await setSequenceValue(ORDER_NUMBER_SEQUENCE, 50_000)
        const result = await seedInto({ quiet: true })

        expect(result.orderSequence).toBe(50_000)
        expect(await nextSequenceValue()).toBe(50_001)
    })

    it('is idempotent across repeated seeds', async () => {
        await seedInto({ quiet: true })
        const first = await nextSequenceValue()
        await seedInto({ quiet: true })
        const second = await nextSequenceValue()

        expect(second).toBe(first + 1)
    })
})

// The whole regression, at the API: seed a database exactly as the README says
// to, then place the guest order the storefront places. Before the fix this
// answered 409 "That record already exists" on the very first order.
describe('seed: an order can actually be placed against a seeded database', () => {
    it('accepts the first guest order after a fresh seed', async () => {
        await seedInto({ quiet: true })

        const accessory = await productModel.findOne({ variants: { $size: 0 } }).lean()
        expect(accessory, 'the seed has a product with no variants').toBeTruthy()

        const response = await api().post('/api/order/guest/place').send({
            items: [{ productId: String(accessory._id), size: '', quantity: 1, variantOptions: {} }],
            address: {
                firstName: 'Demo',
                lastName: 'Customer',
                email: 'demo@netronix.test',
                street: '124 Rue Gouraud',
                city: 'Beirut',
                state: 'Beirut Governorate',
                zipcode: '02022',
                country: 'Lebanon',
                phone: '+961 71 000 000',
            },
            paymentMethod: 'COD',
        })

        expect(response.status, JSON.stringify(response.body)).toBe(201)
        expect(response.body.success).toBe(true)

        const seeded = new Set((await orderModel.find({}).lean()).map((order) => order.orderNumber))
        expect(response.body.order.orderNumber).toBeGreaterThan(1000)
        expect([...seeded].filter((n) => n === response.body.order.orderNumber)).toHaveLength(1)
    })
})
