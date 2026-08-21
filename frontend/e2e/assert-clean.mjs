// Deterministic post-run leak assertion.
//
// Run after the Playwright suite. It fails if the run left anything behind:
// a state file still naming live processes, or any process on this machine
// whose command line is one this harness starts. It reports; it never kills.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { commandLineOf, isOurs, readState } from './lifecycle.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

/** Every command line on the machine, by pid. Linux `/proc`, no `ps` parsing. */
function processTable() {
    const rows = []
    for (const entry of readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) continue
        const pid = Number(entry)
        if (pid === process.pid) continue
        let cmdline
        try {
            cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
        } catch {
            continue
        }
        if (cmdline === '') continue
        rows.push({ pid, cmdline })
    }
    return rows
}

/**
 * Anything the harness could have started.
 *
 * Scoped to *this repository* — a Vite server or a Chromium the developer is
 * running for something else is none of this script's business, and neither is
 * any `mongod` outside `mongodb-memory-server`'s temporary directories.
 */
const basename = (path) => path.split('/').pop()
const isNode = (argv0) => basename(argv0) === 'node' || basename(argv0) === 'nodejs'

const SIGNATURES = [
    // Matched on argv[0] as well as the arguments, because a shell whose
    // command line merely *mentions* `mongod` is not a `mongod`. Checking only
    // the text of the command line reported this script's own invocation.
    { label: 'vite (this repo)', test: (argv0, c) => isNode(argv0) && c.includes('vite/bin/vite.js') && c.includes(repoRoot) },
    { label: 'vite via npx (this repo)', test: (argv0, c) => basename(argv0) === 'npx' && c.includes(' vite') && c.includes(repoRoot) },
    { label: 'mongod (mongodb-memory-server)', test: (argv0) => basename(argv0) === 'mongod' },
    { label: 'playwright runner (this repo)', test: (argv0, c) => isNode(argv0) && c.includes('@playwright/test') && c.includes(repoRoot) },
    { label: 'playwright browser', test: (argv0) => ['headless_shell', 'chrome', 'chromium'].includes(basename(argv0)) || argv0.includes('ms-playwright') },
    { label: 'e2e API (this repo)', test: (argv0, c) => isNode(argv0) && c.includes('e2eEnv.js') && c.includes(repoRoot) },
]

const problems = []

const state = readState()
if (state) {
    const live = (state.owned ?? []).filter((entry) => isOurs(entry.pid, entry.match))
    if (live.length > 0) {
        for (const entry of live) {
            problems.push(`state file still owns pid ${entry.pid} (${entry.label}): ${commandLineOf(entry.pid)}`)
        }
    } else {
        problems.push(
            `${resolve(here, '.e2e-state.json')} was left behind (its processes are dead). ` +
            'The teardown did not run — investigate before trusting the next run.',
        )
    }
}

for (const { pid, cmdline } of processTable()) {
    for (const signature of SIGNATURES) {
        if (signature.test(cmdline.split(' ')[0], cmdline)) {
            problems.push(`leaked ${signature.label}: pid ${pid} — ${cmdline.slice(0, 200)}`)
            break
        }
    }
}

if (problems.length > 0) {
    console.error('E2E LEAK CHECK: FAILED')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
}

console.log('E2E LEAK CHECK: clean — no state file, and no harness process is running.')
