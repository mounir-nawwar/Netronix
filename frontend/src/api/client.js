// The storefront's one HTTP layer (FE-006, FE-008, PERF-005).
//
// The defect
// ----------
// `axios` was imported directly in fifteen files. Each one built its own URL
// from a `backendUrl` it read off the context, attached the token if it
// remembered to, and interpreted failure however that file's author felt at the
// time — `toast.error(error.message)` in most of them, which shows a customer
// the string "Request failed with status code 500".
//
// Six of those files fetched the **whole catalog** independently, five of them
// concurrently on the homepage, on top of the two the duplicated provider
// already issued (FE-001). And `App.jsx` exported a second, conflicting
// `backendUrl` defaulting to port 5000 — the backend listens on 4000 — that
// nothing imported and nothing had noticed was wrong.
//
// What this module is
// -------------------
// One HTTP layer, with the four things every call needs done the same way:
//
//   * **One base URL**, from the validated config module, which fails loudly at
//     startup rather than producing requests to `undefined/api/product/list`.
//   * **The token attached** from wherever the session currently is, so no call
//     site has to remember and none can forget.
//   * **Normalised errors**: every failure becomes an `ApiError` carrying a
//     status and a message that is safe to show a person.
//   * **The pagination envelope normalised** in one place, so a caller reads
//     `{ items, total, page, pages, limit }` whatever the server sent.
//
// What it deliberately does not do
// --------------------------------
// It does not log out on a 401. `authUser` returns 401 for an expired session
// *and* for a request that simply had no token, and the storefront issues plenty
// of the latter — a guest browsing the catalog. Redirecting on every one would
// bounce guests to the login page. The 401 is surfaced as `error.unauthorized`
// and the session owner decides, which is also what keeps this module free of a
// dependency on the context that would make a logout loop possible.

// PERF-003 — and it is `fetch`, not `axios`, and that is a delivery decision.
//
// `axios` was 18.6 kB gzip (48.5 kB parsed) in the entry chunk of every route,
// because this module is on the path of every page and creates its instance at
// import time. What the storefront asks of it is four things — a base URL, one
// request header, an error shape, and JSON in and out — and `fetch` has done
// all four in every browser this application supports since 2017. The library
// was carrying an XHR adapter, an interceptor pipeline, a form-data serialiser,
// a proxy layer and Node support to a browser that needed none of it.
//
// Everything below this line that a caller can see is unchanged: `get`, `post`
// and `patch` take and return exactly what they did, `ApiError` has the same
// fields, `toApiError` accepts the same `{ response: { status, data } }` shape
// the tests hand it directly, and `normalisePage` and `collectPages` are
// untouched. The one behavioural difference is deliberate: `Content-Type:
// application/json` is now sent only with a body, where `axios` put it on every
// request including bare `GET`s — which is a header that turns a simple
// cross-origin GET into a preflighted one for no reason.

import { backendUrl } from '../config'

/** Where the session token lives today. SEC-007 is a deliberate deferral. */
export const TOKEN_STORAGE_KEY = 'token'

/**
 * A failure a caller can act on and a message a person can read.
 *
 * What the storefront used to show was the HTTP client's own wording —
 * "Request failed with status code 400". The server's own message is preferred,
 * and the fallback is written for a customer rather than for a developer.
 */
export class ApiError extends Error {
    constructor(message, { status = 0, code, details, cause } = {}) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.details = details
        this.cause = cause
    }

    /** No response at all: offline, DNS, CORS, or the API is not running. */
    get isNetworkError() { return this.status === 0 }

    get unauthorized() { return this.status === 401 }
    get forbidden() { return this.status === 403 }
    get notFound() { return this.status === 404 }
}

const NETWORK_MESSAGE = 'We could not reach Netronix. Check your connection and try again.'
const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

/** The most useful message the response carries, or an honest generic one. */
function messageFrom(response) {
    const data = response?.data
    if (typeof data?.message === 'string' && data.message.trim() !== '') return data.message
    if (typeof data?.error === 'string' && data.error.trim() !== '') return data.error
    return GENERIC_MESSAGE
}

