// MIGRATION SAFETY — the guard that decides where a migration may run (DB-010).
//
// A migration rewrites documents in place, so the worst thing this repository
// can do is run one somewhere it was not meant to. These rules are the whole
// defence, and every one of them fails closed.
//
// They are deliberately stricter than the seed's, and the table below asserts
// that: the seed accepts `dev`, `local` and `demo` database names, a migration
// accepts only `test` and `scratch`. The two operations are not comparable — a
// seed writes known fixtures into a disposable database, a migration transforms
// whatever is already there.
//
// Nothing here touches a database. The rules are pure functions of a URI, which
// is exactly why they can be asserted exhaustively.

import { describe, it, expect, afterEach } from 'vitest'

import {
    assertSafeMigrationTarget,
    assertSafeMigrationConnection,
    UnsafeMigrationTargetError,
    REQUIRED_DB_NAME_MARKERS,
    REFUSED_DB_NAMES,
} from '../../migrations/safety.js'
import { applyMigration, runMigrations } from '../../migrations/runner.js'
import migrations from '../../migrations/index.js'

/** Every target that must be refused, and the reason it must be refused. */
const REFUSED_TARGETS = [
    ['an SRV URI (the hosted-cluster form)', 'mongodb+srv://cluster0.abc.mongodb.net/netronix_test'],
    ['an SRV URI even with a disposable name', 'mongodb+srv://cluster0.abc.mongodb.net/scratch_test'],
    ['a MongoDB Atlas host', 'mongodb://cluster0-shard-00-00.abc.mongodb.net:27017/netronix_test'],
    ['a MongoDB Cloud host', 'mongodb://db.mongodb.com:27017/netronix_test'],
    ['an Amazon DocumentDB host', 'mongodb://c.cluster.docdb.amazonaws.com:27017/netronix_test'],
    ['an Azure Cosmos host', 'mongodb://acct.cosmos.azure.com:27017/netronix_test'],
    ['a DigitalOcean host', 'mongodb://db.digitalocean.com:27017/netronix_test'],
    ['a Render host', 'mongodb://db.render.com:27017/netronix_test'],
    ['a Railway host', 'mongodb://db.railway.app:27017/netronix_test'],
    ['any other remote host', 'mongodb://db.internal.example.com:27017/netronix_test'],
    ['a bare public IP', 'mongodb://203.0.113.10:27017/netronix_test'],
    ['a multi-host URI where one host is remote', 'mongodb://127.0.0.1:27017,db.example.com:27017/netronix_test'],
    ['a URI carrying credentials', 'mongodb://root:hunter2@127.0.0.1:27017/netronix_test'],
    ['credentials whose password contains an @', 'mongodb://root:pa@ss@127.0.0.1:27017/netronix_test'],
    ['the application database', 'mongodb://127.0.0.1:27017/e-commerce'],
    ['a reserved database', 'mongodb://127.0.0.1:27017/admin'],
    ['a production-looking name', 'mongodb://127.0.0.1:27017/netronix_production'],
    ['a plain name with no disposable marker', 'mongodb://127.0.0.1:27017/netronix'],
    ['a name the seed would accept but a migration must not', 'mongodb://127.0.0.1:27017/netronix_dev'],
    ['another name the seed would accept', 'mongodb://127.0.0.1:27017/netronix_demo'],
    ['no database at all', 'mongodb://127.0.0.1:27017'],
    ['no host at all', 'mongodb:///netronix_test'],
    ['a URI that is not a MongoDB URI', 'postgres://127.0.0.1:5432/netronix_test'],
    ['an empty string', ''],
    ['whitespace', '   '],
]

