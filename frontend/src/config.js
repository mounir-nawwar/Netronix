// Client configuration (DEVOPS-002).
//
// Everything here ends up in the browser bundle. Vite inlines any `VITE_`
// prefixed variable at build time, so this module can only ever hold public
// values — and it actively refuses to carry anything that looks like a server
// secret, so a mistaken `VITE_JWT_SECRET=…` fails loudly instead of shipping.
//
// Without this, a missing VITE_BACKEND_URL produced requests to
// "undefined/api/product/list" and a storefront that looked merely empty
// (FE-008). Now it says what is wrong.

// PERF-003 — this module used to validate its two variables with `zod`.
//
// It was correct and it was expensive. `zod` is a static import of the entry
// chunk, because `api/client.js` imports `backendUrl` from here and every page
// goes through that client, so **12.5 kB gzip of schema library sat in front of
// the first paint of every route** to check that two strings are http(s) URLs.
// Lighthouse measured it as its own `vendor-schema` request on the critical
// path of home, product and cart alike.
//
// The rules below are the same four rules, in the same order, producing the
// same messages — required, parseable as an absolute URL, http(s) only,
// trailing slashes stripped — and `src/test/config.test.js` is unchanged, so
// the behaviour is pinned by the tests that were written against the schema.
// Nothing else in the storefront imports `zod`.

/**
 * Names that must never be exposed to a browser. Matched against the whole
 * variable name, so `VITE_OPENAI_API_KEY` is caught as readily as `JWT_SECRET`.
 */
const SERVER_ONLY_PATTERNS = [
    /SECRET/i,
    /PASSWORD/i,
    /PASSWD/i,
    /\bJWT\b/i,
    /MONGO/i,
    /CLOUDINARY/i,
    /OPENAI/i,
    /API_KEY/i,
    /ACCESS_KEY/i,
    /PRIVATE/i,
    /CREDENTIAL/i,
]

const NOT_ABSOLUTE = 'must be an absolute URL, for example http://localhost:4000'
const NOT_HTTP = 'must use http:// or https://'

/**
 * An absolute http(s) URL, or the reason it is not one.
 *
 * The two checks are separate on purpose and stay in this order: `ftp://host`
 * parses perfectly well and is still wrong for this variable, so it earns the
 * scheme message rather than the "absolute URL" one.
 *
 * @returns {string|null} the problem, or `null` when the value is acceptable
 */
function httpUrlProblem(value) {
    const trimmed = String(value).trim()
    try {
        new URL(trimmed)
    } catch {
        return NOT_ABSOLUTE
    }
    return /^https?:\/\//i.test(trimmed) ? null : NOT_HTTP
}

/** The variables this client reads, and whether it can start without one. */
const FIELDS = {
    VITE_BACKEND_URL: { required: true },
    VITE_FRONTEND_URL: { required: false },
}

export class ClientConfigError extends Error {
    constructor(problems) {
        super(
            'Invalid storefront configuration.\n' +
            problems.map((p) => `  - ${p.variable}: ${p.message}`).join('\n') +
            '\n\nSee frontend/.env.example. Restart the dev server after editing .env.',
        )
        this.name = 'ClientConfigError'
        this.problems = problems
    }
}

/** Trailing slashes would produce "http://host//api/…" once a path is appended. */
const stripTrailingSlash = (value) => value.replace(/\/+$/, '')

/**
 * Validate a client environment object.
 * Exported separately from the singleton below so it can be tested directly.
 */
export function readClientConfig(env = {}) {
    // Only VITE_-prefixed keys are inspected, because only those are inlined
    // into the bundle by Vite — an unprefixed variable is invisible to the
    // browser. (Under vitest, `import.meta.env` also carries the whole shell
    // environment, which is a test-runner artifact and never ships.)
    const secretLeaks = Object.keys(env)
        .filter((key) => key.startsWith('VITE_'))
        .filter((key) => SERVER_ONLY_PATTERNS.some((pattern) => pattern.test(key)))
        .map((key) => ({
            variable: key,
            message:
                'looks like a server-only value. Anything readable here is readable by every visitor — move it to backend/.env.',
        }))

    if (secretLeaks.length > 0) throw new ClientConfigError(secretLeaks)

    // Every problem is collected before anything is thrown, so a misconfigured
    // environment is reported once and in full rather than one variable per
    // restart.
    const problems = []
    const values = {}
    for (const [variable, { required }] of Object.entries(FIELDS)) {
        const raw = env[variable]
        // An empty or whitespace-only value is absent, not invalid: a `.env`
        // line left as `VITE_BACKEND_URL=` is a variable nobody filled in.
        if (raw === undefined || String(raw).trim() === '') {
            if (required) problems.push({ variable, message: 'is required' })
            continue
        }
        const problem = httpUrlProblem(raw)
        if (problem) problems.push({ variable, message: problem })
        else values[variable] = String(raw).trim()
    }

    if (problems.length > 0) throw new ClientConfigError(problems)

    return Object.freeze({
        backendUrl: stripTrailingSlash(values.VITE_BACKEND_URL),
        frontendUrl: values.VITE_FRONTEND_URL ? stripTrailingSlash(values.VITE_FRONTEND_URL) : undefined,
    })
}

export const config = readClientConfig(import.meta.env)

export const backendUrl = config.backendUrl
export const frontendUrl = config.frontendUrl

export { SERVER_ONLY_PATTERNS }
