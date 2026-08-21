// Stand up the whole stack: in-memory MongoDB, seeded catalog, API, storefront
// and admin console — all on loopback, all destroyed afterwards.
//
// Process ownership and cleanup live in `lifecycle.js`; this file is only the
// order in which things come up. What matters here is that *every* exit path —
// including a readiness timeout half way through — goes through
// `terminateOwned()`, because Playwright does not run the global teardown when
// the global setup throws.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { adoptOwned, patchState, preflight, spawnOwned, terminateOwned } from './lifecycle.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

/**
 * A port nothing is listening on.
 *
 * Fixed ports looked simpler and were worse: a dev server left behind by an
 * aborted run answers the readiness poll below, so the suite happily proceeds
 * against a stale build pointed at an API that no longer exists — which is
 * exactly what happened, and it reported as seventeen unrelated assertion
 * failures rather than as "the port was taken".
 */
async function freePort() {
    const { createServer } = await import('node:net')
    return new Promise((settle, reject) => {
        const probe = createServer()
        probe.unref()
        probe.on('error', reject)
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address()
            probe.close(() => settle(port))
        })
    })
}

/** Poll until a URL answers, or give up with a message naming what did not. */
async function waitFor(url, label, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        try {
            const response = await fetch(url)
            if (response.ok || response.status < 500) return
        } catch {
            // not up yet
        }
        if (Date.now() > deadline) throw new Error(`${label} did not come up at ${url} within ${timeoutMs}ms`)
        await new Promise((r) => setTimeout(r, 500))
    }
}

async function issueToken(url, credentials, label) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
    })
    const body = await response.json()
    if (!response.ok || !body?.token) {
        throw new Error(`${label} session provisioning failed: ${response.status} ${JSON.stringify(body)}`)
    }
    return body.token
}

/**
 * Vite, as one process.
 *
 * Deliberately `node node_modules/vite/bin/vite.js` rather than `npx vite`:
 * `npx` is a shim that runs the real server as its own child, so the pid the
 * harness recorded was never the pid of the thing listening on the port. That
 * one indirection is what leaked twenty-three servers.
 */
function startVite(cwd, port, env) {
    const bin = resolve(cwd, 'node_modules/vite/bin/vite.js')
    if (!existsSync(bin)) throw new Error(`vite is not installed in ${cwd} — run npm install there first`)

    return spawnOwned({
        label: `vite:${port}`,
        command: process.execPath,
        args: [bin, '--port', String(port), '--host', '127.0.0.1', '--strictPort'],
        cwd,
        env,
        // `--strictPort` makes a taken port fatal rather than a silent
        // reassignment, and the port makes the command line unique to this run.
        match: `--port ${port}`,
    })
}

/** Whatever `mongodb-memory-server` actually spawned, across its shapes. */
function mongodPidsOf(replSet) {
    const servers = replSet?.servers ?? []
    return servers
        .map((server) => {
            const info = server?.instanceInfo
            return info?.instance?.mongodProcess?.pid
                ?? info?.instance?.childProcess?.pid
                ?? info?.childProcess?.pid
                ?? info?.pid
                ?? null
        })
        .filter((pid) => Number.isInteger(pid) && pid > 0)
}

export default async function globalSetup() {
    // Never start on top of a run that is still alive; clean only a run that
    // provably is not.
    const before = preflight()
    if (before.status === 'stale-cleaned' && before.cleaned.length > 0) {
        console.log(`[e2e] cleared a stale state file listing ${before.cleaned.length} dead process(es)`)
    }

    try {
        const { startE2EEnvironment, E2E_ADMIN } = await import(
            resolve(repoRoot, 'backend/scripts/e2eEnv.js')
        )

        // Every port is allocated first, because the API's CORS allow-list has
        // to name the client origins before the app module is loaded.
        const API_PORT = await freePort()
        const STOREFRONT_PORT = await freePort()
        const ADMIN_PORT = await freePort()

        const api = await startE2EEnvironment({
            port: API_PORT,
            corsOrigins: [
                `http://127.0.0.1:${STOREFRONT_PORT}`,
                `http://127.0.0.1:${ADMIN_PORT}`,
                `http://localhost:${STOREFRONT_PORT}`,
                `http://localhost:${ADMIN_PORT}`,
            ],
        })

        // `mongod` is spawned by the memory server inside this runner's own
        // process group, so it is adopted rather than owned: recorded, checked
        // and cleaned like everything else, but signalled directly.
        for (const pid of mongodPidsOf(api.replSet)) {
            adoptOwned(pid, { label: 'mongod', match: 'mongod' })
        }

        const clientEnv = {
            VITE_BACKEND_URL: api.apiUrl,
            VITE_FRONTEND_URL: `http://127.0.0.1:${STOREFRONT_PORT}`,
        }

        startVite(resolve(repoRoot, 'frontend'), STOREFRONT_PORT, clientEnv)
        startVite(resolve(repoRoot, 'admin'), ADMIN_PORT, clientEnv)

        await waitFor(`http://127.0.0.1:${STOREFRONT_PORT}`, 'the storefront')
        await waitFor(`http://127.0.0.1:${ADMIN_PORT}`, 'the admin console')
        await waitFor(`${api.apiUrl}/api/product/list`, 'the API')

        // Provision session-only specs once. Journeys that test authentication
        // still use the forms, but unrelated specs no longer compete for the
        // production per-IP limiter budget in test order.
        // A dedicated account: the cart-merge journey logs out the seeded demo
        // user and revokes all of that user's older tokens. Reusing one here
        // would make the later wishlist spec order-dependent.
        const customerToken = await issueToken(`${api.apiUrl}/api/user/register`, {
            name: 'E2E Session User',
            email: 'e2e-session@netronix.test',
            password: 'E2eSessionPassword123!',
        }, 'customer')
        const adminToken = await issueToken(`${api.apiUrl}/api/user/admin`, E2E_ADMIN, 'admin')

        // Handed to the tests and to the teardown through a file, because a
        // global setup and the workers are separate processes. The owned pids
        // are already in there — `spawnOwned` wrote each one as it started.
        patchState({
            apiUrl: api.apiUrl,
            storefrontUrl: `http://127.0.0.1:${STOREFRONT_PORT}`,
            adminUrl: `http://127.0.0.1:${ADMIN_PORT}`,
            admin: E2E_ADMIN,
            customerToken,
            adminToken,
            startedAt: new Date().toISOString(),
        })

        globalThis.__netronixE2E = { api }
    } catch (error) {
        // Playwright will not call the global teardown after this throws.
        console.error('[e2e] global setup failed — stopping anything it had already started')
        await terminateOwned()
        await globalThis.__netronixE2E?.api?.stop?.().catch(() => { })
        throw error
    }
}
