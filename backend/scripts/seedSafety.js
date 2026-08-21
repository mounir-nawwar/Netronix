// Seed target safety guards.
//
// The seed writes and, with --reset, deletes. The single worst outcome of this
// script is running it against a real database, so the target is validated
// before a connection is even attempted, and every rule fails closed.
//
// Kept free of I/O and of `process.env` reads so the rules can be tested
// exhaustively in isolation (test/scripts/seedSafety.test.js).

export class UnsafeSeedTargetError extends Error {
    constructor(reason, hint) {
        super(hint ? `${reason}\n  ${hint}` : reason)
        this.name = 'UnsafeSeedTargetError'
        this.reason = reason
        this.hint = hint
    }
}

/** Hosts the seed is allowed to write to. Anything else is refused. */
export const ALLOWED_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    'host.docker.internal', // Docker Desktop's loopback alias
])

/**
 * Hosts that are obviously managed/hosted. These are already excluded by the
 * allow-list above; they are listed separately only so the error message can
 * say *why* rather than just "not allowed".
 */
export const PRODUCTION_HOST_PATTERNS = [
    { pattern: /\.mongodb\.net$/i, service: 'MongoDB Atlas' },
    { pattern: /\.mongodb\.com$/i, service: 'MongoDB Cloud' },
    { pattern: /\.cosmos\.azure\.com$/i, service: 'Azure Cosmos DB' },
    { pattern: /\.docdb\.amazonaws\.com$/i, service: 'Amazon DocumentDB' },
    { pattern: /\.amazonaws\.com$/i, service: 'AWS' },
    { pattern: /\.azure\.com$/i, service: 'Azure' },
    { pattern: /\.digitalocean\.com$/i, service: 'DigitalOcean' },
    { pattern: /\.render\.com$/i, service: 'Render' },
    { pattern: /\.railway\.app$/i, service: 'Railway' },
    { pattern: /\.mlab\.com$/i, service: 'mLab' },
]

/** A database name must announce itself as disposable. */
export const REQUIRED_DB_NAME_MARKERS = ['test', 'local', 'dev', 'demo']

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/**
 * Parse a MongoDB connection string without a driver.
 *
 * `new URL()` cannot handle the multi-host form (`mongodb://a:1,b:2/db`), and
 * the driver's own parser would mean loading the driver before the target has
 * been judged safe.
 */
export function parseMongoUri(uri) {
    if (typeof uri !== 'string' || uri.trim() === '') {
        throw new UnsafeSeedTargetError('No database URI was supplied.')
    }

    const trimmed = uri.trim()
    const schemeMatch = /^(mongodb(?:\+srv)?):\/\//i.exec(trimmed)
    if (!schemeMatch) {
        throw new UnsafeSeedTargetError(
            'The database URI must start with mongodb:// or mongodb+srv://.',
        )
    }

    const scheme = schemeMatch[1].toLowerCase()
    const remainder = trimmed.slice(schemeMatch[0].length)

    const slashIndex = remainder.indexOf('/')
    const authority = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex)
    const afterAuthority = slashIndex === -1 ? '' : remainder.slice(slashIndex + 1)

    const queryIndex = afterAuthority.indexOf('?')
    const dbName = queryIndex === -1 ? afterAuthority : afterAuthority.slice(0, queryIndex)

    // Split on the last '@' so a password containing '@' cannot hide a host.
    const atIndex = authority.lastIndexOf('@')
    const hasCredentials = atIndex !== -1
    const hostPart = hasCredentials ? authority.slice(atIndex + 1) : authority

    const hosts = hostPart
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
        .map((entry) => {
            const ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(entry)
            if (ipv6) return { host: ipv6[1], port: ipv6[2] ? Number(ipv6[2]) : null }
            const [host, port] = entry.split(':')
            return { host, port: port ? Number(port) : null }
        })

    return { scheme, hosts, dbName: decodeURIComponent(dbName), hasCredentials }
}

/**
 * A description of the target that is safe to print: host and port and database
 * name only. Credentials and query parameters never appear.
 */
export function describeSeedTarget(parsed) {
    const hosts = parsed.hosts
        .map(({ host, port }) => (port ? `${host}:${port}` : host))
        .join(', ')
    return `${parsed.scheme}://${hosts} → database "${parsed.dbName}"`
}

