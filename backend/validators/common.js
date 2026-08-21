// Shared validation primitives (BE-003, SEC-006, SEC-019).
//
// Every rule here exists because something reached MongoDB without it.

import { z } from 'zod'

/**
 * A 24-character hex ObjectId.
 *
 * Validating the *format* is what stops `findById('not-an-id')` throwing a
 * Mongoose `CastError` whose text names the model and the value (SEC-009), and
 * it is also the type boundary that makes `{"$ne": null}` impossible here.
 */
export const objectId = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex id')

/** A plain string field with a sane ceiling, so nothing unbounded is stored. */
export const boundedString = (max, label = 'value') =>
    z
        .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
        .trim()
        .min(1, `${label} is required`)
        .max(max, `must be ${max} characters or fewer`)

/**
 * Email.
 *
 * `z.string()` alone defeats the operator injection in SEC-006 — an object is
 * simply not a string. `.email()` is the usability half.
 */
export const email = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .trim()
    .toLowerCase()
    .max(254, 'must be 254 characters or fewer')
    .email('must be a valid email address')

/**
 * Password.
 *
 * The upper bound is not arbitrary: **bcrypt silently truncates at 72 bytes**,
 * so anything longer would give a user the false impression that the extra
 * characters strengthen the hash. The check is on byte length, because a
 * multi-byte character costs more than one byte of the 72 (SEC-019).
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_BYTES = 72

export const password = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .min(PASSWORD_MIN_LENGTH, `must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, {
        message: `must be ${PASSWORD_MAX_BYTES} bytes or fewer (bcrypt truncates beyond that)`,
    })

/** A login password is only ever compared, never hashed — so only the cap applies. */
export const submittedPassword = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .min(1, 'is required')
    .max(1024, 'must be 1024 characters or fewer')

/** Money in the current major-unit representation. Phase 2 moves to minor units. */
export const money = z
    .number({ invalid_type_error: 'must be a number' })
    .finite('must be a finite number')
    .nonnegative('must not be negative')

export const positivePrice = z
    .number({ required_error: 'is required', invalid_type_error: 'must be a number' })
    .finite('must be a finite number')
    .positive('must be greater than zero')
    .max(1_000_000, 'is implausibly large')

export const quantity = z
    .number({ required_error: 'is required', invalid_type_error: 'must be a number' })
    .int('must be a whole number')
    .positive('must be at least 1')
    .max(1000, 'must be 1000 or fewer')

export const stockQuantity = z
    .number({ required_error: 'is required', invalid_type_error: 'must be a number' })
    .int('must be a whole number')
    .nonnegative('must not be negative')
    .max(1_000_000, 'is implausibly large')

/**
 * A variant/inventory key as it is encoded today: option values joined with
 * "-". A product with no variants uses the empty string, which is why the
 * minimum length is zero (BE-006 / DB-003 — the encoding itself is Phase 2).
 *
 * The characters are restricted so a key can never become a Mongo update path
 * segment with meaning: no `.`, no `$`, no whitespace-only oddities (SEC-018).
 * Whether the key actually *exists on the product* is a domain check that needs
 * the document, so it lives in `validators/domain.js`.
 */
export const VARIANT_KEY_PATTERN = /^[A-Za-z0-9 _()+/-]*$/

export const variantKey = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .max(200, 'must be 200 characters or fewer')
    .regex(VARIANT_KEY_PATTERN, 'contains characters that are not allowed in a variant key')

/**
 * The status set the admin console and the storefront both already use, plus
 * `Cancelled` (DB-008).
 *
 * Cancellation had no representation at all: an order could only move forward
 * through fulfilment or be silently rewritten, because `updateStatus` accepted
 * any string. The transition table in `services/orderStatus.js` decides which of
 * these is reachable from which; this list only decides which exist.
 */
export const ORDER_STATUSES = ['Order Placed', 'Packing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']

