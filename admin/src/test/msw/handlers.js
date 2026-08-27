// MSW request handlers for the admin console.
//
// Response envelopes mirror the API as it behaves today, including HTTP 200 on
// failure with `{ success: false }` (SEC-010).

import { http, HttpResponse } from 'msw'

import { deriveInventoryV2 } from '../../lib/variant.js'
import { toMinor } from '../../lib/money.js'

export const BACKEND_URL = 'http://localhost:4000'

/**
 * The only token `/api/user/admin/session` accepts in these tests.
 *
 * A stand-in for a real signed token, not a credential: the console never
 * inspects it, it just presents it and believes the server's answer.
 */
export const VALID_ADMIN_TOKEN = 'test.admin.token'

export function makeProduct(overrides = {}) {
    return {
        _id: '680897a3a9a5ffb06b2e52c8',
        name: 'MacBook Pro 16" M4 Pro',
        brand: 'Apple',
        price: 2499,
        description: 'A 16-inch laptop used as a test fixture.',
        image: ['data:image/svg+xml;base64,PHN2Zy8+'],
        variants: [{ name: 'Storage', options: ['512GB', '1TB'] }],
        inventory: { '512GB': 4, '1TB': 1 },
        bestSeller: true,
        tags: ['MacBooks', 'Laptops'],
        date: 1785585600000,
        showcase: [],
        ...overrides,
    }
}

/**
 * The shape `productController.presentProduct` serves after Phase 2 (DB-003,
 * DB-004): the typed inventory array, the legacy bag beside it, and the price
 * in both representations.
 */
export function present(product) {
    const entries = deriveInventoryV2(product.variants, product.inventory ?? {}).entries
    return {
        ...product,
        inventory: entries,
        inventoryV2: entries,
        inventoryLegacy: product.inventory ?? {},
        priceMinor: toMinor(product.price),
        currency: 'USD',
        archived: Boolean(product.archived),
    }
}

/** The paginated envelope every list endpoint returns (BE-009). */
export function envelope(key, items, { page = 1, limit = 100 } = {}) {
    const total = items.length
    const resolvedLimit = Math.min(Math.max(1, Number(limit) || 100), 100)
    const resolvedPage = Math.max(1, Number(page) || 1)
    const slice = items.slice((resolvedPage - 1) * resolvedLimit, resolvedPage * resolvedLimit)

    return {
        success: true,
        [key]: slice,
        items: slice,
        total,
        page: resolvedPage,
        limit: resolvedLimit,
        pages: Math.max(1, Math.ceil(total / resolvedLimit)),
    }
}

/** The paging a request asked for, as the server would read it. */
export const pagingOf = (request) => {
    const url = new URL(request.url)
    return { page: Number(url.searchParams.get('page') ?? 1), limit: Number(url.searchParams.get('limit') ?? 100) }
}

export function makeOrder(overrides = {}) {
    return {
        _id: '5eed00000000000000001000',
        orderNumber: 1000,
        userId: '5eed00000000000000000001',
        // A Phase 2 snapshot line (DB-005): what was bought, at what price, with
        // the variant identity in all three forms and money in both.
        items: [{
            productId: '680897a3a9a5ffb06b2e52c8',
            name: 'MacBook Pro 16" M4 Pro',
            variantId: 'Storage=1TB',
            variantKey: '1TB',
            size: '1TB',
            variantOptions: { Storage: '1TB' },
            variantLabel: 'Storage: 1TB',
            quantity: 1,
            price: 2499,
            unitPrice: 2499,
            unitPriceMinor: 249900,
            lineTotal: 2499,
            lineTotalMinor: 249900,
            currency: 'USD',
            brand: 'Apple',
        }],
        amount: 2502,
        subtotal: 2499,
        delivery_fee: 3,
        amountMinor: 250200,
        subtotalMinor: 249900,
        deliveryFeeMinor: 300,
        currency: 'USD',
        statusHistory: [{ status: 'Order Placed', at: '2026-08-10T09:30:00.000Z', by: 'guest' }],
        schemaVersion: 2,
        address: { firstName: 'Demo', lastName: 'Customer', city: 'Beirut', country: 'Lebanon', phone: '+961 71 000 000' },
        status: 'Order Placed',
        paymentMethod: 'COD',
        payment: false,
        date: '2026-08-10T09:30:00.000Z',
        isGuestOrder: false,
        ...overrides,
    }
}

let catalog = [makeProduct()]
let orders = [makeOrder()]

export const setCatalog = (products) => { catalog = products }
export const setOrders = (next) => { orders = next }
export const resetFixtures = () => {
    catalog = [makeProduct()]
    orders = [makeOrder()]
    lastInventoryRequest = null
}

/** The body of the most recent bulk-inventory request (ADM-004). */
export let lastInventoryRequest = null
export const resetInventoryRequest = () => { lastInventoryRequest = null }

export const requestLog = []
export const resetRequestLog = () => { requestLog.length = 0 }
const record = (method, path) => requestLog.push(`${method} ${path}`)

