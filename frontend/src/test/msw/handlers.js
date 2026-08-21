// MSW request handlers for the storefront.
//
// Intercepting at the network boundary rather than mocking axios is deliberate:
// Phase 3 introduces an API-client module (FE-006 / F-7) that changes fifteen
// call sites. Tests written against MSW survive that refactor unchanged; tests
// written against `vi.mock('axios')` would all have to be rewritten.
//
// The response envelopes below mirror what the API returns *today*, bugs
// included — notably HTTP 200 on failure with `{ success: false }` (SEC-010).

import { http, HttpResponse } from 'msw'

import { deriveInventoryV2, legacyVariantKey } from '../../lib/variant.js'
import { toMinor } from '../../lib/money.js'

export const BACKEND_URL = 'http://localhost:4000'

/**
 * A catalog entry, declared the way `productModel` stores one.
 *
 * `inventory` is written here as the legacy bag because that is the readable
 * way to state a fixture; `present()` below converts it to the shape the API
 * actually serves after Phase 2, so a test never has to hand-write a V2 array.
 */
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
        archived: false,
        // Data-driven homepage selection (FE-004). Empty by default: a fixture
        // says which surfaces it belongs to, and one that says nothing belongs
        // to none.
        showcase: [],
        ...overrides,
    }
}

/** One showcase assignment, so a fixture reads as a table. */
export const slot = (name, order = 0) => ({ slot: name, order })

/**
 * The shape `productController.presentProduct` serves after Phase 2 (DB-003,
 * DB-004): `inventory` is the typed array carrying the option pairs, the legacy
 * bag rides alongside as `inventoryLegacy`, and the price is present in both
 * representations.
 */
/** The legacy key a combination would have, for the merge handler's reply. */
function legacyKeyOfOptions(productId, options) {
    const product = catalog.find((candidate) => candidate._id === productId)
    if (!product || !options) return ''
    return legacyVariantKey(product.variants, options)
}

export function present(product) {
    // An explicit `inventoryV2` wins, exactly as it does on the server: the
    // legacy bag cannot express two combinations whose keys collide, so a
    // fixture that needs to say so has to be able to say it directly.
    const entries = Array.isArray(product.inventoryV2) && product.inventoryV2.length > 0
        ? product.inventoryV2
        : deriveInventoryV2(product.variants, product.inventory ?? {}).entries
    return {
        ...product,
        inventory: entries,
        inventoryV2: entries,
        inventoryLegacy: product.inventory ?? {},
        priceMinor: toMinor(product.price),
        currency: 'USD',
    }
}

/**
 * The paginated envelope every list endpoint now returns (BE-009).
 *
 * The array keeps the name the deployed clients already read, and the paging
 * fields are added beside it — which is the compatibility guarantee Phase 2
 * makes, asserted here at the boundary the clients actually see.
 */
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

/** Mutable per-test catalog. Reset by `resetCatalog()` in the setup file. */
let catalog = [makeProduct()]

/** Mutable per-test order history, in the Phase 2 snapshot shape (DB-005). */
let orders = []

/** The signed-in customer's server-side cart. */
let serverCart = {}

export function setServerCart(next) {
    serverCart = next
}

export function setOrders(next) {
    orders = next
}

/**
 * An order line as the API serves one after Phase 2: a snapshot of what was
 * bought, with money in both representations and the variant identity in all
 * three forms.
 */
export function makeOrder(overrides = {}) {
    return {
        _id: '5eed00000000000000001000',
        orderNumber: 1000,
        items: [{
            productId: '680897a3a9a5ffb06b2e52c8',
            name: 'MacBook Pro 16" M4 Pro',
            variantId: 'Storage=1TB',
            variantKey: '1TB',
            size: '1TB',
            variantOptions: { Storage: '1TB' },
            variantLabel: 'Storage: 1TB',
            unitPrice: 2499,
            unitPriceMinor: 249900,
            price: 2499,
            quantity: 1,
            lineTotal: 2499,
            lineTotalMinor: 249900,
            currency: 'USD',
            image: 'data:image/svg+xml;base64,PHN2Zy8+',
            brand: 'Apple',
        }],
        amount: 2502,
        subtotal: 2499,
        delivery_fee: 3,
        amountMinor: 250200,
        subtotalMinor: 249900,
        deliveryFeeMinor: 300,
        currency: 'USD',
        address: { firstName: 'Demo', lastName: 'Customer', city: 'Beirut', country: 'Lebanon', phone: '+961 71 000 000' },
        status: 'Order Placed',
        statusHistory: [{ status: 'Order Placed', at: '2026-08-10T09:30:00.000Z', by: 'guest' }],
        paymentMethod: 'COD',
        payment: false,
        date: '2026-08-10T09:30:00.000Z',
        isGuestOrder: false,
        schemaVersion: 2,
        ...overrides,
    }
}