/**
 * Judge a seed target. Throws `UnsafeSeedTargetError` unless every rule passes.
 *
 * @param {string}  uri
 * @param {object}  [options]
 * @param {boolean} [options.allowCredentials] Permit userinfo in the URI. Every
 *   other rule still applies, so this can never reach a remote host.
 * @returns {{ scheme: string, hosts: object[], dbName: string, hasCredentials: boolean, description: string }}
 */
export function assertSafeSeedTarget(uri, { allowCredentials = false } = {}) {
    const parsed = parseMongoUri(uri)

    // 1. SRV records resolve to hosts this parser cannot see, and the form is
    //    used almost exclusively by hosted clusters.
    if (parsed.scheme === 'mongodb+srv') {
        throw new UnsafeSeedTargetError(
            'Refusing a mongodb+srv:// URI: the SRV form resolves to hosts that cannot be checked here, and is the standard form for hosted clusters such as MongoDB Atlas.',
            'Use an explicit mongodb://127.0.0.1:27017/<name> URI for a local instance.',
        )
    }

    if (parsed.hosts.length === 0) {
        throw new UnsafeSeedTargetError('The database URI names no host.')
    }

    // 2. Every host must be loopback. Named services get a specific message.
    for (const { host } of parsed.hosts) {
        const known = PRODUCTION_HOST_PATTERNS.find(({ pattern }) => pattern.test(host))
        if (known) {
            throw new UnsafeSeedTargetError(
                `Refusing to seed "${host}": this is a ${known.service} host.`,
                'The seed only ever writes to a local instance.',
            )
        }
        const isLoopback = ALLOWED_HOSTS.has(host.toLowerCase()) || LOOPBACK_IPV4.test(host)
        if (!isLoopback) {
            throw new UnsafeSeedTargetError(
                `Refusing to seed "${host}": it is not a known local host.`,
                `Allowed hosts: ${[...ALLOWED_HOSTS].join(', ')}, or any 127.x.x.x address.`,
            )
        }
    }

    // 3. Credentials are the strongest available signal of a shared instance.
    if (parsed.hasCredentials && !allowCredentials) {
        throw new UnsafeSeedTargetError(
            'Refusing a URI that carries credentials.',
            'A disposable local instance should not need them. If your local MongoDB does require auth, pass --allow-credentials; every other guard still applies.',
        )
    }

    // 4. The database name must say out loud that it is disposable.
    if (!parsed.dbName) {
        throw new UnsafeSeedTargetError(
            'The database URI names no database.',
            'Append one, for example mongodb://127.0.0.1:27017/netronix_dev.',
        )
    }
    const lowered = parsed.dbName.toLowerCase()
    const marker = REQUIRED_DB_NAME_MARKERS.find((m) => lowered.includes(m))
    if (!marker) {
        throw new UnsafeSeedTargetError(
            `Refusing to seed database "${parsed.dbName}": the name does not identify it as disposable.`,
            `The name must contain one of: ${REQUIRED_DB_NAME_MARKERS.join(', ')}. For example "netronix_dev" or "netronix_demo". Note that the application's own database ("e-commerce") is deliberately excluded by this rule.`,
        )
    }

    return { ...parsed, description: describeSeedTarget(parsed) }
}

/**
 * Resolve the seed target from CLI arguments and the environment.
 *
 * `MONGODB_URI` is deliberately *not* consulted: that variable points at the
 * database the application actually runs against, and silently inheriting it is
 * exactly the accident these guards exist to prevent.
 */
export function resolveSeedUri({ argv = [], env = {} } = {}) {
    const flag = argv.find((arg) => arg.startsWith('--uri='))
    const uri = flag ? flag.slice('--uri='.length) : env.SEED_MONGODB_URI

    if (!uri || uri.trim() === '') {
        throw new UnsafeSeedTargetError(
            'No seed target was supplied.',
            'Pass --uri=mongodb://127.0.0.1:27017/netronix_dev or set SEED_MONGODB_URI. ' +
            'MONGODB_URI is ignored on purpose: it points at the database the application runs against.',
        )
    }

    return uri.trim()
}
