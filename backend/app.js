// Express application wiring.
//
// This file is deliberately free of startup side effects so that Supertest can
// import it in-process: it does not call `listen()`, does not connect to
// MongoDB, does not configure Cloudinary, and reads no *required* environment
// variable at module scope. `server.js` owns all of that.
//
// Middleware order matters and is stated once, here:
//
//   requestId → request logger → health → helmet → CORS → global rate limit
//   → body parsing (100 KB) → operator-key guard → routers → 404
//   → central error handler
//
// The correlation id is first because every later layer, including the error
// handler and the logger, refers to it. The request logger is second so that a
// request rejected by *any* later layer — a rate limit, a CORS preflight, an
// oversized body — still produces a log line; a logger mounted after the
// guards only ever sees the requests that got through them, which is the
// opposite of what an operator needs.
//
// `/health` sits ahead of the rate limiter deliberately (BE-014): a readiness
// probe running every few seconds must not be able to exhaust the global
// budget and start reporting the service as down because it asked too often.
// It is a fixed vocabulary with no inputs, so it is not a surface worth
// budgeting.
//
// The central error handler is last, because in Express that is the only
// position from which it can see an error raised anywhere above it.

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'

import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import chatbotRouter from './routes/chatbotRoute.js'

import healthRouter from './routes/healthRoute.js'

import requestId from './middleware/requestId.js'
import requestLogger from './middleware/requestLogger.js'
import { rejectOperatorKeys } from './middleware/validate.js'
import { globalLimiter } from './middleware/rateLimit.js'
import errorHandler, { notFoundHandler } from './middleware/errorHandler.js'
import { corsOptions, helmetOptions, parseCorsOrigins } from './config/security.js'

/** The JSON body ceiling (SEC-011). Nothing this API legitimately accepts comes near it. */
export const JSON_BODY_LIMIT = '100kb'

/**
 * @param {object}  [options]
 * @param {object}  [options.env]  Environment to read CORS_ORIGINS from.
 *                                 Defaults to `process.env`; absent or empty
 *                                 falls back to the documented default list.
 * @param {object}  [options.health] A health router; injected by tests that
 *                                  need to drive the unavailable branch.
 */
export function createApp({ env = process.env, health = healthRouter } = {}) {
    const app = express()

    // Express's default `X-Powered-By` is removed by helmet, but disabling it
    // explicitly means it is never set even for the handful of responses that
    // short-circuit before helmet runs.
    app.disable('x-powered-by')

    const { origins } = parseCorsOrigins(env?.CORS_ORIGINS)

    app.use(requestId)
    app.use(requestLogger)
    app.use(health)

    // PERF-005 — the API shipped every response uncompressed. Measured with
    // Lighthouse against the built storefront, `GET /api/product/list` was
    // **266 kB — the largest single resource on every page**, larger than the
    // React vendor chunk, on all three of home, product and cart. JSON of that
    // shape compresses roughly seven to one.
    //
    // Mounted after the health probe so a readiness check stays a fixed-cost
    // response, and before helmet and the routers so it covers everything they
    // emit, error responses included.
    app.use(compression())

    app.use(helmet(helmetOptions({ apiOrigins: origins })))
    app.use(cors(corsOptions(origins)))
    app.use(globalLimiter)
    app.use(express.json({ limit: JSON_BODY_LIMIT }))
    app.use(rejectOperatorKeys)

    // api endpoints
    app.use('/api/user', userRouter)
    app.use('/api/product', productRouter)
    app.use('/api/cart', cartRouter)
    app.use('/api/order', orderRouter)
    app.use('/api/chatbot', chatbotRouter)

    app.get('/', (req, res) => {
        res.send('API Working')
    })

    app.use(notFoundHandler)
    app.use(errorHandler)

    return app
}

// A configured, ready-to-mount application. Importing this does not start a
// listener or open a database connection.
const app = createApp()

export default app
