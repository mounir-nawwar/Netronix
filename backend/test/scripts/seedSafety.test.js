// Seed target guards (DB-010).
//
// These run against pure functions — no database, no network, no filesystem.
// Every case is a target the seed must refuse, or a legitimate local target it
// must accept.

import { describe, it, expect } from 'vitest'
import {
    assertSafeSeedTarget,
    parseMongoUri,
    describeSeedTarget,
    resolveSeedUri,
    UnsafeSeedTargetError,
    REQUIRED_DB_NAME_MARKERS,
} from '../../scripts/seedSafety.js'

const refuse = (uri, options) => () => assertSafeSeedTarget(uri, options)

describe('resolveSeedUri: the target must be supplied deliberately', () => {
    it('accepts --uri=', () => {
        expect(resolveSeedUri({ argv: ['--uri=mongodb://127.0.0.1:27017/netronix_dev'] }))
            .toBe('mongodb://127.0.0.1:27017/netronix_dev')
    })

    it('accepts SEED_MONGODB_URI', () => {
        expect(resolveSeedUri({ env: { SEED_MONGODB_URI: 'mongodb://localhost:27017/netronix_test' } }))
            .toBe('mongodb://localhost:27017/netronix_test')
    })

    it('prefers --uri over the environment', () => {
        expect(resolveSeedUri({
            argv: ['--uri=mongodb://127.0.0.1:27017/from_flag_dev'],
            env: { SEED_MONGODB_URI: 'mongodb://127.0.0.1:27017/from_env_dev' },
        })).toBe('mongodb://127.0.0.1:27017/from_flag_dev')
    })

    it('never falls back to MONGODB_URI — the application database is not a seed target', () => {
        expect(() => resolveSeedUri({ env: { MONGODB_URI: 'mongodb://127.0.0.1:27017/netronix_dev' } }))
            .toThrow(UnsafeSeedTargetError)
    })

    it('refuses to run with no target at all', () => {
        expect(() => resolveSeedUri({ argv: [], env: {} })).toThrow(/No seed target was supplied/)
        expect(() => resolveSeedUri({ argv: ['--uri='], env: {} })).toThrow(/No seed target was supplied/)
    })
})

describe('assertSafeSeedTarget: production-looking targets are refused', () => {
    it('refuses MongoDB Atlas', () => {
        expect(refuse('mongodb+srv://cluster0.ab12c.mongodb.net/netronix_dev')).toThrow(UnsafeSeedTargetError)
        expect(refuse('mongodb://cluster0-shard-00-00.ab12c.mongodb.net:27017/netronix_dev'))
            .toThrow(/MongoDB Atlas/)
    })

    it('refuses every mongodb+srv:// URI, whatever the host', () => {
        expect(refuse('mongodb+srv://localhost/netronix_dev')).toThrow(/SRV/)
    })

    it('refuses other managed hosting providers', () => {
        const hosted = [
            ['mongodb://db.abcdefg.eu-west-1.docdb.amazonaws.com:27017/netronix_dev', /Amazon DocumentDB/],
            ['mongodb://netronix.cosmos.azure.com:10255/netronix_dev', /Azure Cosmos DB/],
            ['mongodb://db-mongodb-fra1-01.b.digitalocean.com:27017/netronix_dev', /DigitalOcean/],
            ['mongodb://netronix-db.railway.app:27017/netronix_dev', /Railway/],
            ['mongodb://netronix.onrender.render.com:27017/netronix_dev', /Render/],
        ]
        for (const [uri, message] of hosted) {
            expect(refuse(uri), uri).toThrow(message)
        }
    })

    it('refuses unknown remote hosts', () => {
        expect(refuse('mongodb://db.internal.netronix.io:27017/netronix_dev'))
            .toThrow(/not a known local host/)
        expect(refuse('mongodb://10.0.4.19:27017/netronix_dev')).toThrow(/not a known local host/)
        expect(refuse('mongodb://192.168.1.40:27017/netronix_dev')).toThrow(/not a known local host/)
    })

    it('refuses a remote host hidden behind a local one in a multi-host URI', () => {
        expect(refuse('mongodb://127.0.0.1:27017,cluster0.ab12c.mongodb.net:27017/netronix_dev'))
            .toThrow(/MongoDB Atlas/)
    })

    it('refuses a remote host hidden behind an @ in the password', () => {
        // The parser splits on the LAST '@', so "user:p@ss@remote" resolves to
        // the remote host rather than being read as the host "p".
        expect(refuse('mongodb://user:p@ss@db.example.com:27017/netronix_dev', { allowCredentials: true }))
            .toThrow(/not a known local host/)
    })
})

