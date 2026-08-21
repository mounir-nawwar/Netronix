// In-memory MongoDB for tests.
//
// Started as a single-node *replica set* rather than a standalone `mongod`
// because transactions require one, and the transactional order-placement tests
// (D-4 / DB-001) land in Phase 2. Standing the replica set up now means those
// tests do not also have to change the harness.
//
// The server binds to 127.0.0.1 on an ephemeral port and is destroyed when the
// suite ends. No external or hosted database is ever contacted.

import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { beforeAll, afterAll, afterEach } from 'vitest'

import productModel from '../../models/productModel.js'
import orderModel from '../../models/orderModel.js'
import userModel from '../../models/userModel.js'
import counterModel from '../../models/counterModel.js'
import migrations from '../../migrations/index.js'
import { runMigrations } from '../../migrations/runner.js'

/** @type {import('mongodb-memory-server').MongoMemoryReplSet | null} */
let replSet = null

/**
 * The database name every suite uses.
 *
 * It contains `test` on purpose: `migrations/safety.js` refuses any target whose
 * name does not, so a migration cannot be executed here by accident *or*
 * anywhere else by design. The host is loopback on an ephemeral port and the
 * server is destroyed when the suite ends.
 */
export const TEST_DB_NAME = 'netronix_test'

/** Start the in-memory replica set and connect mongoose to it. */
export async function connectTestDatabase() {
    if (replSet) return replSet.getUri()

    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' },
    })

    const uri = replSet.getUri()
    await mongoose.connect(uri, { dbName: TEST_DB_NAME })

    // Build the schema-declared indexes deterministically rather than waiting
    // for Mongoose's lazy `autoIndex`, so an index assertion never races the
    // build that satisfies it.
    await Promise.all([productModel.init(), orderModel.init(), userModel.init(), counterModel.init()])

    // Bring the schema up to date exactly as a deployment would: through the
    // migrations, in order. This is the only place they are executed, and the
    // target is the ephemeral loopback replica set created two lines above.
    await applyTestMigrations()

    return uri
}

/**
 * Run every migration `up()` against the in-memory replica set.
 *
 * Exported so a suite that has rolled one back can restore it.
 */
export async function applyTestMigrations({ force = false } = {}) {
    return runMigrations(migrations, { connection: mongoose.connection, direction: 'up', force })
}

/**
 * Drop every document without dropping indexes — cheap per-test isolation.
 *
 * The migration ledger is emptied along with everything else, which is
 * deliberate: a migration suite then starts from "nothing applied" without
 * having to reach into the ledger itself. The indexes the migrations created
 * survive, because `deleteMany` does not touch them.
 */
export async function clearTestDatabase() {
    if (mongoose.connection.readyState !== 1) return
    const collections = await mongoose.connection.db.collections()
    await Promise.all(collections.map((collection) => collection.deleteMany({})))
}

/** Disconnect mongoose and shut the in-memory server down. */
export async function disconnectTestDatabase() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase().catch(() => { })
        await mongoose.disconnect()
    }
    if (replSet) {
        await replSet.stop()
        replSet = null
    }
}

/** The URI of the running in-memory server, or null if it is not running. */
export function testDatabaseUri() {
    return replSet ? replSet.getUri() : null
}

/**
 * Register the standard lifecycle for a suite that needs a database:
 * connect once, wipe between tests, tear down at the end.
 */
export function useTestDatabase() {
    beforeAll(async () => {
        await connectTestDatabase()
    })

    afterEach(async () => {
        await clearTestDatabase()
    })

    afterAll(async () => {
        await disconnectTestDatabase()
    })
}
