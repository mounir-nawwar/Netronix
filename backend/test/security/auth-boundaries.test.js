// SECURITY — the authentication and authorisation boundary, route by route.
//
// Findings: SEC-001 (admin password embedded in the token), SEC-003 (tokens
//           never expired and could not be revoked), SEC-010 (every rejection
//           was HTTP 200), SEC-012, SEC-020, ADM-001.
//
// Verification-suite items 1, 3, 9, 16, 17 and 18, and Gate 1 criteria 2 and 6.
//
// ROUTE COVERAGE. `GUARDED_ROUTES` below is the *complete* list of routes behind
// `authUser` or `adminAuth`. `the guarded route list matches the router stack`
// asserts that directly against Express's own routing table, so a route added
// later without a boundary test fails this file rather than shipping unnoticed.

import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedAdmin, seedProduct, forgeToken, validAddress, TEST_ADMIN_PASSWORD } from '../helpers/api.js'
import { TOKEN_ISSUER, TOKEN_AUDIENCE, CUSTOMER_TOKEN_TTL, ADMIN_TOKEN_TTL } from '../../services/tokenService.js'
import userModel from '../../models/userModel.js'
import app from '../../app.js'

useTestDatabase()

/** Every route behind `authUser`. */
const CUSTOMER_ROUTES = [
    ['post', '/api/cart/get'],
    ['post', '/api/cart/add'],
    ['post', '/api/cart/update'],
    // The guest cart handed over at login (FE-009). It writes to the signed-in
    // customer's cart, so it sits behind the same boundary as the rest.
    ['post', '/api/cart/merge'],
    ['post', '/api/order/place'],
    ['post', '/api/order/userorders'],
    ['post', '/api/user/logout'],
    ['post', '/api/user/wishlist/get'],
    ['post', '/api/user/wishlist/add'],
    ['post', '/api/user/wishlist/remove'],
]

/** Every route behind `adminAuth`. */
const ADMIN_ROUTES = [
    ['post', '/api/order/list'],
    ['post', '/api/order/status'],
    ['post', '/api/product/add'],
    ['post', '/api/product/remove'],
    // Soft delete and its inverse (DB-007, ADM-003). Both mutate the catalog,
    // so both sit behind the same boundary as `remove`.
    ['post', '/api/product/archive'],
    ['post', '/api/product/restore'],
    ['post', '/api/product/update-inventory'],
    // Phase 3 (ADM-002, ADM-004). Both mutate the catalog, so both sit behind
    // the same boundary as `add` and `remove`.
    ['patch', '/api/product/:id'],
    ['post', '/api/product/:id/inventory'],
    ['get', '/api/user/admin/session'],
]

const GUARDED_ROUTES = [...CUSTOMER_ROUTES, ...ADMIN_ROUTES]

const call = (method, path, token) => {
    const request = api()[method](path)
    if (token !== undefined) request.set('token', token)
    return method === 'get' ? request : request.send({})
}

