// CHARACTERISATION — the product API and the variant-key encoding as they
// behave today.
//
// Manifest flow: 8 (variant keys survive hyphens, DB-003).
// Target-state assertions: test/target-state/variant.target.test.js.

import { describe, it, expect } from 'vitest'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedAdmin, seedProduct, validAddress } from '../helpers/api.js'
import productModel from '../../models/productModel.js'

useTestDatabase()

/**
 * The encoding the storefront uses, copied from `Product.jsx:83-90` and
 * `admin/src/pages/Add.jsx:199`. Reproduced here rather than imported because
 * it does not exist as a shared module — which is the root of DB-003.
 */
const encodeVariantKey = (optionValues) => optionValues.join('-')
const decodeVariantKey = (key) => key.split('-')

describe('flow 8 — hyphenated variant keys (DB-003)', () => {
    it('resolves stock for an exact hyphenated key, because the backend treats it as opaque', async () => {
        const product = await seedProduct({
            variants: [
                { name: 'Size', options: ['14-inch', '16-inch'] },
                { name: 'Storage', options: ['512GB', '1TB'] },
            ],
            inventory: { '14-inch-512GB': 4, '14-inch-1TB': 2, '16-inch-512GB': 3, '16-inch-1TB': 1 },
        })

        const { body } = await api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: '16-inch-1TB', quantity: 1 }],
            address: validAddress,
        })

        expect(body.success).toBe(true)
        expect((await productModel.findById(product._id)).inventory['16-inch-1TB']).toBe(0)
    })

    it('CURRENT BEHAVIOUR: the encoding is not reversible once an option contains a hyphen (DB-003 — will change)', () => {
        const key = encodeVariantKey(['16-inch', '1TB'])
        expect(key).toBe('16-inch-1TB')

        // Splitting on "-" cannot recover the original two options.
        expect(decodeVariantKey(key)).toEqual(['16', 'inch', '1TB'])
        expect(decodeVariantKey(key)).not.toEqual(['16-inch', '1TB'])
    })

    it('CURRENT BEHAVIOUR: two different combinations collide onto one key (DB-003 — will change)', () => {
        // Product A: Size ["16-inch"] × Storage ["1TB"]
        // Product B: Size ["16"]      × Storage ["inch-1TB"]
        expect(encodeVariantKey(['16-inch', '1TB'])).toBe(encodeVariantKey(['16', 'inch-1TB']))
    })

    it('CURRENT BEHAVIOUR: the storefront cannot tell whether all axes are selected (DB-003)', () => {
        // `Product.jsx:94` guards with
        //   variantKey.split('-').length !== variants.length
        // which is wrong the moment any option value contains a hyphen: a fully
        // selected two-axis combination looks like three selections and the
        // out-of-stock check is skipped entirely — failing open.
        const variantCount = 2
        const fullySelected = encodeVariantKey(['16-inch', '1TB'])
        expect(decodeVariantKey(fullySelected).length).not.toBe(variantCount)
    })

    it('CURRENT BEHAVIOUR: an "RTX-4090" option produces the same ambiguity', () => {
        const key = encodeVariantKey(['RTX-4090', '32GB'])
        expect(key).toBe('RTX-4090-32GB')
        expect(decodeVariantKey(key)).toEqual(['RTX', '4090', '32GB'])
    })

    it('rejects an order for a variant key that does not exist on the product with 400', async () => {
        const product = await seedProduct({
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 5 },
        })
        const response = await api().post('/api/order/guest/place').send({
            items: [{ productId: String(product._id), size: 'Purple', quantity: 1 }],
            address: validAddress,
        })
        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
    })
})

