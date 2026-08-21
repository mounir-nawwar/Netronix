// Request validation (BE-003, SEC-006).
//
// Before Phase 1 the API used `validator` exactly once and trusted everything
// else, so a JSON object arrived where a string was expected and went straight
// into a Mongo query. Two layers replace that:
//
//   1. `rejectOperatorKeys` — a cheap structural guard that refuses any key
//      beginning with `$` or containing `.` anywhere in the body, query or
//      params. It is defence in depth, not the boundary.
//   2. `validate(schemas)` — the boundary. A zod schema per endpoint, run
//      before the controller. A controller reads `req.validated`, never
//      `req.body`, so an unvalidated field cannot be reached by accident.
//
// Failures are `ValidationError`s: real 400, generic message, field-level
// detail (safe — it names the field and the rule, never the value).

import { ValidationError } from '../errors/AppError.js'

/** Depth cap: a hostile body could otherwise be a very deep object. */
const MAX_SCAN_DEPTH = 12

function findOperatorKey(value, depth = 0) {
    if (depth > MAX_SCAN_DEPTH || value === null || typeof value !== 'object') return null
    if (Array.isArray(value)) {
        for (const entry of value) {
            const found = findOperatorKey(entry, depth + 1)
            if (found) return found
        }
        return null
    }
    for (const [key, entry] of Object.entries(value)) {
        if (key.startsWith('$') || key.includes('.')) return key
        const found = findOperatorKey(entry, depth + 1)
        if (found) return found
    }
    return null
}

/**
 * Refuse MongoDB operator objects and dotted paths outright.
 *
 * `{"email": {"$ne": null}}` never reaches a schema, a controller, or a query.
 * Nothing legitimate in this API sends a `$`-prefixed or dotted key: variant
 * keys are values, not keys, and are validated separately (SEC-018).
 */
export function rejectOperatorKeys(req, res, next) {
    for (const source of ['body', 'query', 'params']) {
        const offender = findOperatorKey(req[source])
        if (offender) {
            return next(new ValidationError('Invalid request', {
                fields: { [source]: ['contains a disallowed key'] },
                details: `rejected key "${offender}" in ${source}`,
            }))
        }
    }
    next()
}

/**
 * Build validation middleware from a map of zod schemas.
 *
 * @param {{ body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny,
 *           query?: import('zod').ZodTypeAny, headers?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas = {}) {
    const sources = Object.keys(schemas)

    return function validateRequest(req, res, next) {
        const validated = {}
        const fields = {}
        let failed = false

        for (const source of sources) {
            // Express 5 makes req.query a getter; reading a copy keeps this
            // working on both 4 and 5.
            const input = source === 'headers' ? req.headers : req[source]
            const result = schemas[source].safeParse(input ?? {})

            if (result.success) {
                validated[source] = result.data
                continue
            }

            failed = true
            for (const issue of result.error.issues) {
                const path = issue.path.length ? issue.path.join('.') : source
                const key = sources.length > 1 && source !== 'body' ? `${source}.${path}` : path
                ;(fields[key] ??= []).push(issue.message)
            }
        }

        if (failed) return next(new ValidationError('Invalid request', { fields }))

        req.validated = { ...(req.validated ?? {}), ...validated }
        next()
    }
}

export default validate
