// PHASE 3 RECOVERY — process ownership for the local end-to-end run.
//
// The previous harness leaked every server it started. Three separate reasons,
// all of them fixed here:
//
//  1. It spawned `npx vite`. The pid it recorded and later signalled was npm's
//     `npx` shim; the Vite server was that shim's *child*, so `SIGTERM` to the
//     shim left a re-parented Vite listening for ever. Two per run.
//  2. `globalSetup` had no failure path. Playwright does not run
//     `globalTeardown` when the setup throws, so a readiness timeout — or any
//     error after the servers were up — leaked both of them with nothing
//     recorded anywhere that could find them again.
//  3. Nothing handled `SIGINT`/`SIGTERM` on the runner, so an interrupted run
//     (which is how this suite was actually stopped) leaked everything.
//
// The rules this module enforces:
//
//  * Every long-lived process is spawned into **its own process group**
//    (`detached: true`), so the group leader's pid is a handle on the whole
//    tree — shim, server, and any worker alike.
//  * Ownership is recorded to the run's state file **as each process starts**,
//    not at the end of a successful setup.
//  * Nothing is ever signalled unless it is still alive *and* `/proc` says its
//    command line is the one this run started. A recycled pid is not ours.
//  * Termination is idempotent, and runs on success, failure, timeout, SIGINT,
//    SIGTERM and an uncaught exception alike.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Where the run publishes its ports, credentials and owned pids.
 *
 * Overridable so the lifecycle's own tests can exercise the real code against a
 * throwaway file instead of the one a run would be using.
 */
export const STATE_FILE = process.env.NETRONIX_E2E_STATE
    ? resolve(process.env.NETRONIX_E2E_STATE)
    : resolve(here, '.e2e-state.json')

/** pid -> { label, match, group } for everything this process started. */
const owned = new Map()

let handlersInstalled = false
let terminating = null

// ---------------------------------------------------------------------------
// state file

export function readState(file = STATE_FILE) {
    if (!existsSync(file)) return null
    try {
        return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
        return null
    }
}

/** Merge into the state file. Written eagerly, so a crash still leaves a trail. */
export function patchState(patch, file = STATE_FILE) {
    const next = { ...(readState(file) ?? {}), ...patch }
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
    return next
}

export function clearState(file = STATE_FILE) {
    rmSync(file, { force: true })
}

// ---------------------------------------------------------------------------
// identity

/**
 * The command line of a live process, or `null` if there is no such process.
 *
 * `/proc` is the point: a pid alone proves nothing, because pids are recycled.
 * Comparing the command line is what makes "this process is mine" checkable
 * rather than assumed — and it is the reason this module can promise never to
 * signal something it did not start.
 */
export function commandLineOf(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null
    try {
        return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
    } catch {
        // Either the process is gone or this is not Linux. Fall back to a
        // liveness probe, which is weaker but never wrong about death.
        try {
            process.kill(pid, 0)
            return ''
        } catch {
            return null
        }
    }
}

/** Alive *and* still the process we started. */
export function isOurs(pid, match) {
    const cmdline = commandLineOf(pid)
    if (cmdline === null) return false
    if (!match) return true
    return cmdline.includes(match)
}

// ---------------------------------------------------------------------------
// starting

/**
 * Start a process this run owns.
 *
 * @param {object} options
 * @param {string} options.label     what it is, for reports
 * @param {string} options.command   executable
 * @param {string[]} options.args
 * @param {string} options.cwd
 * @param {object} [options.env]
 * @param {string} options.match     a substring of the command line, used to
 *                                   prove the pid is still ours before killing
 * @param {(line: string) => void} [options.onStderr]
 */
export function spawnOwned({ label, command, args, cwd, env = {}, match, onStderr }) {
    installSignalHandlers()

    const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: 'pipe',
        // Its own process group. `kill(-pid)` then reaches the whole tree,
        // which is what the `npx` shim leak needed and never had.
        detached: true,
    })

    child.stdout.on('data', () => { })
    child.stderr.on('data', (chunk) => {
        if (onStderr) onStderr(String(chunk))
        else process.stderr.write(`[${label}] ${chunk}`)
    })
    child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null && !terminating) {
            console.error(`[${label}] exited with code ${code} before the suite finished`)
        }
        if (signal && !terminating) console.error(`[${label}] was killed by ${signal}`)
    })

    owned.set(child.pid, { label, match, group: true })
    recordOwned()
    return child
}