describe('inventory administration', () => {
    it('updates stock for a hyphenated variant key', async () => {
        const product = await seedProduct({
            variants: [{ name: 'GPU', options: ['RTX-4090'] }],
            inventory: { 'RTX-4090': 2 },
        })

        const { body } = await api().post('/api/product/update-inventory').set('token', (await seedAdmin()).token)
            .send({ productId: String(product._id), variantKey: 'RTX-4090', quantity: 9 })

        expect(body.success).toBe(true)
        expect((await productModel.findById(product._id)).inventory['RTX-4090']).toBe(9)
    })

    it('a variantKey containing a dot is rejected before it reaches a field path (SEC-018 — fixed)', async () => {
        // Phase 0 interpolated the key straight into `inventory.${variantKey}`,
        // so "a.b" created a nested `inventory.a.b` object rather than a key
        // literally named "a.b" — and any invented key created a new field.
        const product = await seedProduct({ inventory: { Black: 1 } })

        const response = await api().post('/api/product/update-inventory').set('token', (await seedAdmin()).token)
            .send({ productId: String(product._id), variantKey: 'a.b', quantity: 5 })

        expect(response.status).toBe(400)

        const stored = await productModel.findById(product._id).lean()
        expect(stored.inventory).toEqual({ Black: 1 })
        expect(stored.inventory.a).toBeUndefined()
    })

    it('a non-numeric quantity is rejected rather than silently becoming 0 (BE-003 — fixed)', async () => {
        // `parseInt(quantity) || 0` turned "lots" into a stock level of zero —
        // a typo in the admin console silently emptied a shelf.
        const product = await seedProduct({ inventory: { Black: 4 } })

        const response = await api().post('/api/product/update-inventory').set('token', (await seedAdmin()).token)
            .send({ productId: String(product._id), variantKey: 'Black', quantity: 'lots' })

        expect(response.status).toBe(400)
        expect((await productModel.findById(product._id)).inventory.Black).toBe(4)
    })

    it('reports fresh inventory through check-inventory, in both representations', async () => {
        // FLIPPED IN PHASE 2, task 2.9. `inventory` was the untyped bag
        // `{ "Black": 3 }`; it is now the typed array that carries the option
        // pairs themselves, and the bag is served beside it as
        // `inventoryLegacy` so a client that has not been redeployed still has
        // the field it reads (DB-003, additive rollout).
        const product = await seedProduct({ inventory: { Black: 3 } })
        const { body } = await api().post('/api/product/check-inventory')
            .send({ productId: String(product._id) })

        expect(body.success).toBe(true)
        expect(body.product.inventory).toHaveLength(1)
        expect(body.product.inventory[0]).toMatchObject({ quantity: 3, legacyKey: 'Black' })
        expect(body.product.inventoryLegacy).toEqual({ Black: 3 })
    })
})

