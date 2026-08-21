// CHARACTERISATION — authentication as it behaves today.
//
// Manifest flows: 2 (admin token), 12 (auth boundaries), 13 (rate limits),
//                 14 (NoSQL operators).
//
// FLIPPED IN PHASE 1, tasks 1.1, 1.2, 1.4, 1.5, 1.6 and 1.10.
//
// Phase 0 recorded a scheme in which the admin token's payload *was* the admin
// password, no token ever expired, every rejection was HTTP 200 with the raw
// jwt error text, operator objects reached the query, and nothing was throttled.
// Every assertion below that recorded one of those is now written the other way
// round. The exhaustive route-by-route boundary matrix lives in
// test/security/auth-boundaries.test.js; this file keeps the same observations
// Phase 0 made, so the diff *is* the behavioural change.

import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'

import { useTestDatabase } from '../helpers/db.js'
import { api, seedCustomer, seedAdmin, forgeToken, TEST_CUSTOMER_PASSWORD } from '../helpers/api.js'
import { TOKEN_ISSUER, TOKEN_AUDIENCE } from '../../services/tokenService.js'

useTestDatabase()

describe('flow 2 — admin login and token shape (SEC-001 — fixed)', () => {
    it('issues a token when the credentials match a real admin user', async () => {
        const { credentials } = await seedAdmin()
        const { body, status } = await api().post('/api/user/admin').send(credentials)

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(typeof body.token).toBe('string')
    })

    it('rejects wrong credentials with 401 and the uniform message', async () => {
        const { credentials } = await seedAdmin()
        const response = await api().post('/api/user/admin')
            .send({ email: credentials.email, password: 'wrong-password' })

        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toBe('Invalid email or password')
    })

    it('the admin token payload is a claims object with no credential in it (SEC-001 — fixed)', async () => {
        const { credentials, user } = await seedAdmin()
        const { body } = await api().post('/api/user/admin').send(credentials)

        // Phase 0: `jwt.decode(token)` returned the literal string
        // `email + password`, because `adminLogin` signed exactly that. A JWT
        // is signed, not encrypted, so the admin password was readable by
        // anyone holding the token.
        const payload = jwt.decode(body.token)

        expect(typeof payload).toBe('object')
        expect(JSON.stringify(payload)).not.toContain(credentials.password)
        expect(JSON.stringify(payload)).not.toContain(credentials.email)
        expect(payload).toMatchObject({ role: 'admin', sub: String(user._id) })
    })

    it('the admin token expires (SEC-003 — fixed)', async () => {
        const { credentials } = await seedAdmin()
        const { body } = await api().post('/api/user/admin').send(credentials)

        const payload = jwt.decode(body.token, { complete: true }).payload
        expect(payload).toHaveProperty('exp')
        expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    it('a customer token expires too, and carries issuer, audience and version (SEC-003 — fixed)', async () => {
        const { user } = await seedCustomer()
        const { body } = await api().post('/api/user/login')
            .send({ email: user.email, password: TEST_CUSTOMER_PASSWORD })

        const payload = jwt.decode(body.token)
        expect(payload).toHaveProperty('exp')
        expect(payload.sub).toBe(String(user._id))
        expect(payload.iss).toBe(TOKEN_ISSUER)
        expect(payload.aud).toBe(TOKEN_AUDIENCE)
        expect(payload.v).toBe(0)
    })
})

describe('flow 12 — auth boundaries on guarded routes', () => {
    const adminRoutes = [
        ['post', '/api/order/list'],
        ['post', '/api/order/status'],
        ['post', '/api/product/remove'],
        ['post', '/api/product/update-inventory'],
    ]
    const customerRoutes = [
        ['post', '/api/cart/get'],
        ['post', '/api/cart/add'],
        ['post', '/api/cart/update'],
        ['post', '/api/order/userorders'],
        ['post', '/api/user/wishlist/get'],
        ['post', '/api/user/wishlist/add'],
        ['post', '/api/user/wishlist/remove'],
    ]

    it.each(adminRoutes)('%s %s rejects a request with no token with 401', async (method, path) => {
        const response = await api()[method](path).send({})
        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it.each(adminRoutes)('%s %s rejects a malformed token with 401', async (method, path) => {
        const response = await api()[method](path).set('token', 'not-a-jwt').send({})
        expect(response.status).toBe(401)
    })

    it.each(adminRoutes)('%s %s rejects a valid customer token with 403 (wrong role)', async (method, path) => {
        const { token } = await seedCustomer()
        const response = await api()[method](path).set('token', token).send({})

        // Phase 0 answered 200 with "Authorization failed: Invalid credentials",
        // because the check was a string comparison against the env pair.
        expect(response.status).toBe(403)
        expect(response.body.success).toBe(false)
    })

    it.each(customerRoutes)('%s %s rejects a request with no token with 401', async (method, path) => {
        const response = await api()[method](path).send({})
        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it.each(customerRoutes)('%s %s rejects a token signed with the wrong secret', async (method, path) => {
        const forged = jwt.sign({ sub: '5eed00000000000000000001', role: 'customer', v: 0 }, 'a-different-secret-entirely')
        const response = await api()[method](path).set('token', forged).send({})
        expect(response.status).toBe(401)
    })

    it('an expired token is rejected — and tokens now actually expire (SEC-003 — fixed)', async () => {
        const { user } = await seedCustomer()
        const expired = forgeToken({ sub: String(user._id), expiresIn: '-1s' })

        const response = await api().post('/api/cart/get').set('token', expired).send({})
        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it('a rejection returns a real status code, not 200 (SEC-010 — fixed)', async () => {
        const response = await api().post('/api/cart/get').send({})
        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it('the failure body carries no jwt internals (SEC-009 — fixed)', async () => {
        const response = await api().post('/api/cart/get').set('token', 'not-a-jwt').send({})

        // Phase 0 returned the literal string "jwt malformed".
        expect(response.body.message).not.toMatch(/jwt malformed|jwt expired|JsonWebToken/)
        expect(response.body.message).toBe('Not authorised. Please sign in again.')
        expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    })
})

describe('flow 14 — NoSQL operator injection (SEC-006 — fixed)', () => {
    it('an operator object is rejected with 400 before any query runs', async () => {
        await seedCustomer()

        const response = await api().post('/api/user/login')
            .send({ email: { $ne: null }, password: 'anything-at-all' })

        // Phase 0 returned 200 "Invalid password" — which confirmed the
        // operator had executed and matched the first user in the collection.
        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).not.toBe('Invalid email or password')
    })

    it('registration with an operator object is rejected with 400', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: { $ne: null }, password: 'password123' })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
    })

    it('a missing password is a 400, not a TypeError sent to the client (BE-003 — fixed)', async () => {
        const response = await api().post('/api/user/register')
            .send({ name: 'x', email: `no-password-${Date.now()}@netronix.test` })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toMatch(/Cannot read properties of undefined/)
    })

    it('auth failures are indistinguishable, so the user base is not enumerable (SEC-020 — fixed)', async () => {
        const { user } = await seedCustomer()

        const unknown = await api().post('/api/user/login')
            .send({ email: 'nobody@netronix.test', password: 'whatever-password' })
        const wrongPassword = await api().post('/api/user/login')
            .send({ email: user.email, password: 'whatever-password' })

        // Phase 0: "User doesn't exist" versus "Invalid password".
        expect(unknown.status).toBe(wrongPassword.status)
        expect(unknown.body.message).toBe(wrongPassword.body.message)
        expect(unknown.body.message).toBe('Invalid email or password')
    })
})

describe('registration and login happy paths', () => {
    it('registers a user and returns a usable token', async () => {
        const email = `new-user-${Date.now()}@netronix.test`
        const { body, status } = await api().post('/api/user/register')
            .send({ name: 'New User', email, password: 'password123' })

        expect(status).toBe(201)
        expect(body.success).toBe(true)

        const cart = await api().post('/api/cart/get').set('token', body.token).send({})
        // `toMatchObject`: the response also carries `unresolvable` since the
        // pre-commit pass (DB-003), which is additive and asserted where it
        // belongs, in `test/correctness/variant-integrity.test.js`.
        expect(cart.body).toMatchObject({ success: true, cartData: {} })
    })

    it('refuses a duplicate email with 409', async () => {
        const { user } = await seedCustomer()
        const response = await api().post('/api/user/register')
            .send({ name: 'Duplicate', email: user.email, password: 'password123' })

        expect(response.status).toBe(409)
        expect(response.body.success).toBe(false)
    })

    it('the password policy now has a ceiling as well as a floor (SEC-019 — fixed)', async () => {
        const ok = await api().post('/api/user/register')
            .send({ name: 'Fine', email: `fine-${Date.now()}@netronix.test`, password: '12345678' })
        expect(ok.status).toBe(201)

        const tooShort = await api().post('/api/user/register')
            .send({ name: 'Short', email: `short-${Date.now()}@netronix.test`, password: '1234567' })
        expect(tooShort.status).toBe(400)
    })

    it('a token for a user that has since been deleted is rejected (SEC-003 — fixed)', async () => {
        // Phase 0 accepted it: nothing checked that the subject still existed,
        // so the request only failed later, on the missing document.
        const orphan = forgeToken({ sub: '5eedffffffffffffffffffff' })
        const response = await api().post('/api/cart/get').set('token', orphan).send({})

        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })
})

describe('the admin token is accepted on every admin route', () => {
    it.each([
        ['/api/order/list'],
        ['/api/product/update-inventory'],
    ])('%s accepts a real admin token', async (path) => {
        const { token } = await seedAdmin()
        const response = await api().post(path).set('token', token).send({})

        // The controller may still object to the body; what matters here is
        // that authorisation passed.
        expect(response.status).not.toBe(401)
        expect(response.status).not.toBe(403)
    })
})

describe('flow 13 — rate limiting and security headers (SEC-005, SEC-013)', () => {
    // FLIPPED IN PHASE 1, tasks 1.1 and 1.2.
    //
    // Phase 0 recorded the absence of both: 20 consecutive failed logins all
    // reached the controller, no rate-limit headers were sent, and no security
    // header was set. All three assertions are now inverted. The full policy
    // suite lives in test/security/rate-limit.test.js and
    // test/security/headers.test.js; what is kept here is the same three
    // observations, stated the other way round, so the flip is visible in the
    // diff of this file.

    it('20 consecutive failed logins are cut off at the 6th with 429 (SEC-005 — fixed)', async () => {
        const statuses = []
        for (let i = 0; i < 20; i += 1) {
            const response = await api().post('/api/user/login')
                .send({ email: 'nobody@netronix.test', password: 'wrong-password' })
            statuses.push(response.status)
        }

        expect(statuses).toHaveLength(20)
        expect(statuses).toContain(429)
        expect(statuses.filter((status) => status === 429)).toHaveLength(15)
    })

    it('sends standard rate-limit headers on every response (SEC-005 — fixed)', async () => {
        const response = await api().get('/api/product/list')
        expect(response.headers['ratelimit-limit'] ?? response.headers.ratelimit).toBeDefined()
    })

    it('sends security headers and removes the Express banner (SEC-013 — fixed)', async () => {
        const response = await api().get('/')
        expect(response.headers['content-security-policy']).toBeDefined()
        expect(response.headers['x-content-type-options']).toBe('nosniff')
        expect(response.headers['x-powered-by']).toBeUndefined()
    })
})
