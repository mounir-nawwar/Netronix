// Durable evidence, written before the write it describes (DB-010).
//
// Two defects this exists for.
//
// **Rollback destroyed data `up()` never touched.** Every `down()` here was an
// `updateMany({}, { $unset: … })` over the whole collection. That is correct
// only for the instant after `up()` finished; from then on the collection also
// contains documents created *by the running application*, whose `priceMinor`,
// `inventoryV2`, `statusHistory`, `archived` and `showcase` are not the
// migration's backfill but the record itself. Rolling back unset a live
// product's price, a real audit trail, and the archived flag on products an
// administrator had deliberately archived — silently, and for every document in
// the collection.
//
// **The evidence was written after the fact.** `runner.js` inserted the report
// document once the migration returned, while 003 reassigned order numbers, 006
// pruned dangling references and 007 coerced statuses *during* the run. A crash
// in the middle left the destructive write applied and nothing recorded — and
// 006's and 007's own `down()` read that report as their only source of truth,
// so the rollback for the writes that had happened was gone.
//
// What this module does
// ----------------------
// One append-only collection. Every entry is inserted **before** the write it
// describes, so at every instant the journal is a superset of what has actually
// happened rather than a subset. Two kinds of entry:
//
//   * `report` — something a human has to look at, exactly as before.
//   * `own`    — "this migration set these fields on this document, from these
//                previous values". `revertOwned` reads them back and undoes
//                only the ones that still hold the value the migration wrote.
//                Anything a later write changed is left alone and reported.
//
// The consequence worth stating plainly: rollback is exact for everything the
// migration did, and **never** touches a document it did not touch or a value
// something else has since changed.

/** Append-only evidence, one document per entry. */
export const JOURNAL_COLLECTION = 'migrationJournal'

const MISSING = Symbol('missing')

/** Deep structural equality, enough for the scalar/array/object values stored here. */
export function sameValue(a, b) {
    if (a === b) return true
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
    if (a === null || b === null || a === undefined || b === undefined) return false
    if (typeof a !== 'object' || typeof b !== 'object') return String(a) === String(b)

    // ObjectId and anything else with a meaningful string form.
    if (typeof a.equals === 'function' && typeof b?.toString === 'function') {
        try { if (a.equals(b)) return true } catch { /* not comparable */ }
    }

    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a)) {
        return a.length === b.length && a.every((entry, index) => sameValue(entry, b[index]))
    }

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => sameValue(a[key], b[key]))
}

/**
 * The journal for one run of one migration in one direction.
 *
 * @param {import('mongodb').Db} db
 * @param {{migration: object, direction: string, runId: string}} context
 */
export function createJournal(db, { migration, direction, runId }) {
    const collection = db.collection(JOURNAL_COLLECTION)
    const entries = []
    let sequence = 0

    const base = () => ({
        migrationId: migration.id,
        direction,
        runId,
        seq: (sequence += 1),
        at: new Date(),
    })

    return {
        entries,

        /**
         * Record something the migration could not decide for itself.
         *
         * Durable on return, which is the whole point: a crash after this and
         * before the write it precedes leaves an entry describing work that did
         * not happen, and a re-run is idempotent. The other order — write, then
         * record — loses the record of work that *did*.
         */
        async report(entry) {
            entries.push(entry)
            await collection.insertOne({ ...base(), kind: 'report', entry })
        },

        /**
         * Record that this migration is about to set `set` (and unset `unset`)
         * on one document, over the values in `before`.
         *
         * `before` uses `null` for "the field was absent", which is
         * distinguishable from a stored `null` by the `absent` list.
         */
        async own({ collection: name, id, set = {}, unset = [], before = {} }) {
            const absent = Object.keys({ ...set, ...Object.fromEntries(unset.map((f) => [f, 1])) })
                .filter((field) => before[field] === undefined)

            await collection.insertOne({
                ...base(),
                kind: 'own',
                target: { collection: name, id },
                set,
                unset,
                before,
                absent,
            })
        },

        /** Everything a previous `up()` of this migration recorded owning. */
        async ownedByUp() {
            return collection
                .find({ migrationId: migration.id, direction: 'up', kind: 'own' })
                .sort({ seq: 1 })
                .toArray()
        },

        /** Every report a previous `up()` of this migration wrote. */
        async reportsFromUp() {
            const docs = await collection
                .find({ migrationId: migration.id, direction: 'up', kind: 'report' })
                .sort({ seq: 1 })
                .toArray()
            return docs.map((doc) => doc.entry)
        },
    }
}

/**
 * Undo exactly what a migration wrote, and nothing else.
 *
 * For each ownership record: if the document still holds the value `up()` wrote,
 * put the previous value back (or unset the field, when there was none). If it
 * holds something different, a later write changed it — that value is the
 * record now, so it is **preserved** and reported.
 *
 * This is the difference between "the rollback is exact" and "the rollback is
 * exact for a database nothing has used since".
 *
 * @param {import('mongodb').Db} db
 * @param {ReturnType<createJournal>} journal
 * @returns {Promise<{reverted: number, preserved: number}>}
 */
export async function revertOwned(db, journal) {
    const owned = await journal.ownedByUp()
    let reverted = 0
    let preserved = 0

    // Newest first, so a field written by two records ends at the oldest value.
    for (const record of [...owned].reverse()) {
        const target = db.collection(record.target.collection)
        const current = await target.findOne({ _id: record.target.id })
        if (!current) continue

        const absent = new Set(record.absent ?? [])
        const restore = {}
        const remove = {}

        for (const [field, written] of Object.entries(record.set ?? {})) {
            const now = field in current ? current[field] : MISSING

            if (now === MISSING) continue          // already gone; nothing to undo
            if (!sameValue(now, written)) {
                preserved += 1
                await journal.report({
                    kind: 'post-up-write-preserved',
                    collection: record.target.collection,
                    id: String(record.target.id),
                    field,
                    reason: 'this value was changed after the migration ran, so the rollback left it alone',
                })
                continue
            }

            if (absent.has(field)) remove[field] = ''
            else restore[field] = record.before[field]
            reverted += 1
        }

        // A field `up()` removed is put back exactly as it was.
        for (const field of record.unset ?? []) {
            if (absent.has(field)) continue
            if (field in current) continue
            restore[field] = record.before[field]
            reverted += 1
        }

        const update = {}
        if (Object.keys(restore).length > 0) update.$set = restore
        if (Object.keys(remove).length > 0) update.$unset = remove
        if (Object.keys(update).length > 0) await target.updateOne({ _id: record.target.id }, update)
    }

    return { reverted, preserved }
}
