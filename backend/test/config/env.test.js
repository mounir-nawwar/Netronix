// Boot-time configuration validation (DEVOPS-002, SEC-014).

import { describe, it, expect } from 'vitest'
import { loadEnv, describeEnv, EnvValidationError, MIN_JWT_SECRET_LENGTH } from '../../config/env.js'

/** A minimal environment that satisfies every required variable. */
const validEnv = (overrides = {}) => ({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/e-commerce',
    JWT_SECRET: 'a'.repeat(MIN_JWT_SECRET_LENGTH),
    ...overrides,
})

const load = (env) => loadEnv({ env, silent: true })

describe('loadEnv: a valid isolated test configuration', () => {
    it('accepts an environment with only the required variables', () => {
        const { config } = load(validEnv())
        expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/e-commerce')
        expect(config.NODE_ENV).toBe('test')
    })

    it('applies documented defaults', () => {
        const { config } = load({ ...validEnv(), NODE_ENV: undefined, PORT: undefined })
        expect(config.PORT).toBe(4000)
        expect(config.NODE_ENV).toBe('development')
    })

    it('coerces PORT to a number', () => {
        expect(load(validEnv({ PORT: '4100' })).config.PORT).toBe(4100)
    })

    it('returns a frozen object so configuration cannot drift at runtime', () => {
        const { config } = load(validEnv())
        expect(Object.isFrozen(config)).toBe(true)
    })

    it('ignores variables it does not know about', () => {
        const { config } = load(validEnv({ SOME_UNRELATED_SHELL_VAR: 'x' }))
        expect(config.SOME_UNRELATED_SHELL_VAR).toBeUndefined()
    })
})

describe('loadEnv: missing required variables', () => {
    it('fails and names every missing variable at once', () => {
        let error
        try {
            load({ NODE_ENV: 'development' })
        } catch (caught) {
            error = caught
        }
        expect(error).toBeInstanceOf(EnvValidationError)
        // ADMIN_EMAIL and ADMIN_PASSWORD used to be required here. They are
        // gone entirely (SEC-001): the admin is a user document with a bcrypt
        // hash, so there is no admin credential in the environment at all.
        expect(error.problems.map((p) => p.variable).sort())
            .toEqual(['JWT_SECRET', 'MONGODB_URI'])
        expect(error.message).toContain('backend/.env.example')
    })

    it.each(['MONGODB_URI', 'JWT_SECRET'])(
        'fails when %s is missing',
        (variable) => {
            const env = validEnv()
            delete env[variable]
            expect(() => load(env)).toThrow(new RegExp(variable))
        },
    )

    it('treats an empty value as absent', () => {
        expect(() => load(validEnv({ MONGODB_URI: '' }))).toThrow(/MONGODB_URI is required/)
        expect(() => load(validEnv({ MONGODB_URI: '   ' }))).toThrow(/MONGODB_URI is required/)
    })
})

