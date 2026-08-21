// BE-011 — one log line per request, correlated with the id `requestId`
// already puts on the response.
//
// `pino-http` is configured rather than defaulted in two ways that matter:
//
//   * `genReqId` returns `req.id`, which `middleware/requestId.js` has already
//     set and already echoed in `X-Request-Id`. Letting pino generate its own
//     would produce two different ids for the same request — one in the logs,
//     one in the customer's error message — which is worse than none.
//   * `autoLogging.ignore` drops `/health`. A readiness probe hitting it every
//     few seconds would otherwise be almost the entire log volume, and its
//     outcome is already visible in the response code the prober records.

import pinoHttp from 'pino-http'

import logger from '../lib/logger.js'

// `pino-http` installs its own `req`/`res` serializers over whatever the
// logger carries, and its default `req` serializer logs `req.url` **with the
// query string**. A query string is a place a token ends up — from a mistaken
// link, a copied URL, a third-party redirect — so the path is logged and the
// query is dropped.
const serializers = {
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
}

export function createRequestLogger({ logger: instance = logger } = {}) {
    return pinoHttp({
        logger: instance,
        genReqId: (req) => req.id,
        serializers,
        // Client errors are the caller's fault and are not warnings about the
        // service; server errors are.
        customLogLevel(req, res, error) {
            if (error || res.statusCode >= 500) return 'error'
            if (res.statusCode >= 400) return 'warn'
            return 'info'
        },
        customSuccessMessage(req, res) {
            return `${req.method} ${String(req.url ?? '').split('?')[0]} ${res.statusCode}`
        },
        autoLogging: {
            ignore: (req) => req.url === '/health',
        },
    })
}

export default createRequestLogger()
