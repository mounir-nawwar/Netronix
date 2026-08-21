// Admin console configuration (DEVOPS-002).
//
// Everything here ends up in the browser bundle. Vite inlines any `VITE_`
// prefixed variable at build time, so this module can only ever hold public
// values — and it actively refuses to carry anything that looks like a server
// secret.
//
// ADMIN_EMAIL and ADMIN_PASSWORD in particular belong in `backend/.env` and
// must never be given a VITE_ prefix: the console authenticates by POSTing the
// credentials an operator types to `/api/user/admin`, and never holds them.
//
// `backendUrl` and `currency` previously lived in `App.jsx`. They moved here so
// the app module exports only a component — which is also what
// `react-refresh/only-export-components` was warning about (TEST-002).

import { z } from 'zod'

/** Names that must never be exposed to a browser. */
const SERVER_ONLY_PATTERNS = [
    /SECRET/i,
    /PASSWORD/i,
    /PASSWD/i,
    /\bJWT\b/i,
    /MONGO/i,
    /CLOUDINARY/i,
    /OPENAI/i,
    /API_KEY/i,
    /ACCESS_KEY/i,
    /PRIVATE/i,
    /CREDENTIAL/i,
    /ADMIN_EMAIL/i,
]

const httpUrl = z
    .string()
    .trim()
    .url('must be an absolute URL, for example http://localhost:4000')
    .refine((value) => /^https?:\/\//i.test(value), { message: 'must use http:// or https://' })

const schema = z.object({
    VITE_BACKEND_URL: httpUrl,
})

export class ClientConfigError extends Error {
    constructor(problems) {
        super(
            'Invalid admin console configuration.\n' +
            problems.map((p) => `  - ${p.variable}: ${p.message}`).join('\n') +
            '\n\nSee admin/.env.example. Restart the dev server after editing .env.',
        )
        this.name = 'ClientConfigError'
        this.problems = problems
    }
}

const stripTrailingSlash = (value) => value.replace(/\/+$/, '')

/**
 * Validate a client environment object.
 * Exported separately from the singleton below so it can be tested directly.
 */
export function readClientConfig(env = {}) {
    // Only VITE_-prefixed keys are inspected, because only those are inlined
    // into the bundle by Vite — an unprefixed variable is invisible to the
    // browser. (Under vitest, `import.meta.env` also carries the whole shell
    // environment, which is a test-runner artifact and never ships.)
    const secretLeaks = Object.keys(env)
        .filter((key) => key.startsWith('VITE_'))
        .filter((key) => SERVER_ONLY_PATTERNS.some((pattern) => pattern.test(key)))
        .map((key) => ({
            variable: key,
            message:
                'looks like a server-only value. Anything readable here is readable by anyone who loads the console — move it to backend/.env.',
        }))

    if (secretLeaks.length > 0) throw new ClientConfigError(secretLeaks)

    const candidate = {}
    for (const key of Object.keys(schema.shape)) {
        const raw = env[key]
        if (raw !== undefined && String(raw).trim() !== '') candidate[key] = raw
    }

    const result = schema.safeParse(candidate)
    if (!result.success) {
        throw new ClientConfigError(
            result.error.issues.map((issue) => ({
                variable: String(issue.path[0] ?? '(unknown)'),
                message: issue.message === 'Required' ? 'is required' : issue.message,
            })),
        )
    }

    return Object.freeze({ backendUrl: stripTrailingSlash(result.data.VITE_BACKEND_URL) })
}

export const config = readClientConfig(import.meta.env)

export const backendUrl = config.backendUrl

/** Display currency symbol. Unchanged from the previous App.jsx export. */
export const currency = '$'

export { SERVER_ONLY_PATTERNS }
