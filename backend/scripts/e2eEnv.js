// The local end-to-end environment: an in-memory MongoDB, a seeded catalog, and
// the API on a loopback port.
//
// **Nothing here touches an external service.** The database is a
// `MongoMemoryReplSet` this process creates and destroys; the seed writes the
// same fixed fixtures the test suite uses; Cloudinary and OpenAI are never
// configured, so the upload path and the chat model both take their offline
// branches. That is deliberate — an end-to-end test that needs a paid API to
// pass is a test nobody runs.
//
// It exists as a script rather than inside the Playwright config because the
// same environment is useful by hand: `node scripts/e2eEnv.js` stands the stack
// up and prints where it is.

import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-jwt-secret-not-a-real-secret-0123456789'

/** The admin the E2E flows sign in as. Created here, never seeded. */
export const E2E_ADMIN = {
    email: 'e2e-admin@netronix.test',
    password: 'e2e-admin-password-not-real',
}

let replSet = null

/**
 * @param {object} options
 * @param {number} options.port        the loopback port the API listens on
 * @param {string[]} options.corsOrigins the browser origins allowed to call it
 */
export async function startE2EEnvironment({ port = 4001, corsOrigins = [] } = {}) {
    // The clients run on ports chosen at run time, so the allow-list has to be
    // set before `app.js` is imported — `security.js` reads it once, at module
    // load. Getting this wrong is silent from the server's side and shows up
    // only in the browser, as every request failing preflight.
    if (corsOrigins.length > 0) {
        process.env.CORS_ORIGINS = corsOrigins.join(',')
    }

    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
    const uri = replSet.getUri()

    // `netronix_e2e_test` contains "test", which is what both the seed guard and
    // the stricter migration guard require of any target they will write to.
    await mongoose.connect(uri, { dbName: 'netronix_e2e_test' })

    const [{ default: productModel }, { default: orderModel }, { default: userModel }, { default: counterModel }] =
        await Promise.all([
            import('../models/productModel.js'),
            import('../models/orderModel.js'),
            import('../models/userModel.js'),
            import('../models/counterModel.js'),
        ])
    await Promise.all([productModel.init(), orderModel.init(), userModel.init(), counterModel.init()])

    const migrations = (await import('../migrations/index.js')).default
    const { runMigrations } = await import('../migrations/runner.js')
    await runMigrations(migrations, { connection: mongoose.connection, direction: 'up', force: true })

    const { seedInto } = await import('./seed.js')
    await seedInto({ quiet: true })

    // The seed deliberately creates no administrator — a seeded admin is a
    // published credential. This one is made here, for this process only.
    await userModel.create({
        name: 'E2E Admin',
        email: E2E_ADMIN.email,
        password: await bcrypt.hash(E2E_ADMIN.password, 10),
        role: 'admin',
        tokenVersion: 0,
        cartData: {},
        wishlist: [],
    })

    const { default: app } = await import('../app.js')
    const server = await new Promise((resolve) => {
        const listener = app.listen(port, '127.0.0.1', () => resolve(listener))
    })

    return {
        uri,
        // Exposed so the Playwright harness can record the `mongod` pid it
        // spawned and prove, after the run, that nothing was left behind.
        replSet,
        apiUrl: `http://127.0.0.1:${server.address().port}`,
        async stop() {
            await new Promise((resolve) => server.close(resolve))
            await mongoose.connection.dropDatabase().catch(() => { })
            await mongoose.disconnect()
            await replSet.stop()
            replSet = null
        },
    }
}

// Run directly for a manual session.
if (import.meta.url === `file://${process.argv[1]}`) {
    const env = await startE2EEnvironment()
    console.log(`API listening on ${env.apiUrl}`)
    console.log(`Mongo (in-memory, destroyed on exit): ${env.uri}`)
    process.on('SIGINT', async () => { await env.stop(); process.exit(0) })
}
