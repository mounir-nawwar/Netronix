// Helpers for driving the API in-process with Supertest.

import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

import app from '../../app.js'
import productModel from '../../models/productModel.js'
import userModel from '../../models/userModel.js'
import { issueToken, TOKEN_ISSUER, TOKEN_AUDIENCE } from '../../services/tokenService.js'

export const api = () => request(app)

/**
 * A customer token in exactly the shape the API now issues.
 *
 * Phase 0's version was `jwt.sign({ id }, secret, {})` — no expiry, no issuer,
 * no audience, and no link to the user document. Building one by hand is no
 * longer meaningful, because `authUser` loads the user and compares
 * `tokenVersion`: a token for a user that does not exist is rejected on
 * purpose. Tests that need a working token get one from `seedCustomer()`.
 */
export const customerToken = (user) => issueToken(user)

export const TEST_CUSTOMER_PASSWORD = 'test-customer-password'
export const TEST_ADMIN_PASSWORD = 'test-admin-password-not-real'

let userCounter = 0

/** Create a customer with a known password and return the document plus a token. */
export async function seedCustomer(overrides = {}) {
    userCounter += 1
    const user = await userModel.create({
        name: `Test Customer ${userCounter}`,
        email: `customer${userCounter}@netronix.test`,
        password: await bcrypt.hash(TEST_CUSTOMER_PASSWORD, 10),
        role: 'customer',
        tokenVersion: 0,
        cartData: {},
        wishlist: [],
        ...overrides,
    })
    return { user, token: issueToken(user) }
}

/**
 * Create the admin as a real user document (SEC-001).
 *
 * There is no ADMIN_EMAIL/ADMIN_PASSWORD pair any more. The admin is a `user`
 * with `role: 'admin'` and a bcrypt hash, exactly like a customer with one
 * field different — which is the whole point of the change.
 */
export async function seedAdmin(overrides = {}) {
    userCounter += 1
    const email = overrides.email ?? `admin${userCounter}@netronix.test`
    const user = await userModel.create({
        name: 'Test Admin',
        email,
        password: await bcrypt.hash(TEST_ADMIN_PASSWORD, 10),
        role: 'admin',
        tokenVersion: 0,
        cartData: {},
        wishlist: [],
        ...overrides,
    })
    return {
        user,
        token: issueToken(user),
        credentials: { email, password: TEST_ADMIN_PASSWORD },
    }
}

/**
 * Mint a token with arbitrary claims, for boundary tests.
 *
 * Everything defaults to a valid value so a test can change exactly one thing —
 * the issuer, the audience, the expiry, the version — and attribute the
 * rejection to that one thing.
 */
export function forgeToken({
    sub = '5eedffffffffffffffffffff',
    role = 'customer',
    v = 0,
    issuer = TOKEN_ISSUER,
    audience = TOKEN_AUDIENCE,
    expiresIn = '1h',
    secret = process.env.JWT_SECRET,
} = {}) {
    return jwt.sign({ sub, role, v }, secret, { expiresIn, issuer, audience })
}

let productCounter = 0

/** Create a product. Defaults give one variant-less unit of stock. */
export async function seedProduct(overrides = {}) {
    productCounter += 1
    return productModel.create({
        name: `Test Product ${productCounter}`,
        description: 'A product created by the test suite.',
        price: 100,
        brand: 'Netronix',
        image: ['data:image/svg+xml;base64,PHN2Zy8+'],
        variants: [],
        inventory: { '': 10 },
        bestSeller: false,
        tags: ['Accessories'],
        date: 1785585600000,
        ...overrides,
    })
}

/** A complete address in the shape `PlaceOrder.jsx` submits. */
export const validAddress = {
    firstName: 'Demo',
    lastName: 'Customer',
    email: 'demo@netronix.test',
    street: '124 Rue Gouraud',
    city: 'Beirut',
    state: 'Beirut Governorate',
    zipcode: '2022',
    country: 'Lebanon',
    phone: '+961 71 000 000',
}
