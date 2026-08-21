// Global test setup.
//
// Installs an isolated test configuration so no test can ever read a real
// `.env`, a real database URI, or a real API key. Nothing here is a credential —
// every value is an obvious placeholder.
//
// The import below is hoisted above the assignments, as ES module imports
// always are. That is safe because `middleware/rateLimit.js` reads no
// environment variable at module scope; nothing that does is imported here.

import { beforeEach } from 'vitest'

import { resetRateLimits } from '../middleware/rateLimit.js'

// `dotenv` is never loaded in tests. These assignments happen before any test
// module is imported, so controllers and middleware see only these values.
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-not-a-real-secret-0123456789'
process.env.PORT = '0'

// Explicitly unset anything that could point at a real service. A test that
// needs one of these sets it itself.
delete process.env.MONGODB_URI
delete process.env.OPENAI_API_KEY
delete process.env.CLOUDINARY_NAME
delete process.env.CLOUDINARY_API_KEY
delete process.env.CLOUDINARY_SECRET_KEY
delete process.env.FRONTEND_URL
delete process.env.CORS_ORIGINS

// ADMIN_PASSWORD no longer exists as a runtime variable (SEC-001): the admin is
// a user document with a bcrypt hash, created per test by `seedAdmin()`.
delete process.env.ADMIN_EMAIL
delete process.env.ADMIN_PASSWORD

// Rate limiting is on for every test, exactly as it is in production — but the
// counters are cleared before each test so a threshold assertion depends only
// on the requests that test makes, never on the order the suite happens to run
// in (SEC-005). The policy itself — windows and maxima — is untouched.
beforeEach(() => {
    resetRateLimits()
})
