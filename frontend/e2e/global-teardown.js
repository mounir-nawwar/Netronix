// Idempotent: safe after a clean run, a failed run, a run whose setup threw, and
// safe to call twice. Everything it stops was recorded when it was started, and
// each pid is re-checked against `/proc` before it is signalled.

import { clearState, terminateOwned } from './lifecycle.js'

export default async function globalTeardown() {
    const api = globalThis.__netronixE2E?.api
    globalThis.__netronixE2E = undefined

    // The API listener and the in-memory database first: `stop()` closes the
    // socket, drops the scratch database and shuts the replica set down
    // politely. Anything it leaves behind is caught by `terminateOwned`.
    try {
        await api?.stop()
    } catch (error) {
        console.error('[e2e] the API did not stop cleanly:', error?.message ?? error)
    }

    const { stopped, skipped } = await terminateOwned()
    for (const entry of stopped) {
        console.log(`[e2e] ${entry.label} (pid ${entry.pid}) ${entry.gone ? 'stopped' : 'DID NOT STOP'}`)
    }
    for (const entry of skipped) {
        console.log(`[e2e] ${entry.label} (pid ${entry.pid}) skipped — ${entry.reason}`)
    }

    clearState()
}