export const handlers = [
    http.get(`${BACKEND_URL}/api/product/list`, ({ request }) => {
        record('GET', '/api/product/list')
        // Mirrors `catalogFilter` on the server: archived products are excluded
        // from every catalog surface unless `includeArchived` asks for them
        // (DB-007, ADM-003). A handler that returned them regardless would let
        // a console bug pass here and fail in the browser.
        const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true'

        // And it mirrors `adminAuthForArchivedQuery` too, which is the half this
        // handler used to leave out. `/list` is public, but the archived view is
        // admin-only, so an anonymous request for it is a 401 on the real
        // server. Modelling only the filter and not the guard is what let
        // `listProducts` ship without a token: every unit test passed, and in
        // the browser ticking "Show archived" returned 401 and rendered "No
        // archived products" over a product that had just been archived. A mock
        // more permissive than the thing it stands in for cannot fail.
        if (includeArchived && request.headers.get('token') !== VALID_ADMIN_TOKEN) {
            return HttpResponse.json(
                { success: false, message: 'Not Authorized Login Again' },
                { status: 401 },
            )
        }

        const visible = includeArchived ? catalog : catalog.filter((product) => !product.archived)
        return HttpResponse.json(envelope('products', visible.map(present), pagingOf(request)))
    }),
    http.post(`${BACKEND_URL}/api/product/remove`, () => {
        record('POST', '/api/product/remove')
        return HttpResponse.json({ success: true, message: 'Product Removed' })
    }),
    // Soft delete and its inverse (DB-007, ADM-003). The polished confirmation
    // and restore UI is Phase 3; these exist so the API half is exercised.
    http.post(`${BACKEND_URL}/api/product/archive`, () => {
        record('POST', '/api/product/archive')
        return HttpResponse.json({ success: true, message: 'Product Archived' })
    }),
    http.post(`${BACKEND_URL}/api/product/restore`, () => {
        record('POST', '/api/product/restore')
        return HttpResponse.json({ success: true, message: 'Product Restored' })
    }),
    http.post(`${BACKEND_URL}/api/product/update-inventory`, () => {
        record('POST', '/api/product/update-inventory')
        return HttpResponse.json({ success: true, message: 'Inventory updated successfully' })
    }),
    http.post(`${BACKEND_URL}/api/product/add`, () => {
        record('POST', '/api/product/add')
        return HttpResponse.json({ success: true, message: 'Product Added Successfully' })
    }),

    // Phase 3 (ADM-002, ADM-004). The atomicity and the partial-update semantics
    // are asserted against the real implementation in
    // backend/test/correctness/admin-product.test.js; these exist so the console
    // half can be driven.
    http.patch(`${BACKEND_URL}/api/product/:id`, ({ params }) => {
        record('PATCH', `/api/product/${params.id}`)
        return HttpResponse.json({ success: true, message: 'Product Updated' })
    }),

    http.post(`${BACKEND_URL}/api/product/:id/inventory`, async ({ params, request }) => {
        record('POST', `/api/product/${params.id}/inventory`)
        const body = await request.json()
        lastInventoryRequest = body
        return HttpResponse.json({ success: true, message: 'Inventory updated successfully' })
    }),

    http.post(`${BACKEND_URL}/api/product/single`, async ({ request }) => {
        record('POST', '/api/product/single')
        const { productId } = await request.json()
        const found = catalog.find((p) => p._id === productId)
        return HttpResponse.json({ success: true, product: found ? present(found) : null })
    }),
    http.post(`${BACKEND_URL}/api/order/list`, ({ request }) => {
        record('POST', '/api/order/list')
        return HttpResponse.json(envelope('orders', orders, pagingOf(request)))
    }),
    http.post(`${BACKEND_URL}/api/order/status`, () => {
        record('POST', '/api/order/status')
        return HttpResponse.json({ success: true, message: 'Order Status Updated Successfully' })
    }),
    http.post(`${BACKEND_URL}/api/user/admin`, async ({ request }) => {
        record('POST', '/api/user/admin')
        const { email, password } = await request.json()
        if (email === 'admin@netronix.test' && password === 'test-admin-password-not-real') {
            // A placeholder of the shape the API now issues: a signed claims
            // object carrying `{ sub, role, v }` and no credential material
            // (SEC-001). It is not a real token and is never verified here —
            // the console asks the server, which is the point of SEC-012.
            return HttpResponse.json({ success: true, token: VALID_ADMIN_TOKEN })
        }
        return HttpResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 })
    }),

    // SEC-012 — the console renders its shell only after this succeeds.
    // Anything other than the one token the login handler issues is refused,
    // exactly as `adminAuth` refuses it server-side.
    http.get(`${BACKEND_URL}/api/user/admin/session`, ({ request }) => {
        record('GET', '/api/user/admin/session')
        const token = request.headers.get('token')

        if (token !== VALID_ADMIN_TOKEN) {
            return HttpResponse.json(
                { success: false, message: 'Not authorised. Please sign in again.' },
                { status: 401 },
            )
        }
        return HttpResponse.json({
            success: true,
            admin: { id: '5eed00000000000000000009', name: 'Test Admin', email: 'admin@netronix.test', role: 'admin' },
        })
    }),

    http.post(`${BACKEND_URL}/api/user/logout`, () => {
        record('POST', '/api/user/logout')
        return HttpResponse.json({ success: true, message: 'Signed out' })
    }),
]
