// Boot-time environment validation (DEVOPS-002).
//
// Deliberate design points:
//   * Nothing here runs at import time. `server.js` calls `loadEnv()` *after*
//     `dotenv.config()`, which keeps module evaluation order identical to the
//     pre-split server and lets tests validate arbitrary env objects in
//     isolation.
//   * No secret value is ever placed in an error message or a log line. Errors
//     name the variable and state the rule it broke.
//   * A weak JWT_SECRET is a hard failure in **every** environment (SEC-014).
//     Phase 0 downgraded it to a warning outside production, because the
//     tracked `setupEnv.js` wrote a known placeholder and refusing it would
//     have broken existing local setups. `setupEnv.js` now generates a real
//     random secret, so the reason for the exemption is gone — and a
//     development instance signing tokens with a public string is exactly the
//     configuration that gets promoted by accident.

import { z } from 'zod'

/** Secrets: never echo the value, only the variable name. */
const SECRET_KEYS = new Set([
    'JWT_SECRET',
    'OPENAI_API_KEY',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_SECRET_KEY',
    'MONGODB_URI', // carries credentials in the userinfo component
])

/** Known-weak JWT secrets that must never reach production. */
const KNOWN_WEAK_JWT_SECRETS = new Set([
    'netronix_secret_key_replace_in_production', // setupEnv.js default (SEC-014)
    'secret',
    'jwt_secret',
    'changeme',
    'your_jwt_secret',
    'test',
])

const MIN_JWT_SECRET_LENGTH = 32

export class EnvValidationError extends Error {
    constructor(problems) {
        const lines = problems.map((p) => `  - ${p.variable}: ${p.message}`)
        super(
            'Invalid backend environment configuration.\n' +
            lines.join('\n') +
            '\n\nSee backend/.env.example for the full list of variables and their purpose.',
        )
        this.name = 'EnvValidationError'
        this.problems = problems
    }
}

const nonEmpty = (label) =>
    z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
        .trim()
        .min(1, `${label} is required`)

const mongoUri = nonEmpty('MONGODB_URI').refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    { message: 'must start with mongodb:// or mongodb+srv://' },
).refine(
    (value) => {
        const authorityAndPath = value.slice(value.indexOf('://') + 3).split('?', 1)[0]
        const pathStart = authorityAndPath.indexOf('/')
        return pathStart >= 0 && authorityAndPath.slice(pathStart + 1).length > 0
    },
    { message: 'must include the application database name in the URI path' },
)

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number({ invalid_type_error: 'must be a number' }).int().positive().max(65535).default(4000),

    // Required — the API cannot serve a single authenticated request without these.
    MONGODB_URI: mongoUri,
    JWT_SECRET: nonEmpty('JWT_SECRET'),

    // ADMIN_EMAIL and ADMIN_PASSWORD are gone (SEC-001). The admin is a user
    // document with `role: 'admin'` and a bcrypt hash, created by
    // `scripts/createAdmin.js`. There is no admin credential in the
    // environment to compare against, and therefore none to sign into a token.

    // Optional — the features that use them degrade rather than crash.
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    CLOUDINARY_NAME: z.string().trim().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
    CLOUDINARY_SECRET_KEY: z.string().trim().min(1).optional(),
    // Comma-separated browser origins allowed to call this API. Absent falls
    // back to the list that used to be hardcoded in app.js (DEVOPS-004).
    CORS_ORIGINS: z
        .string()
        .trim()
        .min(1)
        .refine(
            (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean).every((entry) => {
                try {
                    const url = new URL(entry)
                    return url.protocol === 'http:' || url.protocol === 'https:'
                } catch {
                    return false
                }
            }),
            { message: 'must be a comma-separated list of absolute http:// or https:// origins' },
        )
        .optional(),

    FRONTEND_URL: z
        .string()
        .trim()
        .url('must be a valid URL')
        // `new URL()` accepts "localhost:5173" as a URL with the scheme
        // "localhost:", so the scheme has to be checked explicitly.
        .refine((value) => /^https?:\/\//i.test(value), { message: 'must be an absolute http:// or https:// URL' })
        .optional(),
})

/** Variables that make a feature work but are not required to boot. */
const OPTIONAL_FEATURE_VARS = [
    { variable: 'OPENAI_API_KEY', feature: 'the AI chatbot (falls back to a canned reply)' },
    { variable: 'CLOUDINARY_NAME', feature: 'product image upload' },
    { variable: 'CLOUDINARY_API_KEY', feature: 'product image upload' },
    { variable: 'CLOUDINARY_SECRET_KEY', feature: 'product image upload' },
]

function jwtSecretProblem(secret) {
    if (KNOWN_WEAK_JWT_SECRETS.has(secret.toLowerCase())) {
        return 'is a known placeholder value and must be replaced with a generated secret'
    }
    if (secret.length < MIN_JWT_SECRET_LENGTH) {
        return `must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${secret.length})`
    }
    return null
}

/**
 * Validate an environment object.
 *
 * @param {object}  [options]
 * @param {object}  [options.env]     Source variables. Defaults to `process.env`.
 * @param {boolean} [options.silent]  Suppress warning output (used by tests).
 * @param {object}  [options.logger]  Injectable logger, defaults to `console`.
 * @returns {{ config: Readonly<object>, warnings: string[] }}
 * @throws {EnvValidationError} when a required variable is missing or invalid.
 */
export function loadEnv({ env = process.env, silent = false, logger = console } = {}) {
    // Only look at the variables we know about, so an unrelated shell variable
    // can never influence validation.
    const candidate = {}
    for (const key of Object.keys(schema.shape)) {
        const raw = env[key]
        // Treat empty strings as absent: `FOO=` in a .env file is not a value.
        if (raw !== undefined && String(raw).trim() !== '') candidate[key] = raw
    }

    const result = schema.safeParse(candidate)

    if (!result.success) {
        const problems = result.error.issues.map((issue) => ({
            variable: String(issue.path[0] ?? '(unknown)'),
            message: issue.message,
        }))
        throw new EnvValidationError(problems)
    }

    const config = result.data
    const warnings = []

    // SEC-014. A placeholder or short secret is refused in every environment,
    // before `server.js` opens a database connection or any other socket.
    const weak = jwtSecretProblem(config.JWT_SECRET)
    if (weak) {
        throw new EnvValidationError([{ variable: 'JWT_SECRET', message: weak }])
    }

    for (const { variable, feature } of OPTIONAL_FEATURE_VARS) {
        if (config[variable] === undefined) {
            warnings.push(`${variable} is not set — ${feature} is disabled.`)
        }
    }

    if (!silent) {
        for (const warning of warnings) logger.warn(`⚠️  ${warning}`)
    }

    return { config: Object.freeze(config), warnings }
}

/**
 * A log-safe view of the configuration: secret-bearing variables are reduced to
 * a `set` / `not set` marker. Use this anywhere configuration is printed.
 */
export function describeEnv(config) {
    const described = {}
    // Iterate the schema rather than the parsed object, so an optional variable
    // that was not supplied still shows up as "(not set)".
    for (const key of Object.keys(schema.shape)) {
        const value = config[key]
        if (value === undefined) {
            described[key] = '(not set)'
        } else if (SECRET_KEYS.has(key)) {
            described[key] = '(set, redacted)'
        } else {
            described[key] = value
        }
    }
    return described
}

export { SECRET_KEYS, KNOWN_WEAK_JWT_SECRETS, MIN_JWT_SECRET_LENGTH }
