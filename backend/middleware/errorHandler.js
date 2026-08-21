// The single place an error becomes a response (SEC-009, SEC-010).
//
// Rules, in order of importance:
//   1. Nothing internal escapes. No stack, no file path, no `error.message`
//      from a library, no Mongoose `CastError`, no body-parser `SyntaxError`.
//   2. Every outcome gets a real status code. Phase 0 answered 200 to
//      everything, including authentication failures.
//   3. The response always carries the correlation id, so a report of "it said
//      something went wrong" is still actionable.
//
// The success envelope is unchanged: `{ success: false, message }` is what both
// clients already branch on. Only the status code and the *content* of
// `message` change.

import multer from 'multer'

import { AppError, PayloadTooLargeError, ValidationError } from '../errors/AppError.js'
import defaultLogger from '../lib/logger.js'
import telemetry from '../lib/telemetry.js'

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

/** Multer's own error codes, mapped to a status and a client-safe sentence. */
const MULTER_MESSAGES = {
    LIMIT_FILE_SIZE: ['Each image must be 5 MB or smaller', 413],
    LIMIT_FILE_COUNT: ['Too many files', 400],
    LIMIT_UNEXPECTED_FILE: ['Unexpected file field', 400],
    LIMIT_PART_COUNT: ['Too many parts in the upload', 400],
    LIMIT_FIELD_KEY: ['Field name is too long', 400],
    LIMIT_FIELD_VALUE: ['Field value is too long', 400],
    LIMIT_FIELD_COUNT: ['Too many fields', 400],
}

/**
 * Normalise anything thrown anywhere into `{ status, message, fields, logName }`.
 * Errors that are not `AppError`s are treated as untrusted: their text is
 * logged, never returned.
 */
export function classifyError(error) {
    if (error instanceof AppError || error?.isAppError) {
        return { status: error.status, message: error.message, fields: error.fields, code: error.code }
    }

    if (error instanceof multer.MulterError) {
        const [message, status] = MULTER_MESSAGES[error.code] ?? ['Upload rejected', 400]
        return { status, message, code: `UPLOAD_${error.code}` }
    }

    // body-parser: oversized JSON (SEC-011 companion to the 100 KB limit).
    if (error?.type === 'entity.too.large') {
        const tooLarge = new PayloadTooLargeError()
        return { status: tooLarge.status, message: tooLarge.message, code: tooLarge.code }
    }

    // body-parser: malformed JSON. Returning `error.message` here leaked the
    // raw SyntaxError, character offset included.
    if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
        const invalid = new ValidationError('Malformed request body')
        return { status: invalid.status, message: invalid.message, code: invalid.code }
    }

    // Mongoose. A CastError names the model, the path and the offending value.
    if (error?.name === 'CastError' || error?.name === 'ValidationError' || error?.name === 'StrictModeError') {
        const invalid = new ValidationError('Invalid request')
        return { status: invalid.status, message: invalid.message, code: invalid.code }
    }

    if (error?.code === 11000) {
        return { status: 409, message: 'That record already exists', code: 'DUPLICATE_KEY' }
    }

    return { status: 500, message: GENERIC_MESSAGE, code: 'INTERNAL_ERROR' }
}

/**
 * Server-side log line. Deliberately structured and deliberately narrow: the
 * request body, the headers and the query string are never logged, because all
 * three carry credentials on the routes that matter most (SEC-016).
 */
function logError(error, req, classified, logger) {
    // BE-011 — this was `JSON.stringify`d by hand into `console.error`. It is
    // a structured pino line now, on the request's own child logger where one
    // exists, so it carries the correlation id without being told it.
    const line = {
        event: 'request.error',
        requestId: req.id,
        method: req.method,
        route: req.originalUrl?.split('?')[0],
        status: classified.status,
        code: classified.code,
        name: error?.name,
        detail: error?.details ?? error?.message,
    }

    const target = req.log ?? logger
    if (classified.status >= 500) {
        target.error({ ...line, err: error }, classified.code ?? 'request failed')
        // DEVOPS-005 — a no-op unless an operator configured Sentry.
        telemetry.captureException(error, { requestId: req.id, route: line.route })
    } else {
        target.warn(line, classified.code ?? 'request rejected')
    }
}

/** Unmatched route. Kept as JSON so no HTML error page ever ships. */
export function notFoundHandler(req, res) {
    res.status(404).json({ success: false, message: 'Not found', requestId: req.id })
}

export function createErrorHandler({ logger = defaultLogger } = {}) {
    // Express identifies an error handler by arity: all four parameters are
    // required even though `next` is only used for the headers-sent case.
    // eslint-disable-next-line no-unused-vars
    return function errorHandler(error, req, res, next) {
        const classified = classifyError(error)
        logError(error, req, classified, logger)

        if (res.headersSent) return next(error)

        const body = { success: false, message: classified.message, requestId: req.id }
        if (classified.fields) body.errors = classified.fields

        res.status(classified.status).json(body)
    }
}

export default createErrorHandler()
export { GENERIC_MESSAGE }
