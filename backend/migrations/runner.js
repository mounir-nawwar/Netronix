// The migration runner (DB-010).
//
// There was no migration tooling at all: schema changes relied on Mongoose's
// schemaless tolerance and existing documents were never backfilled. Three of
// Phase 2's changes — snapshots, minor units, variant restructuring — are
// meaningless without a backfill, so the mechanism has to exist before they do.
//
// Deliberately small. `migrate-mongo` would bring a CLI, a config file that
// reads a connection string from the environment, and an `up`/`down` command
// that runs against whatever that string points at. That is precisely the
// property this repository does not want (see `safety.js`): the target is passed
// in, never discovered.
//
// ## Authorisation
//
// **Executing a migration is authorised only against an ephemeral loopback
// MongoDB created by the test process.** There is no CLI entry point in this
// directory and none should be added without a separate, explicit decision.
// `assertSafeMigrationConnection` runs on every call and refuses anything else.
//
// ## What a migration is
//
// A module exporting `{ id, name, findings, description, rollback, up, down }`.
// `up` and `down` each receive one context object:
//
//     { db, session, report(entry), log(line), now }
//
// — an explicit connection, never a hidden one. `report()` appends to an audit
// document so that anything a migration *could not* decide (an ambiguous key, a
// malformed id, a coerced status) is written down rather than resolved silently.

import { randomUUID } from 'node:crypto'

import { assertSafeMigrationConnection } from './safety.js'
import { createJournal, JOURNAL_COLLECTION, revertOwned } from './journal.js'

/** Collection holding one document per applied migration. */
export const MIGRATIONS_COLLECTION = 'migrations'

/** Collection holding what each run could not decide for itself. */
export const REPORTS_COLLECTION = 'migrationReports'

/**
 * Build the context a migration's `up()`/`down()` receives.
 *
 * @param {import('mongodb').Db} db
 * @param {object} options
 */
function createContext(db, { migration, direction, session = null, log = () => {}, journal }) {
    return {
        db,
        session,
        log,
        now: new Date(),
        /**
         * Record something the migration could not decide on its own.
         *
         * Returns a promise and is meant to be awaited **before** the write it
         * describes. It used to push onto an array that `applyMigration` wrote
         * out once the migration returned, so a crash part-way through 003, 006
         * or 007 left the destructive write applied and no record of it — and
         * those `down()` paths read that record as their only source of truth.
         */
        report(entry) {
            return journal.report(entry)
        },
        /**
         * Record that this migration is about to change these fields on this
         * document, over these previous values. `down()` reverts exactly these,
         * and only where the value it wrote is still the value stored.
         */
        own(record) {
            return journal.own(record)
        },
        journal,
        /** What a previous `up()` wrote down, for a `down()` that needs it. */
        ownedByUp: () => journal.ownedByUp(),
        reportsFromUp: () => journal.reportsFromUp(),
        revertOwned: () => revertOwned(db, journal),
        entries: journal.entries,
        migration,
        direction,
    }
}

async function persistReport(db, migration, direction, entries, startedAt) {
    if (entries.length === 0) return null
    const doc = {
        migrationId: migration.id,
        direction,
        at: startedAt,
        entries,
    }
    await db.collection(REPORTS_COLLECTION).insertOne(doc)
    return doc
}

/**
 * Apply one migration in one direction.
 *
 * Re-running `up()` on an already-applied migration is a no-op by the ledger,
 * and every `up()` in this directory is additionally written to be safe if it
 * were run twice anyway — the ledger is bookkeeping, not the safety property.
 *
 * @returns {{ id: string, direction: string, skipped: boolean, entries: object[] }}
 */
export async function applyMigration(migration, {
    connection,
    direction = 'up',
    force = false,
    log = () => {},
} = {}) {
    if (!connection) throw new Error('applyMigration requires an explicit connection')
    assertSafeMigrationConnection(connection)

    const db = connection.db
    const ledger = db.collection(MIGRATIONS_COLLECTION)
    const applied = await ledger.findOne({ _id: migration.id })

    if (direction === 'up' && applied && !force) {
        return { id: migration.id, direction, skipped: true, entries: [] }
    }
    if (direction === 'down' && !applied && !force) {
        return { id: migration.id, direction, skipped: true, entries: [] }
    }

    const startedAt = new Date()
    const runId = randomUUID()
    const journal = createJournal(db, { migration, direction, runId })
    const context = createContext(db, { migration, direction, log, journal })

    log(`[migration] ${direction} ${migration.id} — ${migration.name}`)
    await migration[direction](context)

    // The summary document is kept for compatibility with everything that reads
    // `migrationReports`. It is no longer the *evidence* — the journal is, and
    // it was written as the work happened rather than after it.
    await persistReport(db, migration, direction, context.entries, startedAt)

    if (direction === 'up') {
        await ledger.updateOne(
            { _id: migration.id },
            { $set: { _id: migration.id, name: migration.name, appliedAt: startedAt } },
            { upsert: true },
        )
    } else {
        await ledger.deleteOne({ _id: migration.id })
    }

    return { id: migration.id, direction, skipped: false, entries: context.entries }
}

/**
 * Apply a list of migrations. `up` runs in order, `down` runs in reverse — the
 * only ordering that can undo a dependency chain.
 */
export async function runMigrations(migrations, {
    connection,
    direction = 'up',
    force = false,
    log = () => {},
} = {}) {
    const ordered = direction === 'up' ? [...migrations] : [...migrations].reverse()
    const results = []
    for (const migration of ordered) {
        results.push(await applyMigration(migration, { connection, direction, force, log }))
    }
    return results
}

/** Which migrations the target has already had applied. */
export async function appliedMigrationIds(connection) {
    assertSafeMigrationConnection(connection)
    const docs = await connection.db.collection(MIGRATIONS_COLLECTION).find({}).toArray()
    return docs.map((doc) => doc._id).sort()
}

/** The append-only journal, newest last. The durable record of what happened. */
export async function migrationJournal(connection, { migrationId, direction, kind } = {}) {
    assertSafeMigrationConnection(connection)
    const filter = {}
    if (migrationId) filter.migrationId = migrationId
    if (direction) filter.direction = direction
    if (kind) filter.kind = kind
    return connection.db.collection(JOURNAL_COLLECTION).find(filter).sort({ seq: 1 }).toArray()
}

/** Everything the migrations wrote down that a human has to look at. */
export async function migrationReports(connection, { migrationId } = {}) {
    assertSafeMigrationConnection(connection)
    const filter = migrationId ? { migrationId } : {}
    return connection.db.collection(REPORTS_COLLECTION).find(filter).toArray()
}
