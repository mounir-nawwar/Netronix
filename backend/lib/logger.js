// BE-011 / SEC-016 / DEVOPS-005 — structured, correlated, redacted logging.
//
// What this replaces: 43 `console.*` calls, unstructured, uncorrelated, and in
// several cases carrying secret material — a masked-but-recoverable OpenAI key
// at boot, a full Cloudinary upload result (which includes a signed URL), and
// `console.log(productData)`. There was no way to follow one request through
// them, and no way to be confident none of them printed a token.
//
// Three properties, in order of importance:
//
//   1. **Redaction is a property of the logger, not of the call site.** Every
//      call site is a place a token can leak, so a rule that has to be
//      remembered is a rule that will be forgotten. `pino`'s `redact` runs on
//      the serialised object regardless of who logged it, and the paths below
//      cover the shapes this API actually handles — including nested ones,
//      because `req.headers.token` is where this project's auth token lives.
//   2. **Every line carries the request id.** `pino-http` attaches a child
//      logger to `req.log`, so a handler logs without knowing about
//      correlation at all.
//   3. **Nothing here reaches the network.** The transport is stdout. Sentry
//      is separate, off by default, and injected (`lib/telemetry.js`).
//
// Test logs go nowhere by default (`level: 'silent'` under NODE_ENV=test), so
// a passing suite is not thousands of lines of JSON — but the redaction tests
// build a logger with a capturing stream and assert against real output rather
// than against the configuration.

import pino from 'pino'

/**
 * Paths whose value is replaced with `[REDACTED]`.
 *
 * `*` matches one level, so `*.password` covers `body.password` and
 * `user.password` alike without enumerating every container. Both the
 * lower-case and the canonical header spellings are listed because Node
 * lower-cases incoming headers but code that constructs a log object by hand
 * does not.
 */
export const REDACT_PATHS = [
    'token',
    'password',
    'authorization',
    'apiKey',
    'api_key',
    'secret',
    'jwt',
    'idempotencyKey',

    'req.headers.token',
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["idempotency-key"]',
    'res.headers["set-cookie"]',

    '*.token',
    '*.password',
    '*.authorization',
    '*.apiKey',
    '*.api_key',
    '*.secret',
    '*.jwt',
    '*.accessToken',
    '*.refreshToken',
    '*.GROQ_API_KEY',
    '*.JWT_SECRET',
    '*.CLOUDINARY_API_KEY',
    '*.CLOUDINARY_SECRET_KEY',
    '*.MONGODB_URI',

    '*.*.token',
    '*.*.password',
    '*.*.authorization',
    '*.*.apiKey',
    '*.*.secret',
]

export const REDACTED = '[REDACTED]'

function defaultLevel(env) {
    if (env.LOG_LEVEL) return env.LOG_LEVEL
    if (env.NODE_ENV === 'test') return 'silent'
    if (env.NODE_ENV === 'production') return 'info'
    return 'debug'
}

/**
 * Build a logger.
 *
 * @param {object} [options]
 * @param {object} [options.env]          Defaults to `process.env`.
 * @param {object} [options.destination]  A writable stream; defaults to stdout.
 */
export function createLogger({ env = process.env, destination } = {}) {
    return pino(
        {
            level: defaultLevel(env),
            base: { service: 'netronix-api' },
            redact: { paths: REDACT_PATHS, censor: REDACTED },
            // A URL can carry a token in its query string. Only the path is
            // logged, never the query.
            serializers: {
                req(req) {
                    return {
                        id: req.id,
                        method: req.method,
                        path: String(req.url ?? '').split('?')[0],
                    }
                },
                res(res) {
                    return { statusCode: res.statusCode }
                },
                err: pino.stdSerializers.err,
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        destination,
    )
}

/** The process-wide logger. Importing it starts nothing and connects to nothing. */
const logger = createLogger()

export default logger
