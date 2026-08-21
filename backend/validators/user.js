// User, auth and wishlist request schemas.
//
// Findings: SEC-006 (operator injection through `findOne({ email })`),
//           SEC-019 (password policy was `length < 8` and nothing else),
//           BE-003.
//
// Note what is *absent* from every schema here: `userId`. It used to arrive in
// the request body and `auth.js` overwrote it — which worked, but meant the
// most security-relevant field on the route was one an attacker could also set.
// The verified identity now travels on `req.auth`, so a body `userId` is simply
// an unknown key and is stripped.

import { z } from 'zod'

import { email, password, submittedPassword, objectId, boundedString } from './common.js'

export const registerSchema = {
    body: z
        .object({
            name: boundedString(100, 'Name'),
            email,
            password,
        })
        .strict(),
}

export const loginSchema = {
    body: z
        .object({
            email,
            // A login password is compared, never hashed, so the registration
            // minimum does not apply: rejecting a short password here would
            // tell an attacker their guess was too short to be this user's.
            password: submittedPassword,
        })
        .strict(),
}

export const adminLoginSchema = {
    body: z
        .object({
            email,
            password: submittedPassword,
        })
        .strict(),
}

export const wishlistSchema = {
    body: z.object({ productId: objectId }).strict(),
}

/** Wishlist read and logout take no input beyond the verified token. */
export const emptyBodySchema = {
    body: z.object({}).strip(),
}
