// DEVOPS-005 — optional error telemetry, disabled by default.
//
// **This phase does not connect to Sentry.** It cannot: doing so needs a real
// DSN, which is a credential, and an account, which is an external operator
// decision. What it does is make the integration a one-variable change that is
// already tested, so enabling it later is configuration rather than
// development.
//
// The rules this file enforces:
//
//   * **No DSN, no telemetry.** With `SENTRY_DSN` unset — which is every state
//     this repository ships in — `initTelemetry()` returns a disabled handle
//     and `captureException` is a no-op. Nothing is imported, nothing is
//     constructed, and no socket is opened.
//   * **The SDK is injected, never imported at module scope.** Tests pass a
//     stub and assert what would have been sent; the real `@sentry/node` is
//     not a dependency of this repository at all, so `npm ci` installs nothing
//     that can phone home.
//   * **Payloads go through the same redaction as the logs.** An exception
//     report that carries the request body is a credential leak with a
//     different name on it.
//
// What remains genuinely blocked and is recorded as such rather than pretended:
// creating the Sentry project, holding the DSN, and setting an OpenAI spend
// alert are all operator actions against third-party accounts.

import { REDACTED } from './logger.js'

const SENSITIVE_KEY = /^(token|password|authorization|api[-_]?key|secret|jwt|cookie|idempotency[-_]?key|mongodb_uri|.*_secret_key)$/i

/** Deep-copy a value, replacing anything that looks sensitive. */
export function scrub(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object') return value
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    if (Array.isArray(value)) return value.map((item) => scrub(item, seen))

    const out = {}
    for (const [key, item] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrub(item, seen)
    }
    return out
}

/**
 * @param {object}   [options]
 * @param {object}   [options.env]  Defaults to `process.env`.
 * @param {object}   [options.sdk]  An object shaped like `@sentry/node`
 *                                  (`init`, `captureException`). Injected in
 *                                  tests; absent in production until an
 *                                  operator adds the dependency.
 * @param {object}   [options.logger]
 */
export function initTelemetry({ env = process.env, sdk = null, logger = console } = {}) {
    const dsn = env.SENTRY_DSN?.trim()

    if (!dsn) {
        return {
            enabled: false,
            reason: 'SENTRY_DSN is not set',
            captureException() { /* deliberately nothing */ },
        }
    }

    if (!sdk || typeof sdk.init !== 'function') {
        // Configured but with no SDK present. Failing loudly here would take
        // the API down over an observability feature; running blind would hide
        // that the operator's configuration did nothing.
        logger.warn?.('SENTRY_DSN is set but no Sentry SDK was provided — telemetry is off.')
        return {
            enabled: false,
            reason: 'no SDK provided',
            captureException() { },
        }
    }

    sdk.init({
        dsn,
        environment: env.NODE_ENV ?? 'development',
        // Never ship request bodies or headers by default.
        sendDefaultPii: false,
        beforeSend: (event) => scrub(event),
    })

    return {
        enabled: true,
        reason: null,
        captureException(error, context = {}) {
            sdk.captureException(error, { extra: scrub(context) })
        },
    }
}

/** The process handle. Disabled unless `SENTRY_DSN` is set *and* an SDK is injected. */
const telemetry = initTelemetry()

export default telemetry