export function setCatalog(products) {
    catalog = products
}

export function resetCatalog() {
    catalog = [makeProduct()]
    orders = []
    serverCart = {}
}

export function currentCatalog() {
    return catalog
}

/** Mutable greeting for the chatbot init handler. */
const DEFAULT_GREETING = 'Hello! Welcome to Netronix support chat. How can I help you today?'

let chatGreeting = DEFAULT_GREETING
let chatLinks = []

/**
 * Set the greeting the chatbot API returns.
 *
 * The second argument is the `links` array the API now sends alongside the
 * text (SEC-004). Tests that only care about the text still call this with one
 * argument, exactly as they did before the contract changed.
 */
export function setChatGreeting(text, links = []) {
    chatGreeting = text
    chatLinks = links
}

export function resetChatGreeting() {
    chatGreeting = DEFAULT_GREETING
    chatLinks = []
}

/** Counts every request the handlers see, so tests can assert on fetch volume. */
export const requestLog = []

export function resetRequestLog() {
    requestLog.length = 0
    placedOrders.length = 0
    orderFailures = 0
}

/**
 * Every checkout the handlers accepted, with the header that makes a retry a
 * retry rather than a second order (DB-012).
 */
export const placedOrders = []

/** How many of the next checkout attempts fail before one is accepted. */
let orderFailures = 0

export function failNextOrders(count) {
    orderFailures = count
}

const record = (method, path) => requestLog.push(`${method} ${path}`)

/**
 * Checkout, in both its authenticated and guest forms.
 *
 * The handler records the `Idempotency-Key` header because that is the thing
 * under test: the storefront has to send one, keep it across a retry, and
 * change it only for a genuinely new attempt.
 */
const placeOrderHandler = (path) => http.post(`${BACKEND_URL}${path}`, async ({ request }) => {
    record('POST', path)
    const body = await request.json()
    const idempotencyKey = request.headers.get('Idempotency-Key')

    if (orderFailures > 0) {
        orderFailures -= 1
        // A response the client cannot interpret as "definitely not placed".
        return HttpResponse.json(
            { success: false, message: 'The order service is briefly unavailable.' },
            { status: 503 },
        )
    }

    placedOrders.push({ path, idempotencyKey, body })
    return HttpResponse.json({
        success: true,
        message: 'Order Placed Successfully',
        replayed: false,
        order: makeOrder({ _id: `5eed0000000000000010${String(placedOrders.length).padStart(2, '0')}` }),
    })
})