export const orderStatus = z.enum(ORDER_STATUSES, {
    errorMap: () => ({ message: `must be one of: ${ORDER_STATUSES.join(', ')}` }),
})

/** Payment methods the checkout offers. COD is the only one that is real. */
export const PAYMENT_METHODS = ['COD', 'WHISH']

export const paymentMethod = z
    .enum(PAYMENT_METHODS, { errorMap: () => ({ message: `must be one of: ${PAYMENT_METHODS.join(', ')}` }) })

/** The delivery address the checkout collects. Bounded, but not over-specified. */
export const address = z
    .object({
        firstName: boundedString(100, 'First name'),
        lastName: boundedString(100, 'Last name'),
        email: email,
        street: boundedString(200, 'Street'),
        city: boundedString(100, 'City'),
        state: z.string().trim().max(100).optional().default(''),
        zipcode: z.string().trim().max(30).optional().default(''),
        country: boundedString(100, 'Country'),
        phone: boundedString(40, 'Phone'),
    })
    .strict()

/**
 * A legacy client pricing field.
 *
 * The storefront used to compute the order total in the browser and the server
 * wrote it down verbatim (SEC-002). The storefront no longer sends these, but
 * an older bundle in a cached tab still might, so the schema *accepts* them —
 * and `orderService` never reads them. They are validated only far enough that
 * an obviously hostile value (negative, NaN, a string, an object) is still a
 * clean 400 rather than silently discarded.
 */
export const legacyIgnoredMoney = money

export const tag = boundedString(60, 'Tag')

/** Reusable `{ id }` / `{ productId }` bodies. */
export const bodyWithProductId = z.object({ productId: objectId }).strict()

/**
 * Money in integer minor units (DB-004).
 *
 * A whole number of cents. The major-unit `money` schema above is kept for the
 * legacy fields that are still accepted and ignored.
 */
export const minorMoney = z
    .number({ invalid_type_error: 'must be a number' })
    .int('must be a whole number of minor units')
    .nonnegative('must not be negative')
    .max(100_000_000_000, 'is implausibly large')

/**
 * A variant axis name. Bounded, and free of the two characters that would give
 * it meaning as a Mongo path if it were ever used as a Map key (SEC-018).
 */
export const variantAxisName = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .trim()
    .min(1, 'is required')
    .max(60, 'must be 60 characters or fewer')
    .refine((value) => !value.includes('.') && !value.includes('$'), {
        message: 'may not contain "." or "$"',
    })

/**
 * The lossless variant reference (DB-003): the option pairs themselves, rather
 * than a string that has to be split back apart.
 */
export const variantOptions = z
    .record(variantAxisName, boundedString(60, 'Option value'))
    .refine((value) => Object.keys(value).length <= 10, { message: 'has too many axes' })

/**
 * Bounded pagination (BE-009).
 *
 * Unknown query parameters are stripped rather than refused: a deployed client
 * appending a cache-buster must not start receiving 400s. Anything that *is*
 * recognised has to be usable — `?page=0`, `?limit=abc` and `?limit=5000` are
 * all rejected rather than silently clamped, because silently clamping is how a
 * caller ends up believing it has the whole list.
 */
export const MAX_PAGE_LIMIT = 100

export const paginationQuery = z
    .object({
        page: z.coerce.number().int('must be a whole number').min(1, 'must be at least 1').max(100_000).optional(),
        limit: z.coerce.number().int('must be a whole number').min(1, 'must be at least 1').max(MAX_PAGE_LIMIT, `must be ${MAX_PAGE_LIMIT} or fewer`).optional(),
    })
    .strip()

/** Admin-only: include soft-deleted products in a listing (DB-007). */
export const includeArchivedQuery = z
    .object({
        includeArchived: z
            .union([z.literal('true'), z.literal('false'), z.boolean()])
            .optional()
            .transform((value) => value === true || value === 'true'),
    })
    .strip()