/**
 * Adopt a process someone else started — `mongod`, spawned by
 * `mongodb-memory-server` inside this runner's own group. It is not a group
 * leader, so it is signalled directly rather than by group.
 */
export function adoptOwned(pid, { label, match }) {
    if (!Number.isInteger(pid) || pid <= 0) return
    installSignalHandlers()
    owned.set(pid, { label, match, group: false })
    recordOwned()
}

function recordOwned() {
    patchState({
        owned: [...owned.entries()].map(([pid, meta]) => ({ pid, ...meta })),
    })
}

// ---------------------------------------------------------------------------
// stopping

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function signal(pid, meta, sig) {
    try {
        if (meta.group) process.kill(-pid, sig)
        else process.kill(pid, sig)
    } catch (error) {
        if (error.code === 'ESRCH' && meta.group) {
            // Not a group leader after all. Signal it directly.
            try { process.kill(pid, sig) } catch { /* already gone */ }
        }
        // ESRCH otherwise: it is already gone, which is the desired state.
    }
}

/**
 * Stop everything this run owns. Idempotent, and safe to call from a signal
 * handler, a failed setup, or the normal teardown.
 *
 * @returns {Promise<{stopped: object[], skipped: object[]}>}
 */
export function terminateOwned({ graceMs = 5_000 } = {}) {
    if (terminating) return terminating
    terminating = (async () => {
        const stopped = []
        const skipped = []

        const targets = [...owned.entries()].filter(([pid, meta]) => {
            if (isOurs(pid, meta.match)) return true
            skipped.push({ pid, ...meta, reason: 'not alive, or no longer ours' })
            return false
        })

        for (const [pid, meta] of targets) signal(pid, meta, 'SIGTERM')

        const deadline = Date.now() + graceMs
        let survivors = targets
        while (survivors.length > 0 && Date.now() < deadline) {
            await sleep(200)
            survivors = survivors.filter(([pid, meta]) => isOurs(pid, meta.match))
        }

        for (const [pid, meta] of survivors) signal(pid, meta, 'SIGKILL')
        await sleep(300)

        for (const [pid, meta] of targets) {
            stopped.push({ pid, label: meta.label, gone: !isOurs(pid, meta.match) })
        }

        owned.clear()
        terminating = null
        return { stopped, skipped }
    })()
    return terminating
}

function installSignalHandlers() {
    if (handlersInstalled) return
    handlersInstalled = true

    const bail = (why) => async () => {
        console.error(`[e2e] ${why} — stopping owned processes`)
        await terminateOwned({ graceMs: 2_000 })
        clearState()
        process.exit(1)
    }

    process.once('SIGINT', bail('SIGINT'))
    process.once('SIGTERM', bail('SIGTERM'))
    process.once('SIGHUP', bail('SIGHUP'))
    process.once('uncaughtException', async (error) => {
        console.error('[e2e] uncaught exception — stopping owned processes')
        console.error(error)
        await terminateOwned({ graceMs: 2_000 })
        clearState()
        process.exit(1)
    })
}

// ---------------------------------------------------------------------------
// preflight

/**
 * Refuse to start on top of a previous run.
 *
 * A state file whose processes are still alive means a suite is running (or one
 * was killed and left servers behind); either way starting a second one is how
 * the last recovery lost a run to a state file the other run deleted. A state
 * file whose processes are all dead is stale, and only *that* is cleaned.
 *
 * Nothing outside the recorded set is ever touched.
 */
export function preflight({ file = STATE_FILE } = {}) {
    const state = readState(file)
    if (!state) return { status: 'clean' }

    const recorded = Array.isArray(state.owned) ? state.owned : []
    const live = recorded.filter((entry) => isOurs(entry.pid, entry.match))

    if (live.length > 0) {
        const detail = live
            .map((entry) => `  pid ${entry.pid} (${entry.label}): ${commandLineOf(entry.pid)}`)
            .join('\n')
        throw new Error(
            'A previous Netronix E2E run still owns live processes. Refusing to start a ' +
            'second run on top of it.\n' + detail +
            '\n\nStop that run (or, if it is gone, terminate exactly those pids) and try again.',
        )
    }

    clearState(file)
    return { status: 'stale-cleaned', cleaned: recorded }
}