export const handlers = [
    placeOrderHandler('/api/order/place'),
    placeOrderHandler('/api/order/guest/place'),

    http.get(`${BACKEND_URL}/api/product/list`, ({ request }) => {
        record('GET', '/api/product/list')
        return HttpResponse.json(envelope('products', catalog.map(present), pagingOf(request)))
    }),

    http.post(`${BACKEND_URL}/api/product/single`, async ({ request }) => {
        record('POST', '/api/product/single')
        const { productId } = await request.json()
        const product = catalog.find((p) => p._id === productId)
        return HttpResponse.json(
            product ? { success: true, product: present(product) } : { success: false, message: 'Product not found' },
        )
    }),

    http.get(`${BACKEND_URL}/api/product/tags`, () => {
        record('GET', '/api/product/tags')
        const tags = [...new Set(catalog.flatMap((p) => p.tags))]
        return HttpResponse.json({ success: true, tags })
    }),

    http.get(`${BACKEND_URL}/api/product/tags/:tag`, ({ params }) => {
        record('GET', `/api/product/tags/${params.tag}`)
        return HttpResponse.json(envelope('products', catalog.filter((p) => p.tags.includes(params.tag)).map(present)))
    }),

    http.get(`${BACKEND_URL}/api/product/best-sellers`, () => {
        record('GET', '/api/product/best-sellers')
        return HttpResponse.json(envelope('products', catalog.filter((p) => p.bestSeller).map(present)))
    }),

    http.post(`${BACKEND_URL}/api/cart/get`, () => {
        record('POST', '/api/cart/get')
        return HttpResponse.json({ success: true, cartData: serverCart })
    }),

    http.post(`${BACKEND_URL}/api/cart/add`, () => {
        record('POST', '/api/cart/add')
        return HttpResponse.json({ success: true, message: 'Cart Updated' })
    }),

    http.post(`${BACKEND_URL}/api/cart/update`, () => {
        record('POST', '/api/cart/update')
        return HttpResponse.json({ success: true, message: 'Cart Updated' })
    }),

    // The guest cart handed over at login (FE-009). Sums both sides, which is
    // what the server does; the inventory cap is asserted against the real
    // implementation in backend/test/correctness/cart-merge.test.js.
    http.post(`${BACKEND_URL}/api/cart/merge`, async ({ request }) => {
        record('POST', '/api/cart/merge')
        // Both shapes, exactly as the server accepts them: `lines`, which names
        // each combination losslessly, and the legacy map a cached bundle sends.
        const { cart, lines } = await request.json()
        const merged = structuredClone(serverCart)

        const addLine = (productId, variantKey, quantity) => {
            merged[productId] = { ...(merged[productId] ?? {}) }
            merged[productId][variantKey] = (merged[productId][variantKey] ?? 0) + quantity
        }

        for (const line of lines ?? []) {
            const key = line.variantKey ?? legacyKeyOfOptions(line.productId, line.variantOptions)
            addLine(line.productId, key, Number(line.quantity))
        }
        for (const [productId, variants] of Object.entries(cart ?? {})) {
            for (const [variantKey, quantity] of Object.entries(variants)) {
                addLine(productId, variantKey, quantity)
            }
        }
        serverCart = merged
        return HttpResponse.json({ success: true, message: 'Cart Merged', cartData: merged, capped: [] })
    }),

    http.post(`${BACKEND_URL}/api/user/wishlist/get`, () => {
        record('POST', '/api/user/wishlist/get')
        return HttpResponse.json({ success: true, wishlist: [] })
    }),

    http.post(`${BACKEND_URL}/api/user/wishlist/add`, () => {
        record('POST', '/api/user/wishlist/add')
        return HttpResponse.json({ success: true, message: 'Product added to wishlist' })
    }),

    http.post(`${BACKEND_URL}/api/user/wishlist/remove`, () => {
        record('POST', '/api/user/wishlist/remove')
        return HttpResponse.json({ success: true, message: 'Product removed from wishlist' })
    }),

    http.post(`${BACKEND_URL}/api/user/login`, () => {
        record('POST', '/api/user/login')
        return HttpResponse.json({ success: true, token: 'test-customer-token' })
    }),

    http.post(`${BACKEND_URL}/api/user/register`, () => {
        record('POST', '/api/user/register')
        return HttpResponse.json({ success: true, token: 'test-customer-token' })
    }),

    http.post(`${BACKEND_URL}/api/user/logout`, () => {
        record('POST', '/api/user/logout')
        return HttpResponse.json({ success: true, message: 'Signed out' })
    }),

    http.post(`${BACKEND_URL}/api/order/userorders`, ({ request }) => {
        record('POST', '/api/order/userorders')
        return HttpResponse.json(envelope('orders', orders, pagingOf(request)))
    }),

    // The chatbot contract is plain text plus validated links (SEC-004). It
    // used to be raw HTML: the system prompt asked the model for <a> tags and
    // the reply reached React's raw-HTML escape hatch untouched. These handlers
    // still let a test push markup through `setChatGreeting`, because proving
    // that markup arrives as *text* is the whole point of the regression.
    http.post(`${BACKEND_URL}/api/chatbot/init`, () => {
        record('POST', '/api/chatbot/init')
        return HttpResponse.json({
            success: true,
            sessionId: 'test-session',
            greeting: {
                text: chatGreeting,
                links: chatLinks,
                timestamp: new Date('2026-08-10T09:30:00Z').toISOString(),
            },
        })
    }),

    http.post(`${BACKEND_URL}/api/chatbot/message`, async ({ request }) => {
        record('POST', '/api/chatbot/message')
        const { message } = await request.json()
        return HttpResponse.json({ success: true, message: `echo: ${message}`, text: `echo: ${message}`, links: chatLinks })
    }),

    http.post(`${BACKEND_URL}/api/chatbot/end`, () => {
        record('POST', '/api/chatbot/end')
        return HttpResponse.json({ success: true, message: 'Chat session ended successfully' })
    }),
]
