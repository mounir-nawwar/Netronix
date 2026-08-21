// Customer authentication (SEC-003, SEC-009, SEC-010).
//
// The Phase 0 version verified a signature, wrote `token_decode.id` into
// `req.body.userId`, and on failure returned HTTP 200 with `error.message` —
// so a client learned "jwt malformed" versus "jwt expired", and every rejection
// looked like a success to any monitoring in front of it. It also logged the
// whole error object, token included.
//
// Four things are different now:
//
//   1. Real 401s, through the central error handler, with one message.
//   2. The claims are checked, not just the signature: issuer, audience and
//      expiry are enforced by `verifyToken`.
//   3. **The user is loaded.** A token for a deleted user is no longer valid
//      until someone notices, and `tokenVersion` is compared — which is what
//      makes logout able to revoke.
//   4. The identity lands on `req.auth`, not in `req.body`. A caller can still
//      put `userId` in the body; it is now simply an unknown field that the
//      validation layer strips, and no controller reads it.

import userModel from '../models/userModel.js'
import { AuthenticationError, asyncHandler } from '../errors/AppError.js'
import { verifyToken, claimsOf } from '../services/tokenService.js'

/** One sentence for every possible failure. Never says which one it was. */
const REJECTED = 'Not authorised. Please sign in again.'

/**
 * Resolve the bearer of a token to a live user document.
 *
 * Shared by `authUser` and `adminAuth` so the two cannot drift: any rule added
 * here — revocation, lockout, a disabled flag — applies to both by construction.
 */
export async function resolveTokenBearer(token) {
    const claims = claimsOf(verifyToken(token))

    const user = await userModel.findById(claims.userId)
    if (!user) {
        throw new AuthenticationError(REJECTED, { details: 'token subject no longer exists' })
    }

    if (Number(user.tokenVersion ?? 0) !== claims.tokenVersion) {
        throw new AuthenticationError(REJECTED, { details: 'token version has been revoked' })
    }

    // The *document* is the authority on role, not the token. A token minted
    // before a demotion therefore stops being an admin token immediately,
    // rather than at expiry.
    return { user, claims: { ...claims, role: user.role === 'admin' ? 'admin' : 'customer' } }
}

const authUser = asyncHandler(async function authUser(req, res, next) {
    const { user, claims } = await resolveTokenBearer(req.headers.token)

    req.auth = { userId: String(user._id), role: claims.role, user }
    next()
})

export default authUser
export { REJECTED }
