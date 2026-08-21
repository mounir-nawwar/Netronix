// BE-014 — a health endpoint that means something.
//
// `GET /` answered the string "API Working" whatever state the process was in.
// It was served by Express before any database work, so it returned 200 with
// MongoDB unreachable, mid-failover, or never connected at all — which is
// exactly the situation a health check exists to detect. A load balancer
// reading it would keep routing traffic to an instance that could not serve a
// single request.
//
// This one pings the database and reports what it finds:
//
//   * **200** only when `db.admin().ping()` succeeds.
//   * **503** when it does not — unreachable, disconnected, or slower than the
//     timeout, because a database that takes four seconds to answer a ping is
//     not ready either.
//
// What it does **not** expose (SEC-016): no connection string, no host, no
// database name, no driver error text, no version, no uptime, no counts.
// Everything in the body is a fixed vocabulary. A health endpoint is
// unauthenticated by design, so anything it prints is public.
//
// The Mongoose instance is injected so Supertest can drive every branch
// in-process without opening a port or a real connection.

import { Router } from 'express'
import mongoose from 'mongoose'

/** Longer than a healthy ping, shorter than any sensible probe interval. */
export const PING_TIMEOUT_MS = 2000

const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms)
        // Never hold the process open for a probe.
        timer.unref?.()
    }),
])

/**
 * @param {object}  [options]
 * @param {object}  [options.connection]  A Mongoose connection; defaults to the
 *                                        process-wide one.
 * @param {number}  [options.timeoutMs]
 */
export function createHealthRouter({ connection = mongoose.connection, timeoutMs = PING_TIMEOUT_MS } = {}) {
    const router = Router()

    router.get('/health', async (req, res) => {
        // 1 === connected. Anything else (0 disconnected, 2 connecting,
        // 3 disconnecting) is not ready, and pinging through it would hang
        // until the driver's own buffer timeout rather than answering now.
        const connected = connection?.readyState === 1

        let database = 'unavailable'
        if (connected) {
            try {
                await withTimeout(connection.db.admin().ping(), timeoutMs)
                database = 'ok'
            } catch {
                // Deliberately swallowed: the driver's message can carry the
                // connection string, and the outcome is the whole signal.
                database = 'unavailable'
            }
        }

        const ready = database === 'ok'
        res.status(ready ? 200 : 503).json({
            status: ready ? 'ok' : 'degraded',
            // Liveness is implicit — this handler ran. Readiness is the
            // question worth answering separately.
            live: true,
            ready,
            checks: { database },
        })
    })

    return router
}

export default createHealthRouter()