/** Targets that must be accepted: ephemeral loopback, disposable name. */
const ACCEPTED_TARGETS = [
    ['loopback IPv4', 'mongodb://127.0.0.1:27017/netronix_test'],
    ['another 127.x address', 'mongodb://127.0.0.2:27017/netronix_test'],
    ['localhost', 'mongodb://localhost:27017/netronix_scratch'],
    ['IPv6 loopback', 'mongodb://[::1]:27017/netronix_test'],
    ['an ephemeral port, as mongodb-memory-server hands out', 'mongodb://127.0.0.1:41235/netronix_test'],
    ['a scratch database', 'mongodb://127.0.0.1:27017/scratchpad'],
]

describe('DB-010 — the migration target guard refuses everything but ephemeral loopback', () => {
    it.each(REFUSED_TARGETS)('refuses %s', (_reason, uri) => {
        expect(() => assertSafeMigrationTarget(uri)).toThrow(UnsafeMigrationTargetError)
    })

    it.each(ACCEPTED_TARGETS)('accepts %s', (_reason, uri) => {
        expect(() => assertSafeMigrationTarget(uri)).not.toThrow()
    })

    it('names the service rather than only saying "not allowed"', () => {
        expect(() => assertSafeMigrationTarget('mongodb://x.mongodb.net:27017/netronix_test'))
            .toThrow(/MongoDB Atlas/)
    })

    it('never puts a credential in the error it throws', () => {
        // The message is read by a human and may end up in a log or a paste.
        let message = ''
        try {
            assertSafeMigrationTarget('mongodb://root:sup3r-s3cret@db.example.com:27017/netronix_test')
        } catch (error) {
            message = error.message
        }
        expect(message).not.toContain('sup3r-s3cret')
        expect(message).not.toContain('root')
    })

    it('is stricter than the seed about database names, by design', () => {
        expect(REQUIRED_DB_NAME_MARKERS).toEqual(['test', 'scratch'])
        // The seed also allows dev/local/demo. A migration does not.
        for (const name of ['dev', 'local', 'demo']) {
            expect(REQUIRED_DB_NAME_MARKERS).not.toContain(name)
        }
    })

    it('refuses the application database by name whatever else it is called', () => {
        expect(REFUSED_DB_NAMES).toContain('e-commerce')
        expect(() => assertSafeMigrationTarget('mongodb://127.0.0.1:27017/e-commerce')).toThrow()
    })

    it('accepts an explicit dbName argument, and judges that rather than the URI', () => {
        expect(() => assertSafeMigrationTarget('mongodb://127.0.0.1:27017', { dbName: 'netronix_test' })).not.toThrow()
        expect(() => assertSafeMigrationTarget('mongodb://127.0.0.1:27017', { dbName: 'e-commerce' })).toThrow()
    })
})

describe('DB-010 — authorisation is never inferred from the environment', () => {
    const saved = { ...process.env }
    afterEach(() => {
        for (const key of ['MONGODB_URI', 'MIGRATE_MONGODB_URI', 'SEED_MONGODB_URI', 'NODE_ENV']) {
            if (saved[key] === undefined) delete process.env[key]
            else process.env[key] = saved[key]
        }
    })

    it('does not read MONGODB_URI, so a .env lying around cannot authorise anything', () => {
        // The single most likely accident: the application's own connection
        // string is present in the process, and a migration picks it up.
        process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/e-commerce'
        process.env.MIGRATE_MONGODB_URI = 'mongodb://127.0.0.1:27017/e-commerce'

        // There is no zero-argument form at all: a target has to be stated.
        expect(() => assertSafeMigrationTarget(undefined)).toThrow(UnsafeMigrationTargetError)
        expect(() => assertSafeMigrationTarget(process.env.MONGODB_URI)).toThrow(UnsafeMigrationTargetError)
    })

    it('does not relax for NODE_ENV', () => {
        process.env.NODE_ENV = 'production'
        expect(() => assertSafeMigrationTarget('mongodb://127.0.0.1:27017/netronix_test')).not.toThrow()
        process.env.NODE_ENV = 'development'
        expect(() => assertSafeMigrationTarget('mongodb://db.example.com:27017/netronix_test')).toThrow()
    })

    it('ships no CLI entry point that could be pointed at a database', async () => {
        const runner = await import('../../migrations/runner.js')
        const index = await import('../../migrations/index.js')
        // Nothing in this directory reads argv or opens a connection of its own.
        expect(runner.default).toBeUndefined()
        expect(typeof index.default).toBe('object')
        for (const name of Object.keys(runner)) {
            expect(name).not.toMatch(/^main$|^cli$/i)
        }
    })
})

