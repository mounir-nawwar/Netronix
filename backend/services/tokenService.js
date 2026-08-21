// Session tokens (SEC-001, SEC-003).
//
// What this replaces
// ------------------
// Customers:  `jwt.sign({ id }, secret, {})` — an empty options object, so no
//             `exp`, no issuer, no audience. Every token ever issued was valid
//             forever, with no revocation path of any kind.
//
// Admins:     `jwt.sign(email + password, secret)` — the payload *was* the
//             credential pair. A JWT is signed, not encrypted, so anyone who
//             read the token out of `localStorage` read the admin password.
//
// What it is now
// --------------
// One signer for both roles, producing an object payload containing only:
//
//     { sub, role, v }  plus  iat, exp, iss, aud
//
// `sub` is the user's id. `role` is what `adminAuth` authorises on. `v` is the
// user's `tokenVersion`, so a logout can invalidate outstanding tokens. There
// is no credential material, no email, and no name — nothing whose disclosure
// would matter beyond the session itself.
//
// Lifetimes are asymmetric on purpose: 24h for a customer, 8h for an admin,
// because an admin token is worth far more and an admin re-authenticating is a
// far smaller inconvenience.

import jwt from 'jsonwebtoken'

import { AuthenticationError } from '../errors/AppError.js'

export const TOKEN_ISSUER = 'netronix'
export const TOKEN_AUDIENCE = 'netronix-web'

export const CUSTOMER_TOKEN_TTL = '24h'
export const ADMIN_TOKEN_TTL = '8h'

/** Read the secret at call time, never at import time (B-0). */
function secret() {
    const value = process.env.JWT_SECRET
    if (!value) {
        // Reached only if `server.js`'s boot validation was bypassed. Refusing
        // is the only safe answer: signing with `undefined` throws anyway, and
        // verifying with it would accept unsigned tokens.
        throw new AuthenticationError('Authentication is not configured', { details: 'JWT_SECRET is not set' })
    }
    return value
}

/**
 * Issue a token for a user document.
 *
 * @param {{_id: unknown, role?: string, tokenVersion?: number}} user
 * @returns {string}
 */
export function issueToken(user) {
    const role = user.role === 'admin' ? 'admin' : 'customer'
    const payload = {
        sub: String(user._id),
        role,
        v: Number(user.tokenVersion ?? 0),
    }

    return jwt.sign(payload, secret(), {
        expiresIn: role === 'admin' ? ADMIN_TOKEN_TTL : CUSTOMER_TOKEN_TTL,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
    })
}

/**
 * Verify a token's signature and registered claims.
 *
 * Every failure becomes the *same* `AuthenticationError` shape. The specific
 * reason — expired, wrong issuer, malformed — is carried in `details`, which is
 * logged server-side and never serialised into a response. Before Phase 1 the
 * client was told `jwt malformed` or `jwt expired` verbatim (SEC-009), which
 * tells an attacker exactly which part of their forgery to fix next.
 *
 * @param {unknown} token
 * @returns {{ sub: string, role: string, v: number, exp: number, iat: number }}
 */
export function verifyToken(token) {
    if (typeof token !== 'string' || token.trim() === '') {
        throw new AuthenticationError('Not authorised. Please sign in again.', { details: 'no token supplied' })
    }

    let decoded
    try {
        decoded = jwt.verify(token, secret(), {
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE,
            algorithms: ['HS256'],
        })
    } catch (error) {
        // `error.message` is deliberately confined to `details`.
        throw new AuthenticationError('Not authorised. Please sign in again.', {
            details: `token rejected: ${error.name}`,
        })
    }

    if (typeof decoded !== 'object' || decoded === null) {
        // The pre-Phase-1 admin token was a *string* payload. Anything that
        // decodes to a non-object is by definition from the old scheme, or a
        // forgery, and is refused.
        throw new AuthenticationError('Not authorised. Please sign in again.', {
            details: 'token payload is not a claims object',
        })
    }

    if (typeof decoded.sub !== 'string' || decoded.sub === '') {
        throw new AuthenticationError('Not authorised. Please sign in again.', { details: 'token has no subject' })
    }

    if (!Number.isSafeInteger(decoded.v) || decoded.v < 0) {
        throw new AuthenticationError('Not authorised. Please sign in again.', {
            details: 'token has an invalid version claim',
        })
    }

    return decoded
}

/** Everything a verified caller is allowed to be known by. */
export function claimsOf(decoded) {
    return {
        userId: decoded.sub,
        role: decoded.role === 'admin' ? 'admin' : 'customer',
        tokenVersion: decoded.v,
    }
}