describe('loadEnv: invalid values', () => {
    it('rejects a MONGODB_URI that is not a MongoDB URI', () => {
        expect(() => load(validEnv({ MONGODB_URI: 'postgres://127.0.0.1:5432' })))
            .toThrow(/must start with mongodb/)
        expect(() => load(validEnv({ MONGODB_URI: '127.0.0.1:27017' })))
            .toThrow(/must start with mongodb/)
    })

    it('accepts complete standard and SRV URIs, including query options', () => {
        expect(() => load(validEnv({
            MONGODB_URI: 'mongodb://127.0.0.1:27017/e-commerce?replicaSet=rs0&retryWrites=true',
        }))).not.toThrow()
        expect(() => load(validEnv({
            MONGODB_URI: 'mongodb+srv://cluster.example.net/e-commerce?retryWrites=true&w=majority',
        }))).not.toThrow()
    })

    it('requires MONGODB_URI to include the application database name', () => {
        expect(() => load(validEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017' })))
            .toThrow(/database name/)
        expect(() => load(validEnv({ MONGODB_URI: 'mongodb+srv://cluster.example.net?retryWrites=true' })))
            .toThrow(/database name/)
    })

    it('no longer knows about ADMIN_EMAIL or ADMIN_PASSWORD at all (SEC-001)', () => {
        // Supplying them is not an error; they are simply not part of the
        // schema any more, so they are ignored like any other shell variable.
        const { config } = load(validEnv({ ADMIN_EMAIL: 'not-an-email', ADMIN_PASSWORD: 'anything' }))
        expect(config).not.toHaveProperty('ADMIN_EMAIL')
        expect(config).not.toHaveProperty('ADMIN_PASSWORD')
    })

    it('accepts a valid CORS_ORIGINS list and rejects a malformed one (DEVOPS-004)', () => {
        expect(() => load(validEnv({ CORS_ORIGINS: 'http://localhost:5173,https://shop.test' }))).not.toThrow()
        expect(() => load(validEnv({ CORS_ORIGINS: 'localhost:5173' })))
            .toThrow(/CORS_ORIGINS: must be a comma-separated list/)
    })

    it('rejects a malformed FRONTEND_URL', () => {
        // `new URL()` treats "localhost:5173" as a URL with the scheme
        // "localhost:", so a bare host:port has to be caught explicitly.
        expect(() => load(validEnv({ FRONTEND_URL: 'localhost:5173' })))
            .toThrow(/FRONTEND_URL: must be an absolute http/)
        expect(() => load(validEnv({ FRONTEND_URL: 'not a url at all' })))
            .toThrow(/FRONTEND_URL: must be a valid URL/)
        expect(() => load(validEnv({ FRONTEND_URL: 'http://localhost:5173' }))).not.toThrow()
    })

    it('rejects a non-numeric or out-of-range PORT', () => {
        expect(() => load(validEnv({ PORT: 'four thousand' }))).toThrow(/PORT/)
        expect(() => load(validEnv({ PORT: '0' }))).toThrow(/PORT/)
        expect(() => load(validEnv({ PORT: '99999' }))).toThrow(/PORT/)
    })

    it('rejects an unknown NODE_ENV', () => {
        expect(() => load(validEnv({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/)
    })
})

describe('loadEnv: weak JWT secrets (SEC-014)', () => {
    const weakSecrets = [
        'netronix_secret_key_replace_in_production', // the setupEnv.js default
        'secret',
        'changeme',
        'short',
    ]

    it.each(weakSecrets)('refuses "%s" when NODE_ENV=production', (secret) => {
        expect(() => load(validEnv({ NODE_ENV: 'production', JWT_SECRET: secret })))
            .toThrow(EnvValidationError)
    })

    it.each(weakSecrets)('also refuses "%s" in development (SEC-014 — tightened)', (secret) => {
        // Phase 0 downgraded this to a warning outside production, because
        // `setupEnv.js` wrote a known placeholder and refusing it would have
        // broken existing local setups. `setupEnv.js` now generates a real
        // random secret, so the exemption has no reason to exist — and a
        // development instance signing tokens with a string published in this
        // repository is exactly the configuration that gets promoted by
        // accident.
        expect(() => load(validEnv({ NODE_ENV: 'development', JWT_SECRET: secret })))
            .toThrow(EnvValidationError)
    })

    it.each(weakSecrets)('refuses "%s" in test too', (secret) => {
        expect(() => load(validEnv({ NODE_ENV: 'test', JWT_SECRET: secret })))
            .toThrow(EnvValidationError)
    })

    it(`refuses a secret shorter than ${MIN_JWT_SECRET_LENGTH} characters in production`, () => {
        expect(() => load(validEnv({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(MIN_JWT_SECRET_LENGTH - 1) })))
            .toThrow(new RegExp(`at least ${MIN_JWT_SECRET_LENGTH} characters`))
    })

    it('accepts a long generated secret in production', () => {
        const strong = 'kP3x_9vQz2LmN8rT4wY6bH1jF5sD7gA0cE-uI2oX9pZ'
        const { warnings } = load(validEnv({ NODE_ENV: 'production', JWT_SECRET: strong }))
        expect(warnings.some((w) => w.startsWith('JWT_SECRET'))).toBe(false)
    })
})

describe('loadEnv: optional feature variables', () => {
    it('boots without them but says which features are off', () => {
        const { warnings } = load(validEnv())
        expect(warnings.some((w) => w.startsWith('OPENAI_API_KEY'))).toBe(true)
        expect(warnings.some((w) => w.startsWith('CLOUDINARY_NAME'))).toBe(true)
    })

    it('stops warning once they are supplied', () => {
        const { warnings } = load(validEnv({
            OPENAI_API_KEY: 'sk-proj-placeholder',
            CLOUDINARY_NAME: 'demo',
            CLOUDINARY_API_KEY: 'placeholder',
            CLOUDINARY_SECRET_KEY: 'placeholder',
        }))
        expect(warnings.filter((w) => !w.startsWith('JWT_SECRET'))).toEqual([])
    })
})

describe('no secret value ever leaves the validator', () => {
    const secretValue = 'super-secret-value-that-must-not-appear-anywhere'

    it('keeps values out of validation errors', () => {
        let message = ''
        try {
            // FRONTEND_URL is invalid, so the whole object is rejected while
            // the secret-bearing values are present.
            load(validEnv({ FRONTEND_URL: 'nope', JWT_SECRET: secretValue, OPENAI_API_KEY: secretValue }))
        } catch (error) {
            message = error.message
        }
        expect(message).not.toBe('')
        expect(message).not.toContain(secretValue)
    })

    it('keeps values out of the weak-secret error', () => {
        let message = ''
        try {
            load(validEnv({ NODE_ENV: 'production', JWT_SECRET: 'weak' }))
        } catch (error) {
            message = error.message
        }
        expect(message).toContain('JWT_SECRET')
        expect(message).not.toMatch(/\bweak\b(?!.*characters)/)
    })

    it('redacts every secret-bearing variable in describeEnv', () => {
        const { config } = load(validEnv({
            JWT_SECRET: secretValue,
            OPENAI_API_KEY: secretValue,
            CLOUDINARY_API_KEY: secretValue,
            CLOUDINARY_SECRET_KEY: secretValue,
            CLOUDINARY_NAME: 'demo-cloud',
        }))
        const described = describeEnv(config)

        expect(JSON.stringify(described)).not.toContain(secretValue)
        expect(described.JWT_SECRET).toBe('(set, redacted)')
        expect(described.OPENAI_API_KEY).toBe('(set, redacted)')
        expect(described.MONGODB_URI).toBe('(set, redacted)')
        // Non-secret values stay legible.
        expect(described.NODE_ENV).toBe('test')
        expect(described.CLOUDINARY_NAME).toBe('demo-cloud')
        expect(described.FRONTEND_URL).toBe('(not set)')
    })
})
