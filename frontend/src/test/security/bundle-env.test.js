// SEC — the client bundle must not carry Vercel's build metadata.
//
// Vercel's "Automatically expose System Environment Variables" setting injects
// its build metadata already `VITE_`-prefixed, and Vite statically inlines every
// `VITE_*` variable into `import.meta.env` in the client bundle whether or not
// any application code reads it. Nothing in this app reads one. They shipped
// anyway.
//
// Measured on the deployed storefront before the fix: nineteen keys, including
// the full `VITE_VERCEL_GIT_COMMIT_MESSAGE`, the commit author's name and GitHub
// login, the commit SHA, and the repository owner and slug — served to anyone
// who fetched the JavaScript. Commit messages on this project describe
// authentication boundaries and the defects found in them; that is not a
// document to publish next to the login form.
//
// `src/config.js` already refuses to carry anything that looks like a server
// secret (DEVOPS-002), but that guard only covers what that module reads, and
// these never pass through it. The strip is in `vite.config.js`, before
// `defineConfig` runs, so it holds whether or not the dashboard setting is on —
// anyone with project access can turn that back on, and the build still must not
// ship them.
//
// The strip itself is a pure function in `scripts/stripVercelEnv.js`, tested
// directly. The config is asserted by source, because importing it here would
// pull Vite's own internals into jsdom — where they fail on `TextEncoder` — and
// because what can go wrong in the config is placement: run the strip inside
// the exported object and it is already too late.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { stripVercelEnv } from '../../../scripts/stripVercelEnv.js'

const configSource = () => readFileSync(join(process.cwd(), 'vite.config.js'), 'utf8')

describe('SEC — Vercel system variables are stripped before the bundle is built', () => {
    it('is wired into the build at all', () => {
        const source = configSource()

        expect(source, 'vite.config.js does not import the strip')
            .toMatch(/stripVercelEnv/)
        expect(source, 'the strip is imported but never called')
            .toMatch(/^stripVercelEnv\(\)/m)
    })

    it('calls the strip before `defineConfig`, not inside it', () => {
        // Placement is the thing that can silently go wrong here. Moved inside
        // the exported object — or into a plugin hook — it would run after Vite
        // has already collected the environment, and the build would ship the
        // variables while this file still looked correct.
        const source = configSource()
        const call = source.search(/^stripVercelEnv\(\)/m)
        const define = source.indexOf('export default defineConfig')

        expect(call).toBeGreaterThan(-1)
        expect(define).toBeGreaterThan(-1)
        expect(call, 'the strip must execute at module scope, above the export').toBeLessThan(define)
    })

    it('removes exactly the Vercel keys, and nothing the app needs', () => {
        const env = {
            VITE_VERCEL_GIT_COMMIT_MESSAGE: 'a commit message describing an auth boundary',
            VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME: 'A Person',
            VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN: 'a-person',
            VITE_VERCEL_GIT_REPO_OWNER: 'an-org',
            VITE_VERCEL_PROJECT_ID: 'prj_example',
            VITE_BACKEND_URL: 'https://api.example.test',
            VITE_FRONTEND_URL: 'https://example.test',
            NODE_ENV: 'production',
        }

        const removed = stripVercelEnv(env)

        expect(removed.sort()).toEqual([
            'VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN',
            'VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME',
            'VITE_VERCEL_GIT_COMMIT_MESSAGE',
            'VITE_VERCEL_GIT_REPO_OWNER',
            'VITE_VERCEL_PROJECT_ID',
        ])
        // The two the app genuinely reads, and an unrelated one, are untouched.
        expect(env.VITE_BACKEND_URL).toBe('https://api.example.test')
        expect(env.VITE_FRONTEND_URL).toBe('https://example.test')
        expect(env.NODE_ENV).toBe('production')
    })

    it('defaults to process.env and is safe when there is nothing to remove', () => {
        expect(stripVercelEnv({})).toEqual([])
        expect(() => stripVercelEnv()).not.toThrow()
    })
})
