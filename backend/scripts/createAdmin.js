// Create or promote an admin user (SEC-001).
//
// The admin used to be a pair of environment variables compared in plaintext,
// with the pair then signed *into* the session token. Replacing that scheme
// needs a real user document with `role: 'admin'` and a bcrypt hash, and this
// is the only supported way to make one.
//
// Safety
// ------
// This script writes to a database, so it inherits the seed's guards verbatim
// — `assertSafeSeedTarget` from scripts/seedSafety.js. The target must be
// stated explicitly, must be a loopback host, must not use the `mongodb+srv://`
// form, and its database name must contain test/local/dev/demo. There is no
// flag that relaxes any of it, and `MONGODB_URI` is deliberately never
// consulted, so this cannot inherit the database the application runs against.
//
// Creating a production administrator is an operational task for whoever owns
// that environment, carried out against a database this repository has no
// business touching. `BLOCKED_EXTERNAL_OPERATION` — see
// .local-audit/22_PHASE_1_STATUS.md.
//
// Secrets
// -------
// The password is read from `ADMIN_INITIAL_PASSWORD` or from a hidden prompt.
// It is never accepted on the command line, because argv is visible to every
// other process on the machine and lands in shell history. It is never printed,
// never logged, and never echoed while being typed. Only the host, the database
// name and the email address ever reach stdout.
//
// Usage
//   node scripts/createAdmin.js --uri=mongodb://127.0.0.1:27017/netronix_dev --email=admin@example.test
//   ADMIN_INITIAL_PASSWORD=... node scripts/createAdmin.js --uri=... --email=...

import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import readline from 'readline'

import userModel from '../models/userModel.js'
import { assertSafeSeedTarget, describeSeedTarget, parseMongoUri, UnsafeSeedTargetError } from './seedSafety.js'

const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_BYTES = 72
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseArgs(argv) {
    const args = {}
    for (const entry of argv) {
        const match = /^--([^=]+)(?:=(.*))?$/.exec(entry)
        if (!match) continue
        args[match[1]] = match[2] ?? true
    }
    return args
}

/** Read a password without echoing it to the terminal. */
function promptHidden(question) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error(
                'No password supplied and stdin is not a terminal.\n' +
                '  Set ADMIN_INITIAL_PASSWORD, or run this interactively.',
            ))
            return
        }

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
        const onData = (char) => {
            // Suppress the echo of everything except the terminating newline.
            if (!['\n', '\r', ''].includes(String(char))) {
                process.stdout.write('[2K[200D' + question)
            }
        }
        process.stdin.on('data', onData)

        rl.question(question, (value) => {
            process.stdin.removeListener('data', onData)
            rl.close()
            process.stdout.write('\n')
            resolve(value)
        })
    })
}

function validatePassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`The admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
        throw new Error(`The admin password must be ${MAX_PASSWORD_BYTES} bytes or fewer (bcrypt truncates beyond that).`)
    }
}

export async function createAdmin({ uri, email, password, connect = true } = {}) {
    // Fails closed before a connection is attempted.
    assertSafeSeedTarget(uri)

    if (!EMAIL_PATTERN.test(String(email ?? ''))) {
        throw new Error('A valid --email is required.')
    }
    validatePassword(password)

    const normalisedEmail = String(email).trim().toLowerCase()

    if (connect) await mongoose.connect(uri)

    const hash = await bcrypt.hash(password, 10)
    const existing = await userModel.findOne({ email: normalisedEmail })

    if (existing) {
        existing.password = hash
        existing.role = 'admin'
        // Every token previously issued for this account stops working. That is
        // the point: a password change that leaves old sessions alive is not a
        // password change (SEC-003).
        existing.tokenVersion = Number(existing.tokenVersion ?? 0) + 1
        await existing.save()
        return { created: false, id: String(existing._id), email: normalisedEmail }
    }

    const user = await userModel.create({
        name: 'Administrator',
        email: normalisedEmail,
        password: hash,
        role: 'admin',
        tokenVersion: 0,
        cartData: {},
        wishlist: [],
    })
    return { created: true, id: String(user._id), email: normalisedEmail }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const uri = typeof args.uri === 'string' ? args.uri : process.env.CREATE_ADMIN_MONGODB_URI

    if (!uri) {
        throw new UnsafeSeedTargetError(
            'No database URI was supplied.',
            'Pass --uri=mongodb://127.0.0.1:27017/netronix_dev, or set CREATE_ADMIN_MONGODB_URI.',
        )
    }

    // Judge the target before anything else happens.
    assertSafeSeedTarget(uri)
    console.log(`Target: ${describeSeedTarget(parseMongoUri(uri))}`)

    if (typeof args.password === 'string') {
        throw new Error(
            'Refusing --password: command-line arguments are visible to other processes and are stored in shell history.\n' +
            '  Set ADMIN_INITIAL_PASSWORD, or leave it out and type it at the prompt.',
        )
    }

    const password = process.env.ADMIN_INITIAL_PASSWORD ?? await promptHidden('Admin password (not echoed): ')

    const result = await createAdmin({ uri, email: args.email, password })

    console.log(result.created
        ? `✅ Created admin ${result.email}`
        : `✅ Updated existing user ${result.email} to role "admin" and revoked their existing sessions`)
    console.log('   The password was not printed and is not recoverable from this output.')
}

// Only run when executed directly, so importing this module in a test does not
// connect to anything.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('createAdmin.js')

if (invokedDirectly) {
    main()
        .then(() => mongoose.disconnect())
        .catch(async (error) => {
            console.error(`\n❌ ${error.message}\n`)
            await mongoose.disconnect().catch(() => { })
            process.exitCode = 1
        })
}
