// Process entry point: the only file that validates configuration, connects to
// external services, and opens a listening socket. The Express application
// itself lives in `app.js` so tests can import it without any of this happening
// (B-0).
//
// Order matters here, and it is deliberate: **configuration is validated before
// anything external is contacted**. A deployment with a placeholder JWT_SECRET
// must fail before it opens a database connection, not after (SEC-014).
//
// Nothing in this file prints a secret, or any part of one. An earlier version
// logged a masked OpenAI key — first ten characters and last four — which is
// secret material in a log, in a bug report, and in a screen share. A key is
// either configured or it is not; that is all a log line needs.
//
// BE-011 — the `console.*` calls that used to be here are `pino` lines now, so
// a boot sequence is machine-readable and joins up with the request logs that
// follow it. The two exceptions are the fatal paths below: a configuration
// error has to be legible to a person reading a terminal, and its whole point
// is that the process is about to exit, so it is written to stderr in plain
// text *as well as* logged.

import dotenv from 'dotenv'
dotenv.config();
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import { loadEnv, EnvValidationError } from './config/env.js'
import logger from './lib/logger.js'
import telemetry from './lib/telemetry.js'
import app from './app.js'

logger.info({ event: 'boot.start' }, 'Netronix API starting')

// Validate configuration before touching anything external. Fails fast with a
// list of every offending variable; never prints a value.
let config
try {
    ({ config } = loadEnv())
} catch (error) {
    if (error instanceof EnvValidationError) {
        // Plain text on stderr as well as a log line: this is the one message
        // whose reader is a person staring at a terminal wondering why the
        // process died, and a JSON blob serves them badly.
        process.stderr.write(`\n❌ ${error.message}\n\n`)
        logger.fatal({ event: 'boot.invalid_config', problems: error.problems.map((p) => p.variable) }, 'invalid configuration')
        process.exit(1)
    }
    throw error
}

if (!config.GROQ_API_KEY) {
    logger.warn({ event: 'boot.groq_absent' }, 'GROQ_API_KEY is not set — the chatbot will return its unavailable reply')
} else {
    logger.info({ event: 'boot.groq_configured' }, 'Groq API key is configured')
}

// DEVOPS-005 — off unless an operator sets SENTRY_DSN *and* supplies an SDK.
// With neither, this line makes no network call and constructs nothing.
logger.info(
    { event: 'boot.telemetry', enabled: telemetry.enabled, reason: telemetry.reason },
    telemetry.enabled ? 'error telemetry enabled' : 'error telemetry disabled',
)

const port = config.PORT

async function start() {
    // Await the connection before accepting traffic. The pre-split server
    // called connectDB() without awaiting it and began serving requests while
    // MongoDB was still connecting.
    try {
        await connectDB()
    } catch (error) {
        // `error.message` from a driver can carry the connection string, so
        // only the error type is recorded (SEC-016).
        logger.fatal({ event: 'boot.mongodb_failed', name: error?.name }, 'could not connect to MongoDB — not starting')
        process.stderr.write(`\n❌ Failed to connect to MongoDB. The server will not start.\n   ${error?.name}\n\n`)
        process.exit(1)
    }

    try {
        await connectCloudinary()
    } catch (error) {
        logger.fatal({ event: 'boot.cloudinary_failed', name: error?.name }, 'could not configure Cloudinary — not starting')
        process.stderr.write(`\n❌ Failed to configure Cloudinary. The server will not start.\n   ${error?.name}\n\n`)
        process.exit(1)
    }

    // No session sweep to start any more. Chat sessions are documents with a
    // TTL index (BE-001), so expiry is the database's job and this process
    // holds no timer at all.
    app.listen(port, () => logger.info({ event: 'boot.listening', port }, `listening on port ${port}`))
}

start().catch((error) => {
    logger.fatal({ event: 'boot.failed', name: error?.name }, 'unexpected startup failure — not starting')
    telemetry.captureException(error, { phase: 'startup' })
    process.stderr.write(`\n❌ Unexpected startup failure. The server will not start.\n   ${error?.name}\n\n`)
    process.exit(1)
})