describe('route coverage — every guarded route is listed here', () => {
    it('the guarded route list matches the router stack', () => {
        // Walk Express's routing table rather than trusting the list above.
        const found = new Set()

        for (const layer of app._router.stack) {
            if (layer.name !== 'router' || !layer.handle?.stack) continue
            const mount = layer.regexp.source
                .replace('^\\/', '/')
                .replace('\\/?(?=\\/|$)', '')
                .replace(/\\\//g, '/')

            for (const route of layer.handle.stack) {
                if (!route.route) continue
                const guards = route.route.stack.map((entry) => entry.name)
                if (!guards.includes('authUser') && !guards.includes('adminAuth')) continue
                for (const method of Object.keys(route.route.methods)) {
                    found.add(`${method} ${mount}${route.route.path}`)
                }
            }
        }

        const declared = new Set(GUARDED_ROUTES.map(([method, path]) => `${method} ${path}`))
        expect([...found].sort()).toEqual([...declared].sort())
    })
})

describe('SEC-003 / SEC-010 — every guarded route rejects an unusable token', () => {
    it.each(GUARDED_ROUTES)('%s %s rejects an absent token with 401', async (method, path) => {
        const response = await call(method, path)
        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects a malformed token with 401', async (method, path) => {
        const response = await call(method, path, 'not-a-jwt')
        expect(response.status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects an expired token with 401', async (method, path) => {
        const { user } = await seedCustomer()
        const expired = forgeToken({ sub: String(user._id), expiresIn: '-1s' })
        expect((await call(method, path, expired)).status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects a wrong-issuer token with 401', async (method, path) => {
        const { user } = await seedCustomer()
        const wrongIssuer = forgeToken({ sub: String(user._id), issuer: 'somebody-else' })
        expect((await call(method, path, wrongIssuer)).status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects a wrong-audience token with 401', async (method, path) => {
        const { user } = await seedCustomer()
        const wrongAudience = forgeToken({ sub: String(user._id), audience: 'some-other-app' })
        expect((await call(method, path, wrongAudience)).status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects a token signed with the wrong secret with 401', async (method, path) => {
        const { user } = await seedCustomer()
        const forged = forgeToken({ sub: String(user._id), secret: 'a-different-secret-entirely-0123456789' })
        expect((await call(method, path, forged)).status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects a revoked token with 401', async (method, path) => {
        const { user, token } = await seedCustomer()
        await userModel.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } })
        expect((await call(method, path, token)).status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s rejects a token for a deleted user with 401', async (method, path) => {
        const { user, token } = await seedCustomer()
        await userModel.findByIdAndDelete(user._id)
        expect((await call(method, path, token)).status).toBe(401)
    })

    it.each(GUARDED_ROUTES)('%s %s leaks no jwt internals in the rejection body', async (method, path) => {
        const response = await call(method, path, 'not-a-jwt')
        expect(JSON.stringify(response.body)).not.toMatch(/jwt malformed|jwt expired|invalid signature|JsonWebToken|at Object\./)
    })
})

describe('SEC-001 — admin routes authorise on role, not on a credential', () => {
    it.each(ADMIN_ROUTES)('%s %s rejects a valid customer token with 403', async (method, path) => {
        const { token } = await seedCustomer()
        const response = await call(method, path, token)

        // 403, not 401: the caller *is* authenticated. Collapsing the two would
        // hide exactly the case that matters — a real credential reaching for a
        // privilege it does not have.
        expect(response.status).toBe(403)
        expect(response.body.success).toBe(false)
    })

    it.each(ADMIN_ROUTES)('%s %s accepts an admin token', async (method, path) => {
        const { token } = await seedAdmin()
        const response = await call(method, path, token)
        expect([401, 403]).not.toContain(response.status)
    })

    it('a token whose role claim says admin but whose user is a customer is refused', async () => {
        // The document is the authority on role, not the token — so forging the
        // claim achieves nothing.
        const { user } = await seedCustomer()
        const forged = forgeToken({ sub: String(user._id), role: 'admin' })

        expect((await call('post', '/api/order/list', forged)).status).toBe(403)
    })

    it('demoting an admin invalidates their access immediately, before the token expires', async () => {
        const { user, token } = await seedAdmin()
        expect((await call('post', '/api/order/list', token)).status).toBe(200)

        await userModel.findByIdAndUpdate(user._id, { role: 'customer' })
        expect((await call('post', '/api/order/list', token)).status).toBe(403)
    })

    it('the pre-Phase-1 string-payload admin token is refused outright', async () => {
        // `jwt.sign(email + password, secret)` — a signed *string*, which is
        // how the admin password came to be readable from the token (SEC-001).
        const legacy = jwt.sign('admin@netronix.test' + TEST_ADMIN_PASSWORD, process.env.JWT_SECRET)
        expect((await call('post', '/api/order/list', legacy)).status).toBe(401)
    })
})

describe('SEC-001 — the issued admin token carries no secret', () => {
    it('GATE 1 — the decoded payload contains no credential material and has role and exp', async () => {
        const { credentials, user } = await seedAdmin()

        const { body, status } = await api().post('/api/user/admin').send(credentials)
        expect(status).toBe(200)

        const payload = jwt.decode(body.token)
        const serialised = JSON.stringify(payload)

        expect(typeof payload).toBe('object')
        expect(serialised).not.toContain(credentials.password)
        expect(serialised).not.toContain(user.password)          // the bcrypt hash
        expect(serialised).not.toContain(credentials.email)
        expect(payload).not.toHaveProperty('password')

        expect(payload).toMatchObject({ role: 'admin', sub: String(user._id) })
        expect(payload.exp).toBeGreaterThan(payload.iat)
        expect(payload.iss).toBe(TOKEN_ISSUER)
        expect(payload.aud).toBe(TOKEN_AUDIENCE)
        expect(payload).toHaveProperty('v')
    })

    it('no substring of the password of any length survives into the token', async () => {
        const { credentials } = await seedAdmin()
        const { body } = await api().post('/api/user/admin').send(credentials)
        const raw = body.token

        // Every 6-character window of the password, checked against the whole
        // token string including its base64url segments.
        for (let i = 0; i + 6 <= credentials.password.length; i += 1) {
            expect(raw).not.toContain(credentials.password.slice(i, i + 6))
        }
    })

    it('an admin token expires in 8 hours and a customer token in 24', async () => {
        const { credentials } = await seedAdmin()
        const admin = jwt.decode((await api().post('/api/user/admin').send(credentials)).body.token)
        expect(admin.exp - admin.iat).toBe(8 * 60 * 60)
        expect(ADMIN_TOKEN_TTL).toBe('8h')

        const { user } = await seedCustomer()
        const login = await api().post('/api/user/login')
            .send({ email: user.email, password: 'test-customer-password' })
        const customer = jwt.decode(login.body.token)
        expect(customer.exp - customer.iat).toBe(24 * 60 * 60)
        expect(CUSTOMER_TOKEN_TTL).toBe('24h')
    })

    it('a customer login cannot produce an admin role claim', async () => {
        const { user } = await seedCustomer()
        const { body } = await api().post('/api/user/login')
            .send({ email: user.email, password: 'test-customer-password' })
        expect(jwt.decode(body.token).role).toBe('customer')
    })

    it('admin login refuses a customer account with the uniform credentials error', async () => {
        const { user } = await seedCustomer()
        const response = await api().post('/api/user/admin')
            .send({ email: user.email, password: 'test-customer-password' })

        expect(response.status).toBe(401)
        expect(response.body.message).toBe('Invalid email or password')
    })
})

describe('SEC-003 — logout revokes', () => {
    it('invalidates the presented token', async () => {
        const { token } = await seedCustomer()
        expect((await call('post', '/api/cart/get', token)).status).toBe(200)

        const logout = await api().post('/api/user/logout').set('token', token).send({})
        expect(logout.status).toBe(200)

        expect((await call('post', '/api/cart/get', token)).status).toBe(401)
    })

    it('invalidates every other token outstanding for the same user', async () => {
        const { user, token: first } = await seedCustomer()
        const second = jwt.sign(
            { sub: String(user._id), role: 'customer', v: 0 },
            process.env.JWT_SECRET,
            { expiresIn: '24h', issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE },
        )

        await api().post('/api/user/logout').set('token', first).send({})

        expect((await call('post', '/api/cart/get', second)).status).toBe(401)
    })

    it('does not affect another user', async () => {
        const alice = await seedCustomer()
        const bob = await seedCustomer()

        await api().post('/api/user/logout').set('token', alice.token).send({})

        expect((await call('post', '/api/cart/get', bob.token)).status).toBe(200)
    })

    it('a fresh login after logout works', async () => {
        const { user, token } = await seedCustomer()
        await api().post('/api/user/logout').set('token', token).send({})

        const { body, status } = await api().post('/api/user/login')
            .send({ email: user.email, password: 'test-customer-password' })
        expect(status).toBe(200)
        expect((await call('post', '/api/cart/get', body.token)).status).toBe(200)
    })
})

describe('SEC-020 — authentication failures are indistinguishable', () => {
    it('an unknown address and a wrong password return an identical status and body', async () => {
        const { user } = await seedCustomer()

        const unknown = await api().post('/api/user/login')
            .send({ email: 'nobody@netronix.test', password: 'whatever-password' })
        const wrongPassword = await api().post('/api/user/login')
            .send({ email: user.email, password: 'whatever-password' })

        expect(unknown.status).toBe(wrongPassword.status)
        expect(unknown.status).toBe(401)

        // requestId differs per request by design; everything else must match.
        const strip = ({ requestId, ...rest }) => rest
        expect(strip(unknown.body)).toEqual(strip(wrongPassword.body))
        expect(unknown.body.message).toBe('Invalid email or password')
    })

    it('the same holds for the admin endpoint', async () => {
        const { credentials } = await seedAdmin()

        const unknown = await api().post('/api/user/admin')
            .send({ email: 'nobody@netronix.test', password: 'whatever-password' })
        const wrongPassword = await api().post('/api/user/admin')
            .send({ email: credentials.email, password: 'whatever-password' })

        const strip = ({ requestId, ...rest }) => rest
        expect(unknown.status).toBe(wrongPassword.status)
        expect(strip(unknown.body)).toEqual(strip(wrongPassword.body))
    })

    it('registration does not confirm an address through a different route', async () => {
        const { user } = await seedCustomer()
        const response = await api().post('/api/user/register')
            .send({ name: 'Duplicate', email: user.email, password: 'password123' })

        // A duplicate address is a genuine 409 — the caller is being told the
        // account exists because they are trying to create it. What matters is
        // that no *login* response distinguishes the two, which is asserted
        // above.
        expect(response.status).toBe(409)
    })
})

describe('SEC-012 — the admin session endpoint is the console gate', () => {
    it('returns the admin identity for a valid admin token', async () => {
        const { token, user } = await seedAdmin()
        const { status, body } = await api().get('/api/user/admin/session').set('token', token)

        expect(status).toBe(200)
        expect(body.admin).toMatchObject({ email: user.email, role: 'admin' })
        expect(JSON.stringify(body)).not.toContain(user.password)
    })

    it.each([
        ['an arbitrary string', 'obviously-not-a-jwt'],
        ['an empty string', ''],
        ['a plausible-looking fake', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.nope'],
    ])('refuses %s', async (_label, token) => {
        const response = await api().get('/api/user/admin/session').set('token', token)
        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })
})

describe('the customer boundary still admits legitimate traffic', () => {
    it('a valid customer token reaches its own data', async () => {
        const { token } = await seedCustomer()
        const cart = await api().post('/api/cart/get').set('token', token).send({})
        expect(cart.body).toMatchObject({ success: true, cartData: {} })
    })

    it('a customer sees only their own orders', async () => {
        const product = await seedProduct({ inventory: { '': 9 } })
        const alice = await seedCustomer()
        const bob = await seedCustomer()

        await api().post('/api/order/place').set('token', alice.token).send({
            items: [{ productId: String(product._id), size: '', quantity: 1 }],
            address: validAddress,
        })

        const { body } = await api().post('/api/order/userorders').set('token', bob.token).send({})
        expect(body.orders).toEqual([])
    })
})
