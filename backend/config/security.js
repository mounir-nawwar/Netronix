// CORS allowlist and Content-Security-Policy (SEC-013, DEVOPS-004).
//
// Both were hardcoded in `app.js`. They are here so the values are validated in
// one place, testable without an HTTP request, and configurable per deployment
// without editing source.
//
// Nothing in this module reads `process.env` at import time — `createApp()`
// passes an environment in — so importing the application still requires no
// configuration at all (B-0).

/** Used when CORS_ORIGINS is not set. Identical to the pre-Phase-1 hardcoded list. */
export const DEFAULT_CORS_ORIGINS = [
    'https://netronixstore.vercel.app',
    'https://netronix-admin.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
]

const isAbsoluteHttpUrl = (value) => {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

/** An origin is scheme + host + port, with no path and no trailing slash. */
const toOrigin = (value) => new URL(value).origin

/**
 * Parse a comma-separated CORS_ORIGINS value.
 *
 * Anything that is not an absolute http(s) URL is dropped rather than passed to
 * `cors`, where a malformed entry would silently never match. `*` is refused
 * outright: a wildcard allowlist is not an allowlist.
 *
 * @returns {{ origins: string[], rejected: string[] }}
 */
export function parseCorsOrigins(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { origins: [...DEFAULT_CORS_ORIGINS], rejected: [] }
    }

    const origins = []
    const rejected = []
    for (const entry of String(raw).split(',')) {
        const candidate = entry.trim()
        if (candidate === '') continue
        if (!isAbsoluteHttpUrl(candidate)) {
            rejected.push(candidate)
            continue
        }
        const origin = toOrigin(candidate)
        if (!origins.includes(origin)) origins.push(origin)
    }
    return { origins, rejected }
}

/**
 * CORS options.
 *
 * `credentials` is deliberately **off**. Authentication travels in a custom
 * `token` header, which a browser never attaches cross-origin on its own —
 * that is precisely why this API has no CSRF exposure today (SEC-021). Turning
 * credentials mode on would buy nothing and would start the cookie clock.
 */
export function corsOptions(origins) {
    const allowed = new Set(origins)
    return {
        origin(origin, callback) {
            // A same-origin or non-browser caller sends no Origin header. There
            // is nothing to check and nothing to leak, so it passes.
            if (!origin) return callback(null, true)
            callback(null, allowed.has(origin))
        },
        credentials: false,
        // Every method the API actually routes. `PATCH` is here because
        // `PATCH /api/product/:id` exists (ADM-002) — and omitting it was
        // invisible to the entire server-side suite, because Supertest issues
        // no preflight. A browser does: the console's save failed with
        // `net::ERR_FAILED` and no request ever reached a handler. If a method
        // is added to a route, it belongs in this list.
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        // `Idempotency-Key` is here because the storefront sends one on every
        // checkout (DB-012). A request header the allow-list omits is refused
        // at preflight, so the order request would never leave the browser —
        // the same invisible-to-the-server failure `PATCH` had.
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'token', 'Idempotency-Key'],
    }
}

/** Hosts the storefront genuinely loads from. Anything else the CSP refuses. */
const SPLINE_FRAME = 'https://my.spline.design'
const SPLINE_ASSETS = 'https://prod.spline.design'
const SPLINE_VIEWER_CDN = 'https://unpkg.com'
const CLOUDINARY = 'https://res.cloudinary.com'
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com'
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com'

/**
 * Content-Security-Policy directives.
 *
 * `script-src` has **no `'unsafe-inline'`**. That is the whole point of the
 * directive here: a policy that permits inline script would not have contained
 * SEC-004, and adding it "so the build works" would make the header decorative.
 * The Spline viewer is loaded from unpkg as an external file, so it does not
 * need one.
 *
 * `style-src` does carry `'unsafe-inline'`, and that is a real, narrower
 * concession: Tailwind's generated utilities and framer-motion both set inline
 * `style` attributes on elements at runtime, and the Google Fonts stylesheet is
 * injected by an `@import`. Inline *style* cannot execute script.
 *
 * @param {string[]} apiOrigins Origins the browser is allowed to call.
 */
export function cspDirectives(apiOrigins = []) {
    const api = apiOrigins.filter(Boolean)
    return {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'", SPLINE_VIEWER_CDN],
        styleSrc: ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
        fontSrc: ["'self'", 'data:', GOOGLE_FONTS_FILES],
        imgSrc: ["'self'", 'data:', 'blob:', CLOUDINARY],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        frameSrc: ["'self'", SPLINE_FRAME, SPLINE_ASSETS],
        connectSrc: ["'self'", SPLINE_ASSETS, SPLINE_VIEWER_CDN, ...api],
        workerSrc: ["'self'", 'blob:'],
    }
}

/**
 * Helmet options.
 *
 * `crossOriginEmbedderPolicy` stays off: COEP would refuse to embed the Spline
 * iframe, which is the storefront's signature interaction.
 * `crossOriginResourcePolicy` is `cross-origin` because the API is called from
 * the storefront and admin origins, which are not the API's own.
 */
export function helmetOptions({ apiOrigins = [] } = {}) {
    return {
        contentSecurityPolicy: { useDefaults: false, directives: cspDirectives(apiOrigins) },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }
}

export { SPLINE_FRAME, SPLINE_ASSETS, SPLINE_VIEWER_CDN, CLOUDINARY, GOOGLE_FONTS_CSS, GOOGLE_FONTS_FILES }