export function toApiError(error) {
    if (error instanceof ApiError) return error
    if (!error?.response) {
        return new ApiError(NETWORK_MESSAGE, { status: 0, code: 'NETWORK', cause: error })
    }
    const { status, data } = error.response
    return new ApiError(messageFrom(error.response), {
        status,
        code: data?.code,
        details: data?.requestId,
        cause: error,
    })
}

/**
 * How the client finds the current token.
 *
 * A function rather than a value so the instance never holds a stale one, and
 * replaceable so the context can hand over its own state instead of reading
 * storage on every request.
 */
let readToken = () => {
    try {
        return localStorage.getItem(TOKEN_STORAGE_KEY) || ''
    } catch {
        // Storage can be unavailable — Safari private mode, a hardened profile.
        // An anonymous request is the correct degradation.
        return ''
    }
}

export function setTokenReader(reader) {
    readToken = typeof reader === 'function' ? reader : () => ''
}

/** `?page=1&limit=100`, skipping anything the caller left undefined. */
function queryString(params) {
    if (!params) return ''
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        search.append(key, String(value))
    }
    const encoded = search.toString()
    return encoded === '' ? '' : `?${encoded}`
}

/** The body, whatever the server sent: JSON when it is JSON, text otherwise. */
async function readBody(response) {
    if (response.status === 204) return null
    const text = await response.text().catch(() => '')
    if (text === '') return null
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

/**
 * One request, with the four things every call needs done the same way.
 *
 * A non-2xx status rejects, which is the contract every caller was already
 * written against; `fetch` on its own resolves for a 500, and a client that
 * treats "the server said no" as success is the defect this module exists to
 * prevent.
 */
async function request(method, path, body, { params, headers } = {}) {
    const url = `${backendUrl}${path}${queryString(params)}`

    const requestHeaders = { ...headers }
    // The API authenticates with a custom `token` header, which browsers never
    // attach cross-origin — that is the reason SEC-007's localStorage trade-off
    // does not also carry CSRF exposure today.
    const token = readToken()
    if (token) requestHeaders.token = token

    // Only a request that carries JSON declares that it does. A bare `GET` with
    // `Content-Type: application/json` is not a simple cross-origin request and
    // costs a preflight round trip for a header the server never reads.
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'

    const init = { method, headers: requestHeaders }
    if (body !== undefined) init.body = JSON.stringify(body)

    let response
    try {
        response = await fetch(url, init)
    } catch (error) {
        // Offline, DNS, CORS, or the API is not running: no response at all.
        throw toApiError(error)
    }

    const data = await readBody(response)
    if (!response.ok) throw toApiError({ response: { status: response.status, data } })
    return { data, status: response.status }
}

/**
 * The instance-shaped export `api/index.js` re-exports. It is the same four
 * verbs the rest of this module is written on, so a caller that reached for it
 * gets the same behaviour the named helpers give.
 */
export const client = Object.freeze({
    get: (path, config) => request('GET', path, undefined, config),
    post: (path, body, config) => request('POST', path, body ?? {}, config),
    patch: (path, body, config) => request('PATCH', path, body ?? {}, config),
    request,
})

/**
 * The API's own failure convention: HTTP 200 with `{ success: false }`.
 *
 * Phase 1 gave every endpoint a real status code, but the envelope kept the
 * flag, and a cached client build may still be talking to either. Treating a
 * false `success` as a failure means both shapes reach a caller the same way.
 */
function assertSuccess(data) {
    if (data && data.success === false) {
        throw new ApiError(typeof data.message === 'string' ? data.message : GENERIC_MESSAGE, {
            status: 200,
            code: data.code,
        })
    }
    return data
}

/** GET, returning the response body. */
export async function get(path, config) {
    const { data } = await request('GET', path, undefined, config)
    return assertSuccess(data)
}

/** POST, returning the response body. */
export async function post(path, body, config) {
    const { data } = await request('POST', path, body ?? {}, config)
    return assertSuccess(data)
}

/** PATCH, returning the response body. */
export async function patch(path, body, config) {
    const { data } = await request('PATCH', path, body ?? {}, config)
    return assertSuccess(data)
}

/**
 * Normalise a list response, whichever shape it is in (BE-009).
 *
 * Phase 2 made every list endpoint answer with an envelope, but kept the array
 * under the name the deployed clients already read — `products`, `orders` — and
 * added `items`, `total`, `page`, `pages` and `limit` beside it. Both halves of
 * that compatibility promise are honoured here: `items` is preferred, the named
 * array is the fallback, and a bare array from an older deployment still
 * resolves. The named fields are **not** dropped server-side yet, so nothing
 * here assumes they are gone.
 *
 * @param {object|Array} data
 * @param {string} key the legacy array name, e.g. `'products'`
 */
export function normalisePage(data, key) {
    if (Array.isArray(data)) {
        return {
            items: data, total: data.length, page: 1, pages: 1, limit: data.length,
            metadataValid: false,
        }
    }

    const items = Array.isArray(data?.items)
        ? data.items
        : (Array.isArray(data?.[key]) ? data[key] : [])

    const total = Number.isFinite(data?.total) ? data.total : items.length
    const limit = Number.isFinite(data?.limit) && data.limit > 0 ? data.limit : (items.length || 1)
    const page = Number.isFinite(data?.page) && data.page >= 1 ? data.page : 1
    const pages = Number.isFinite(data?.pages) && data.pages >= 1
        ? data.pages
        : Math.max(1, Math.ceil(total / limit))

    const metadataValid = ['total', 'page', 'pages', 'limit'].every((field) =>
        Object.prototype.hasOwnProperty.call(data ?? {}, field)
        && Number.isFinite(data[field])
        && Number.isInteger(data[field])
        && (field === 'total' ? data[field] >= 0 : data[field] >= 1))

    return { items, total, page, pages, limit, metadataValid }
}

/**
 * Walk a bounded listing to the end, deliberately (BE-009).
 *
 * Phase 2 capped every list endpoint at 100 records and put `total`, `page` and
 * `pages` in the envelope so a client could tell there was more. No client
 * read them: the storefront and the admin console each issued one request and
 * rendered `items`, so a catalog of 150 products silently became 100 and an
 * order history of 150 silently became 100. The truncation was invisible on
 * both sides — the server was behaving correctly and the client never asked the
 * second question.
 *
 * The walk is **bounded**, because "fetch until the server stops" is how one
 * client mistake becomes a thousand requests. When the bound is reached the
 * caller is told, rather than being handed a short list that looks complete.
 *
 * @param {(params: object) => Promise<{items: any[], page: number, pages: number, total: number}>} fetchPage
 * @param {object} [options]
 * @param {number} [options.limit]     records per request
 * @param {number} [options.maxPages]  how many requests this is allowed to make
 * @param {object} [options.params]    passed through to every request
 * @returns {Promise<{items: any[], total: number, pages: number, truncated: boolean}>}
 */
export async function collectPages(fetchPage, { limit = 100, maxPages = 20, params = {} } = {}) {
    const items = []
    let page = 1
    let pages = 1
    let total = 0
    let metadataIssue = false

    do {
        const response = await fetchPage({ ...params, page, limit })
        const batch = Array.isArray(response?.items) ? response.items : []
        items.push(...batch)

        const valid = response?.metadataValid !== false
            && Number.isInteger(response?.page) && response.page === page
            && Number.isInteger(response?.pages) && response.pages >= page
            && Number.isInteger(response?.total) && response.total >= 0
            && Number.isInteger(response?.limit) && response.limit >= 1
        if (!valid) metadataIssue = true

        if (Number.isInteger(response?.pages) && response.pages >= 1) {
            if (response.pages < pages) metadataIssue = true
            pages = Math.max(pages, response.pages)
        }
        if (Number.isInteger(response?.total) && response.total >= 0) {
            if (response.total < total) metadataIssue = true
            total = Math.max(total, response.total)
        }
        if (items.length > total) metadataIssue = true
        page += 1
    } while (page <= pages && page <= maxPages)

    return {
        items,
        total,
        pages,
        truncated: metadataIssue || page <= pages || items.length !== total,
    }
}

export default client
