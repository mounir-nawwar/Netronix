// Typed application errors (SEC-009, SEC-010).
//
// Every failure the API can produce deliberately maps to one of these, so that
// a controller never has to decide a status code inline and never has to decide
// what is safe to tell a client. Two properties carry that decision:
//
//   * `status`  — the real HTTP status. Phase 0 returned 200 for everything.
//   * `message` — the *client-facing* text. It is written for a stranger:
//                 no identifiers, no paths, no library internals. Anything
//                 useful for debugging goes in `details`, which is logged
//                 server-side and never serialised into a response.
//
// The central handler in middleware/errorHandler.js is the only place that
// turns one of these into a response.

export class AppError extends Error {
    /**
     * @param {string} message  Client-safe text.
     * @param {object} [options]
     * @param {number} [options.status] HTTP status.
     * @param {string} [options.code]   Stable machine-readable code.
     * @param {object} [options.details] Server-side only. Never sent to a client.
     * @param {object} [options.fields]  Field-level validation errors (safe to send).
     */
    constructor(message, { status = 500, code = 'INTERNAL_ERROR', details, fields } = {}) {
        super(message)
        this.name = new.target.name
        this.status = status
        this.code = code
        this.details = details
        this.fields = fields
        this.isAppError = true
        Error.captureStackTrace?.(this, new.target)
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Invalid request', { fields, details } = {}) {
        super(message, { status: 400, code: 'VALIDATION_FAILED', fields, details })
    }
}

/** 401 — the caller is not authenticated (absent, malformed, expired, revoked). */
export class AuthenticationError extends AppError {
    constructor(message = 'Authentication required', { details, code = 'UNAUTHENTICATED' } = {}) {
        super(message, { status: 401, code, details })
    }
}

/** 403 — authenticated, but not allowed. Wrong role lands here, never on 401. */
export class AuthorizationError extends AppError {
    constructor(message = 'Not permitted', { details } = {}) {
        super(message, { status: 403, code: 'FORBIDDEN', details })
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Not found', { details } = {}) {
        super(message, { status: 404, code: 'NOT_FOUND', details })
    }
}

export class ConflictError extends AppError {
    constructor(message = 'Conflict', { details } = {}) {
        super(message, { status: 409, code: 'CONFLICT', details })
    }
}

export class PayloadTooLargeError extends AppError {
    constructor(message = 'Request payload is too large', { details } = {}) {
        super(message, { status: 413, code: 'PAYLOAD_TOO_LARGE', details })
    }
}

export class UnprocessableError extends AppError {
    constructor(message = 'Request could not be processed', { details } = {}) {
        super(message, { status: 422, code: 'UNPROCESSABLE', details })
    }
}

export class RateLimitError extends AppError {
    constructor(message = 'Too many requests. Please try again later.', { details } = {}) {
        super(message, { status: 429, code: 'RATE_LIMITED', details })
    }
}

/**
 * The single authentication-failure response (SEC-020).
 *
 * Unknown address, wrong password and a disabled account must be
 * indistinguishable — same status, same body — or the endpoint enumerates the
 * user base for anyone willing to make two requests.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password'

export class InvalidCredentialsError extends AppError {
    constructor({ details } = {}) {
        super(INVALID_CREDENTIALS_MESSAGE, { status: 401, code: 'INVALID_CREDENTIALS', details })
    }
}

/**
 * Wrap an async route handler so a rejected promise reaches the central error
 * middleware instead of hanging the request. Express 4 does not do this itself.
 *
 * The wrapper takes the wrapped function's name. Express records `fn.name` on
 * every layer of its routing table, so without this the whole middleware stack
 * would introspect as anonymous — which would make stack traces harder to read
 * and would silently defeat the route-coverage check in
 * test/security/auth-boundaries.test.js that walks the stack looking for
 * `authUser` and `adminAuth`.
 */
export const asyncHandler = (handler) => {
    const wrapped = (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
    if (handler.name) Object.defineProperty(wrapped, 'name', { value: handler.name, configurable: true })
    return wrapped
}
