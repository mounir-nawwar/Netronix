// Rate limiting (SEC-005, SEC-011, SEC-023).
//
// Phase 0 had no limiter anywhere. The chatbot in particular is public,
// unauthenticated, and bills a third-party API per request with the whole
// catalog in the prompt — a scripted loop was an open, unbounded financial
// exposure. These are the policies from the remediation plan:
//
//   auth (register/login/admin)   5 per 15 minutes per IP
//   chatbot                      10 per minute per IP
//   guest checkout                3 per hour per IP
//   everything                  100 per minute per IP
//
// Two design notes:
//
//   * Every limiter owns an explicit `MemoryStore` that this module keeps a
//     reference to, so `resetRateLimits()` can clear all of them between tests.
//     That is what makes "the 6th login is 429" a deterministic assertion
//     instead of a test-order dependency. It changes nothing about the
//     production policy — the windows and maxima are the same object either way.
//   * Exceeding a limit is routed through the normal error pipeline
//     (`RateLimitError` → central handler) so a 429 body looks like every other
//     failure and carries a correlation id.

import { rateLimit, MemoryStore } from 'express-rate-limit'

import { RateLimitError } from '../errors/AppError.js'

const MINUTE = 60 * 1000

/** Policy table. Exported so the tests assert against one source of truth. */
export const RATE_LIMITS = {
    global: { windowMs: MINUTE, max: 100 },
    auth: { windowMs: 15 * MINUTE, max: 5 },
    chatbot: { windowMs: MINUTE, max: 10 },
    guestOrder: { windowMs: 60 * MINUTE, max: 3 },
}

/** Every store handed out, so a test can reset all of them at once. */
const stores = new Set()

/**
 * Drop all counters. Called from the test setup file before every test.
 * Never called by the application.
 */
export function resetRateLimits() {
    for (const store of stores) store.resetAll?.()
}

function build({ windowMs, max }, message) {
    const store = new MemoryStore()
    stores.add(store)
    return rateLimit({
        windowMs,
        limit: max,
        store,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        // Delegating to `next` keeps 429 on the same path as every other
        // failure: real status, generic message, correlation id.
        handler: (req, res, next) => next(new RateLimitError(message)),
    })
}

/**
 * The four limiters, built once per process.
 *
 * They are module singletons rather than per-`createApp()` instances so that a
 * route file can simply import the one it needs. Two apps in the same process
 * therefore share counters — which only ever happens in tests, where
 * `resetRateLimits()` runs before each test anyway.
 */
export const globalLimiter = build(
    RATE_LIMITS.global,
    'Too many requests. Please slow down and try again shortly.',
)

export const authLimiter = build(
    RATE_LIMITS.auth,
    'Too many authentication attempts. Please try again later.',
)

export const chatbotLimiter = build(
    RATE_LIMITS.chatbot,
    'Too many chat messages. Please wait a moment.',
)

export const guestOrderLimiter = build(
    RATE_LIMITS.guestOrder,
    'Too many orders from this address. Please try again later.',
)
