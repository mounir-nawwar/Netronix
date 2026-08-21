// Migration target safety (DB-010).
//
// A migration rewrites documents in place. The single worst outcome of this
// directory is one of them running somewhere it was not meant to, so the target
// is judged **before** a connection is opened and every rule fails closed.
//
// These guards are deliberately stricter than the seed's. The seed accepts a
// database whose name contains `test`, `local`, `dev` or `demo`; a migration
// accepts only `test` or `scratch`, because the two operations are not
// comparable — a seed writes known fixtures into a disposable database, and a
// migration transforms whatever is already there.
//
// **Nothing here reads `process.env`.** Authorisation is not something a
// migration can infer from an environment variable or a `.env` file that
// happens to be lying around; the target has to be stated, in the invocation, by
// whoever is accountable for it. `MONGODB_URI` is never consulted.
//
// Kept free of I/O so the rules can be tested exhaustively in isolation
// (test/migrations/safety.test.js).

import {
    parseMongoUri,
    describeSeedTarget,
    ALLOWED_HOSTS,
    PRODUCTION_HOST_PATTERNS,
} from '../scripts/seedSafety.js'

export class UnsafeMigrationTargetError extends Error {
    constructor(reason, hint) {
        super(hint ? `${reason}\n  ${hint}` : reason)
        this.name = 'UnsafeMigrationTargetError'
        this.reason = reason
        this.hint = hint
    }
}

/** A migration target's database name must announce itself as disposable. */
export const REQUIRED_DB_NAME_MARKERS = ['test', 'scratch']

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/**
 * Database names that are refused outright, whatever else the name contains.
 * `e-commerce` is this application's own database.
 */
export const REFUSED_DB_NAMES = ['e-commerce', 'admin', 'config', 'local']

/**
 * Judge a migration target. Throws `UnsafeMigrationTargetError` unless every
 * rule passes.
 *
 * @param {string} uri
 * @param {object} [options]
 * @param {string} [options.dbName] Database name, when it is not in the URI.
 * @returns {{ hosts: object[], dbName: string, description: string }}
 */
export function assertSafeMigrationTarget(uri, { dbName } = {}) {
    // The parser is shared with the seed and raises the seed's error type. One
    // decision should have one error type, so a malformed or absent URI is
    // re-raised as an unsafe *migration* target — which is what it is.
    let parsed
    try {
        parsed = parseMongoUri(uri)
    } catch (error) {
        throw new UnsafeMigrationTargetError(
            error?.reason ?? 'The migration target could not be parsed.',
            error?.hint ?? 'State an explicit mongodb://127.0.0.1:<port>/<name> target.',
        )
    }

    // 1. SRV resolves to hosts nothing here can inspect, and is the standard
    //    form for hosted clusters.
    if (parsed.scheme === 'mongodb+srv') {
        throw new UnsafeMigrationTargetError(
            'Refusing a mongodb+srv:// URI: the SRV form resolves to hosts that cannot be checked here, and is the standard form for hosted clusters such as MongoDB Atlas.',
            'A migration may only be executed against an ephemeral loopback instance created by the test harness.',
        )
    }

    if (parsed.hosts.length === 0) {
        throw new UnsafeMigrationTargetError('The database URI names no host.')
    }

    // 2. Every host must be loopback. A named managed service says so.
    for (const { host } of parsed.hosts) {
        const known = PRODUCTION_HOST_PATTERNS.find(({ pattern }) => pattern.test(host))
        if (known) {
            throw new UnsafeMigrationTargetError(
                `Refusing to migrate "${host}": this is a ${known.service} host.`,
                'Migrations in this repository run only against an in-memory replica set on loopback.',
            )
        }
        const isLoopback = ALLOWED_HOSTS.has(String(host).toLowerCase()) || LOOPBACK_IPV4.test(String(host))
        if (!isLoopback) {
            throw new UnsafeMigrationTargetError(
                `Refusing to migrate "${host}": it is not a loopback host.`,
                `Allowed hosts: ${[...ALLOWED_HOSTS].join(', ')}, or any 127.x.x.x address.`,
            )
        }
    }

    // 3. Credentials are the strongest available signal of a shared instance.
    //    There is no override for a migration.
    if (parsed.hasCredentials) {
        throw new UnsafeMigrationTargetError(
            'Refusing a URI that carries credentials.',
            'An ephemeral local instance created by the test harness does not need them.',
        )
    }

    // 4. The database name must say out loud that it is disposable.
    const name = (dbName ?? parsed.dbName ?? '').trim()
    if (!name) {
        throw new UnsafeMigrationTargetError(
            'The migration target names no database.',
            'Name one explicitly, for example "netronix_test".',
        )
    }
    const lowered = name.toLowerCase()
    if (REFUSED_DB_NAMES.includes(lowered)) {
        throw new UnsafeMigrationTargetError(
            `Refusing to migrate database "${name}": it is a reserved or application database.`,
        )
    }
    if (!REQUIRED_DB_NAME_MARKERS.some((marker) => lowered.includes(marker))) {
        throw new UnsafeMigrationTargetError(
            `Refusing to migrate database "${name}": the name does not identify it as disposable.`,
            `The name must contain one of: ${REQUIRED_DB_NAME_MARKERS.join(', ')}. For example "netronix_test" or "netronix_scratch".`,
        )
    }

    return { hosts: parsed.hosts, dbName: name, description: describeSeedTarget({ ...parsed, dbName: name }) }
}

/**
 * Judge an already-open connection.
 *
 * The runner uses this as well as the URI check, so that a connection handed in
 * by a caller is judged on what it actually points at rather than on the string
 * it was built from.
 *
 * @param {import('mongoose').Connection|{host?: string, name?: string, client?: object}} connection
 */
export function assertSafeMigrationConnection(connection) {
    const host = connection?.host ?? connection?.client?.s?.options?.hosts?.[0]?.host
    const name = connection?.name ?? connection?.db?.databaseName

    if (!host) {
        throw new UnsafeMigrationTargetError('The connection does not report a host, so it cannot be judged safe.')
    }
    const isLoopback = ALLOWED_HOSTS.has(String(host).toLowerCase()) || LOOPBACK_IPV4.test(String(host))
    if (!isLoopback) {
        throw new UnsafeMigrationTargetError(`Refusing to migrate a connection to "${host}": it is not a loopback host.`)
    }

    const lowered = String(name ?? '').toLowerCase()
    if (!lowered) {
        throw new UnsafeMigrationTargetError('The connection does not report a database name.')
    }
    if (REFUSED_DB_NAMES.includes(lowered)) {
        throw new UnsafeMigrationTargetError(`Refusing to migrate database "${name}": it is a reserved or application database.`)
    }
    if (!REQUIRED_DB_NAME_MARKERS.some((marker) => lowered.includes(marker))) {
        throw new UnsafeMigrationTargetError(
            `Refusing to migrate database "${name}": the name does not identify it as disposable.`,
            `The name must contain one of: ${REQUIRED_DB_NAME_MARKERS.join(', ')}.`,
        )
    }

    return { host, dbName: name }
}