describe('DB-010 — the runner itself judges the connection it is handed', () => {
    const connectionTo = (host, name) => ({ host, name, db: { databaseName: name } })

    it('refuses a connection to a non-loopback host', () => {
        expect(() => assertSafeMigrationConnection(connectionTo('db.example.com', 'netronix_test')))
            .toThrow(UnsafeMigrationTargetError)
    })

    it('refuses a connection to an Atlas host even with a disposable database name', () => {
        expect(() => assertSafeMigrationConnection(connectionTo('cluster0.abc.mongodb.net', 'netronix_test')))
            .toThrow(UnsafeMigrationTargetError)
    })

    it('refuses a loopback connection to the application database', () => {
        expect(() => assertSafeMigrationConnection(connectionTo('127.0.0.1', 'e-commerce')))
            .toThrow(UnsafeMigrationTargetError)
    })

    it('refuses a loopback connection whose name is not disposable', () => {
        expect(() => assertSafeMigrationConnection(connectionTo('127.0.0.1', 'netronix')))
            .toThrow(UnsafeMigrationTargetError)
    })

    it('refuses a connection that cannot report where it points', () => {
        expect(() => assertSafeMigrationConnection({})).toThrow(UnsafeMigrationTargetError)
        expect(() => assertSafeMigrationConnection({ host: '127.0.0.1' })).toThrow(UnsafeMigrationTargetError)
    })

    it('accepts an ephemeral loopback connection', () => {
        expect(() => assertSafeMigrationConnection(connectionTo('127.0.0.1', 'netronix_test'))).not.toThrow()
    })

    it('applyMigration refuses before running anything', async () => {
        let ran = false
        const migration = {
            id: 'never', name: 'never', up: async () => { ran = true }, down: async () => { ran = true },
        }
        await expect(applyMigration(migration, { connection: connectionTo('db.example.com', 'netronix_test') }))
            .rejects.toThrow(UnsafeMigrationTargetError)
        expect(ran).toBe(false)
    })

    it('applyMigration refuses when handed no connection at all', async () => {
        await expect(applyMigration(migrations[0], {})).rejects.toThrow(/explicit connection/)
    })

    it('runMigrations refuses the whole list on an unsafe target, running none of it', async () => {
        await expect(runMigrations(migrations, { connection: connectionTo('127.0.0.1', 'e-commerce') }))
            .rejects.toThrow(UnsafeMigrationTargetError)
    })
})

describe('DB-010 — every migration is a complete, documented unit', () => {
    it.each(migrations.map((migration) => [migration.id, migration]))(
        '%s exposes up(), down(), its findings and its rollback caveats',
        (_id, migration) => {
            expect(typeof migration.up).toBe('function')
            expect(typeof migration.down).toBe('function')
            expect(migration.name).toBeTruthy()
            expect(Array.isArray(migration.findings)).toBe(true)
            expect(migration.findings.length).toBeGreaterThan(0)
            // Untested rollback is no rollback, and undocumented rollback is a
            // rollback nobody will dare run.
            expect(typeof migration.rollback).toBe('string')
            expect(migration.rollback.length).toBeGreaterThan(40)
        },
    )

    it('is ordered by its numeric prefix, so up and down are reversible sequences', () => {
        const ids = migrations.map((migration) => migration.id)
        expect(ids).toEqual([...ids].sort())
        expect(new Set(ids).size).toBe(ids.length)
    })
})
