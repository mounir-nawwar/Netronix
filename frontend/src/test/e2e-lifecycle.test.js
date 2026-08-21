// PHASE 3 RECOVERY — the end-to-end harness's process ownership, tested.
//
// The leak that motivated this file was not subtle and it was not detectable:
// the harness spawned `npx vite`, recorded the shim's pid, signalled the shim,
// and left the server that shim had started running for ever. Twenty-three of
// them accumulated across seven runs before anything noticed.
//
// The suite's default jsdom environment is kept deliberately: `child_process`
// and `/proc` are Node's either way, and a second environment would be a second
// thing to keep working for no benefit.
//
// These tests use the same code paths the harness does, against throwaway
// `node` processes that mimic the shape that broke: a parent with a child of
// its own. Nothing here starts Vite, Mongo or a browser.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STATE = join(tmpdir(), `netronix-e2e-lifecycle-${process.pid}.json`)

/** @type {typeof import('../../e2e/lifecycle.js')} */
let lifecycle

beforeAll(async () => {
    // Set before the module is loaded: the path is read once, at import.
    process.env.NETRONIX_E2E_STATE = STATE
    lifecycle = await import('../../e2e/lifecycle.js')
})

afterEach(async () => {
    await lifecycle.terminateOwned({ graceMs: 1_000 })
    lifecycle.clearState()
})

afterAll(() => {
    rmSync(STATE, { force: true })
    delete process.env.NETRONIX_E2E_STATE
})

/** Every pid on this machine whose command line contains `marker`. */
function pidsMatching(marker) {
    const found = []
    for (const entry of readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) continue
        try {
            const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8').replace(/\0/g, ' ')
            if (cmdline.includes(marker)) found.push(Number(entry))
        } catch {
            // gone, or not ours to read
        }
    }
    return found
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitUntil(predicate, timeoutMs = 8_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await predicate()) return true
        await settle(100)
    }
    return false
}

/**
 * A parent that starts a child and then idles — the `npx vite` shape.
 * `marker` appears in both command lines, so both are findable in `/proc`.
 */
function treeSource(marker) {
    return `
        const { spawn } = require('node:child_process');
        spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000) /* ${marker}-child */'], { stdio: 'ignore' });
        setInterval(() => {}, 1000); /* ${marker}-parent */
    `
}

describe('the E2E process lifecycle', () => {
    it('kills the whole process tree, not just the process it spawned', async () => {
        const marker = `netronix-lifecycle-tree-${Date.now()}`
        const child = lifecycle.spawnOwned({
            label: 'tree',
            command: process.execPath,
            args: ['-e', treeSource(marker)],
            cwd: process.cwd(),
            match: marker,
            onStderr: () => { },
        })

        // Both generations are up.
        expect(await waitUntil(async () => pidsMatching(marker).length >= 2)).toBe(true)
        expect(child.pid).toBeGreaterThan(0)

        const { stopped } = await lifecycle.terminateOwned({ graceMs: 3_000 })

        expect(stopped).toHaveLength(1)
        expect(stopped[0].gone).toBe(true)
        // The grandchild is the one the old harness left behind.
        expect(await waitUntil(async () => pidsMatching(marker).length === 0)).toBe(true)
    })

    it('records every owned process to the state file as it starts', async () => {
        const marker = `netronix-lifecycle-record-${Date.now()}`
        lifecycle.spawnOwned({
            label: 'recorded',
            command: process.execPath,
            args: ['-e', `setInterval(() => {}, 1000) /* ${marker} */`],
            cwd: process.cwd(),
            match: marker,
            onStderr: () => { },
        })

        // Written immediately, not at the end of a successful setup — which is
        // why a setup that throws half way through is still cleanable.
        const state = JSON.parse(readFileSync(STATE, 'utf8'))
        expect(state.owned).toHaveLength(1)
        expect(state.owned[0]).toMatchObject({ label: 'recorded', match: marker, group: true })
    })

    it('is idempotent — a second teardown is a no-op', async () => {
        const marker = `netronix-lifecycle-idempotent-${Date.now()}`
        lifecycle.spawnOwned({
            label: 'once',
            command: process.execPath,
            args: ['-e', `setInterval(() => {}, 1000) /* ${marker} */`],
            cwd: process.cwd(),
            match: marker,
            onStderr: () => { },
        })

        const first = await lifecycle.terminateOwned({ graceMs: 3_000 })
        expect(first.stopped).toHaveLength(1)

        const second = await lifecycle.terminateOwned({ graceMs: 1_000 })
        expect(second.stopped).toHaveLength(0)
        expect(second.skipped).toHaveLength(0)
    })

    it('refuses to claim a pid whose command line is not the one it started', async () => {
        // A pid alone proves nothing: they are recycled. This is the check that
        // keeps the harness from signalling something it did not start.
        expect(lifecycle.isOurs(process.pid, 'netronix-definitely-not-this')).toBe(false)
        expect(lifecycle.isOurs(process.pid, null)).toBe(true)
        expect(lifecycle.isOurs(2 ** 30, 'anything')).toBe(false)
    })

    it('adopts a process it did not spawn, and cleans it too', async () => {
        const marker = `netronix-lifecycle-adopt-${Date.now()}`
        const { spawn } = await import('node:child_process')
        const stray = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000) /* ${marker} */`], { stdio: 'ignore' })

        expect(await waitUntil(async () => pidsMatching(marker).length >= 1)).toBe(true)
        lifecycle.adoptOwned(stray.pid, { label: 'adopted', match: marker })

        await lifecycle.terminateOwned({ graceMs: 3_000 })
        expect(await waitUntil(async () => pidsMatching(marker).length === 0)).toBe(true)
    })

    describe('preflight', () => {
        it('refuses to start on top of a run whose processes are still alive', async () => {
            const marker = `netronix-lifecycle-preflight-${Date.now()}`
            lifecycle.spawnOwned({
                label: 'previous run',
                command: process.execPath,
                args: ['-e', `setInterval(() => {}, 1000) /* ${marker} */`],
                cwd: process.cwd(),
                match: marker,
                onStderr: () => { },
            })

            expect(() => lifecycle.preflight()).toThrow(/still owns live processes/i)
            // And it did not delete the other run's state file on its way out —
            // deleting it mid-run is how one recovery attempt lost a whole run.
            expect(JSON.parse(readFileSync(STATE, 'utf8')).owned).toHaveLength(1)
        })

        it('cleans a state file whose processes are provably dead', async () => {
            writeFileSync(STATE, JSON.stringify({
                owned: [{ pid: 2 ** 30, label: 'long gone', match: 'netronix-nope', group: true }],
            }))

            const result = lifecycle.preflight()
            expect(result.status).toBe('stale-cleaned')
            expect(result.cleaned).toHaveLength(1)
            expect(lifecycle.readState()).toBeNull()
        })

        it('is happy when there is no state file at all', () => {
            lifecycle.clearState()
            expect(lifecycle.preflight()).toEqual({ status: 'clean' })
        })
    })
})