describe('catalog endpoints and response envelopes', () => {
    it('GET /api/product/list still returns { success, products }, now inside an envelope', async () => {
        // FLIPPED IN PHASE 2, task 2.12. `products` keeps its name and its
        // shape, because that is what both deployed clients read; the paging
        // envelope is added alongside it rather than replacing it (BE-009).
        await seedProduct({ name: 'Listed Product' })
        const response = await api().get('/api/product/list')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.products).toHaveLength(1)
        expect(response.body.products[0].name).toBe('Listed Product')
        expect(Object.keys(response.body).sort())
            .toEqual(['items', 'limit', 'page', 'pages', 'products', 'success', 'total'])
    })

    it('the catalog is paginated, and a client that sends no page still gets one (BE-009 — fixed)', async () => {
        for (let i = 0; i < 12; i += 1) await seedProduct()
        const { body } = await api().get('/api/product/list')

        // The default limit is generous on purpose: a cached bundle that sends
        // no query string must keep receiving a whole small catalog.
        expect(body.products).toHaveLength(12)
        expect(body).toMatchObject({ page: 1, total: 12, pages: 1, limit: 100 })

        const second = await api().get('/api/product/list?page=2&limit=5')
        expect(second.body.products).toHaveLength(5)
        expect(second.body).toMatchObject({ page: 2, total: 12, pages: 3 })
    })

    it('rejects an unusable page or limit with 400 rather than clamping it (BE-009)', async () => {
        // Silently clamping is how a caller ends up believing it has the whole
        // list. Unknown parameters are still stripped, so a cache-buster is
        // harmless.
        expect((await api().get('/api/product/list?page=0')).status).toBe(400)
        expect((await api().get('/api/product/list?limit=abc')).status).toBe(400)
        expect((await api().get('/api/product/list?limit=5000')).status).toBe(400)
        expect((await api().get('/api/product/list?cacheBust=1')).status).toBe(200)
    })

    it('POST /api/product/single returns one product', async () => {
        const product = await seedProduct()
        const { body } = await api().post('/api/product/single').send({ productId: String(product._id) })
        expect(body.success).toBe(true)
        expect(body.product._id).toBe(String(product._id))
    })

    it('an invalid ObjectId is a clean 400 with no CastError (BE-003 / SEC-009 — fixed)', async () => {
        const response = await api().post('/api/product/single').send({ productId: 'not-an-object-id' })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(JSON.stringify(response.body)).not.toMatch(/Cast to ObjectId failed|CastError/)
    })

    it('CURRENT BEHAVIOUR: a missing product returns success:true with product null', async () => {
        const { body } = await api().post('/api/product/single').send({ productId: '5eedffffffffffffffffffff' })
        expect(body).toEqual({ success: true, product: null })
    })

    it('GET /api/product/tags returns the distinct tag set', async () => {
        await seedProduct({ tags: ['Laptops', 'Gaming'] })
        await seedProduct({ tags: ['Laptops', 'MacBooks'] })

        const { body } = await api().get('/api/product/tags')
        expect(body.success).toBe(true)
        expect(body.tags.sort()).toEqual(['Gaming', 'Laptops', 'MacBooks'])
    })

    it('GET /api/product/tags/:tag filters by tag', async () => {
        await seedProduct({ name: 'A Laptop', tags: ['Laptops'] })
        await seedProduct({ name: 'A Speaker', tags: ['Speakers'] })

        const { body } = await api().get('/api/product/tags/Speakers')
        expect(body.products).toHaveLength(1)
        expect(body.products[0].name).toBe('A Speaker')
    })

    it('GET /api/product/best-sellers filters on the flag', async () => {
        await seedProduct({ name: 'Popular', bestSeller: true })
        await seedProduct({ name: 'Unpopular', bestSeller: false })

        const { body } = await api().get('/api/product/best-sellers')
        expect(body.products.map((p) => p.name)).toEqual(['Popular'])
    })

    it('CURRENT BEHAVIOUR: an expensive product is present in the API — the >$1,000 problem is client-side (FE-003)', async () => {
        // Flow 11 asserts that /collections/all shows a $2,500 laptop. The API
        // has always returned it; the storefront filter is what drops it.
        await seedProduct({ name: 'Expensive Laptop', price: 2500 })
        const { body } = await api().get('/api/product/list')
        expect(body.products.map((p) => p.name)).toContain('Expensive Laptop')
    })

    it('removes an unreferenced product through the admin route', async () => {
        const product = await seedProduct()
        const { body, status } = await api().post('/api/product/remove').set('token', (await seedAdmin()).token)
            .send({ id: String(product._id) })

        expect(status).toBe(200)
        expect(body).toMatchObject({ success: true, message: 'Product Removed' })
        expect(await productModel.findById(product._id)).toBeNull()
    })

    it('removing a non-existent product reports 404 rather than success (BE-003 — fixed)', async () => {
        const response = await api().post('/api/product/remove').set('token', (await seedAdmin()).token)
            .send({ id: '5eedffffffffffffffffffff' })

        expect(response.status).toBe(404)
        expect(response.body.success).toBe(false)
    })
})

describe('the root route', () => {
    it('answers with a plain string', async () => {
        const response = await api().get('/')
        expect(response.status).toBe(200)
        expect(response.text).toBe('API Working')
    })

    // BE-014 — CHANGED IN PHASE 4. This test recorded that `/health` did not
    // exist; it does now, and against the in-memory replica set these tests run
    // against, the database ping succeeds. The full 200/503 matrix, including
    // the unavailable branch, is `test/observability/health.test.js`.
    it('exposes /health, and it reports the database (BE-014)', async () => {
        const response = await api().get('/health')
        expect(response.status).toBe(200)
        expect(response.body).toMatchObject({ status: 'ok', ready: true, checks: { database: 'ok' } })
    })

    it('CURRENT BEHAVIOUR: the API is unversioned (BE-012 — will change)', async () => {
        expect((await api().get('/api/v1/product/list')).status).toBe(404)
        expect((await api().get('/api/product/list')).status).toBe(200)
    })
})