describe('assertSafeSeedTarget: credentials', () => {
    it('refuses a URI carrying credentials by default', () => {
        expect(refuse('mongodb://admin:hunter2@127.0.0.1:27017/netronix_dev'))
            .toThrow(/carries credentials/)
    })

    it('allows credentials only with the explicit opt-in, and only on a local host', () => {
        const target = assertSafeSeedTarget('mongodb://admin:hunter2@127.0.0.1:27017/netronix_dev', { allowCredentials: true })
        expect(target.hasCredentials).toBe(true)
        // …and the opt-in does not weaken any other rule.
        expect(refuse('mongodb://admin:hunter2@cluster0.ab12c.mongodb.net:27017/netronix_dev', { allowCredentials: true }))
            .toThrow(/MongoDB Atlas/)
    })
})

describe('assertSafeSeedTarget: the database name must be disposable', () => {
    it("refuses the application's own database", () => {
        expect(refuse('mongodb://127.0.0.1:27017/e-commerce')).toThrow(/does not identify it as disposable/)
    })

    it('refuses production-sounding names', () => {
        for (const name of ['production', 'prod', 'netronix', 'main', 'live']) {
            expect(refuse(`mongodb://127.0.0.1:27017/${name}`), name).toThrow(/does not identify it as disposable/)
        }
    })

    it('refuses a URI with no database at all', () => {
        expect(refuse('mongodb://127.0.0.1:27017')).toThrow(/names no database/)
        expect(refuse('mongodb://127.0.0.1:27017/')).toThrow(/names no database/)
    })

    it('accepts a name containing any required marker', () => {
        for (const marker of REQUIRED_DB_NAME_MARKERS) {
            const uri = `mongodb://127.0.0.1:27017/netronix_${marker}`
            expect(assertSafeSeedTarget(uri).dbName).toBe(`netronix_${marker}`)
        }
    })

    it('matches the marker case-insensitively', () => {
        expect(assertSafeSeedTarget('mongodb://127.0.0.1:27017/Netronix_DEV').dbName).toBe('Netronix_DEV')
    })
})

describe('assertSafeSeedTarget: legitimate local targets', () => {
    it.each([
        'mongodb://127.0.0.1:27017/netronix_dev',
        'mongodb://localhost:27017/netronix_test',
        'mongodb://localhost/netronix_demo',
        'mongodb://127.0.0.5:27017/netronix_local',
        'mongodb://[::1]:27017/netronix_dev',
        'mongodb://host.docker.internal:27017/netronix_dev',
        'mongodb://127.0.0.1:27017/netronix_dev?retryWrites=false',
    ])('accepts %s', (uri) => {
        expect(() => assertSafeSeedTarget(uri)).not.toThrow()
    })
})

describe('assertSafeSeedTarget: malformed input', () => {
    it.each([
        [undefined, /No database URI/],
        ['', /No database URI/],
        ['postgres://127.0.0.1:5432/netronix_dev', /must start with mongodb/],
        ['127.0.0.1:27017/netronix_dev', /must start with mongodb/],
        ['mongodb:///netronix_dev', /names no host/],
    ])('refuses %s', (uri, message) => {
        expect(refuse(uri)).toThrow(message)
    })
})

describe('describeSeedTarget: nothing secret is ever printed', () => {
    it('shows host and database only', () => {
        const parsed = parseMongoUri('mongodb://admin:hunter2@127.0.0.1:27017/netronix_dev?authSource=admin')
        const description = describeSeedTarget(parsed)
        expect(description).toBe('mongodb://127.0.0.1:27017 → database "netronix_dev"')
        expect(description).not.toContain('hunter2')
        expect(description).not.toContain('admin:')
        expect(description).not.toContain('authSource')
    })

    it('keeps credentials out of every refusal message', () => {
        let message = ''
        try {
            assertSafeSeedTarget('mongodb://admin:hunter2@cluster0.ab12c.mongodb.net:27017/prod')
        } catch (error) {
            message = error.message
        }
        expect(message).not.toBe('')
        expect(message).not.toContain('hunter2')
        expect(message).not.toContain('admin')
    })
})
