// Catalog reads (FE-006).
//
// Every product that leaves this module has been through `normaliseProduct`, so
// no component has to know that `inventory` is served as the typed array with
// the legacy bag beside it, or that `priceMinor` may have to be derived from
// `price` on a document written before the Phase 2 migration.

import { get, post, normalisePage, collectPages } from './client'
import { DEFAULT_CURRENCY, readMinor } from '../lib/money'

/**
 * One product, in the shape every storefront surface expects.
 *
 * The defensive normalisation here was previously repeated — with small
 * differences — in the context and in three components. Where they disagreed,
 * they disagreed silently.
 */
export function normaliseProduct(product) {
    if (!product) return null

    const images = Array.isArray(product.image) ? product.image : []

    return {
        ...product,
        image: images.filter((image) => typeof image === 'string' && image.trim() !== ''),
        description: product.description || product.desc || '',
        variants: Array.isArray(product.variants) ? product.variants : [],
        tags: Array.isArray(product.tags) ? product.tags : [],
        showcase: Array.isArray(product.showcase) ? product.showcase : [],
        // Phase 2 serves `inventory` as the typed array and the old bag as
        // `inventoryLegacy` (DB-003). Both are kept: `inventoryV2` is what every
        // consumer resolves against, and the bag is retained for anything not
        // yet migrated.
        inventory: product.inventory || {},
        inventoryV2: Array.isArray(product.inventoryV2)
            ? product.inventoryV2
            : (Array.isArray(product.inventory) ? product.inventory : []),
        inventoryLegacy: product.inventoryLegacy || {},
        // Dual-read: a document written after the migration carries
        // `priceMinor`; one written before carries only `price` (DB-004).
        priceMinor: readMinor(product, 'priceMinor', 'price'),
        currency: product.currency || DEFAULT_CURRENCY,
    }
}

/** The catalog. One request; the envelope is normalised centrally (BE-009). */
export async function listProducts(params) {
    const data = await get('/api/product/list', { params })
    const page = normalisePage(data, 'products')
    return { ...page, items: page.items.map(normaliseProduct) }
}

/**
 * The whole catalog, walked page by page (BE-009).
 *
 * `listProducts` returns one bounded page, which is what every storefront
 * surface used to render as if it were everything. A catalog of 150 products
 * was shown as 100, and nothing said so.
 *
 * `truncated` is passed through rather than swallowed: a catalog larger than
 * the walk's bound is a real condition and the caller should be able to say so.
 */
export async function listAllProducts(params = {}) {
    const page = await collectPages((paging) => listProducts({ ...params, ...paging }), { params })
    return { ...page, items: page.items }
}

export async function fetchProduct(productId) {
    const data = await post('/api/product/single', { productId })
    return normaliseProduct(data?.product ?? null)
}

export async function listProductsByTag(tag, params) {
    const data = await get(`/api/product/tags/${encodeURIComponent(tag)}`, { params })
    const page = normalisePage(data, 'products')
    return { ...page, items: page.items.map(normaliseProduct) }
}

/** The real filter taxonomy (FE-010). Never a hand-written list of categories. */
export async function listTags() {
    const data = await get('/api/product/tags')
    return Array.isArray(data?.tags) ? data.tags : []
}

export async function listBestSellers(params) {
    const data = await get('/api/product/best-sellers', { params })
    const page = normalisePage(data, 'products')
    return { ...page, items: page.items.map(normaliseProduct) }
}
