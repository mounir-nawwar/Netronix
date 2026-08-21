// `npm run test:e2e` — the Playwright suite, followed by the leak assertion.
//
// The assertion runs whether the suite passed or failed, because a failing run
// is exactly when cleanup is most likely to have been skipped. The process exits
// non-zero if either the suite or the assertion did.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const run = (command, args) => new Promise((settle) => {
    const child = spawn(command, args, { cwd: resolve(here, '..'), stdio: 'inherit' })
    child.on('exit', (code, signal) => settle(signal ? 1 : (code ?? 1)))
})

const suite = await run(process.execPath, [resolve(here, '../node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)])
const clean = await run(process.execPath, [resolve(here, 'assert-clean.mjs')])

process.exit(suite || clean)
