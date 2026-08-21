// Admin authorisation (SEC-001, SEC-012).
//
// This used to be:
//
//     if (decoded !== process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD)
//
// — a string comparison against the live credentials, which is why the token
// had to *contain* those credentials, which is why the admin password was
// readable from any copy of the token.
//
// It is now an ordinary authorisation check: verify the token, load the user,
// confirm the role. `ADMIN_PASSWORD` no longer exists as a runtime variable.
//
// The 401/403 split is deliberate and is what makes the boundary testable.
// A caller with no usable token is *unauthenticated* (401). A caller with a
// perfectly valid customer token is authenticated but *not permitted* (403).
// Collapsing the two would hide the case that matters most: privilege
// escalation attempts arriving with real credentials.

import { AuthorizationError, asyncHandler } from '../errors/AppError.js'
import { resolveTokenBearer } from './auth.js'

const adminAuth = asyncHandler(async function adminAuth(req, res, next) {
    // Throws AuthenticationError (401) for absent, malformed, expired,
    // wrong-issuer, wrong-audience, revoked, or orphaned tokens.
    const { user, claims } = await resolveTokenBearer(req.headers.token)

    if (claims.role !== 'admin') {
        throw new AuthorizationError('Administrator access is required', {
            details: `role "${claims.role}" attempted an admin route`,
        })
    }

    req.auth = { userId: String(user._id), role: 'admin', user }
    next()
})

/**
 * Keep catalog reads public unless the caller asks to cross the archive
 * boundary. `validate(...)` runs first, so this reads the parsed boolean rather
 * than trusting a raw query-string value.
 */
export function adminAuthForArchivedQuery(req, res, next) {
    if (!req.validated?.query?.includeArchived) return next()
    return adminAuth(req, res, next)
}

/**
 * A product detail remains public without a token. Supplying a token opts into
 * the admin view, where archived records may be returned; unusable or non-admin
 * credentials fail closed through the same 401/403 boundary as admin writes.
 */
export function optionalAdminAuth(req, res, next) {
    if (!req.headers.token) return next()
    return adminAuth(req, res, next)
}

export default adminAuth
