import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { stripVercelEnv } from './scripts/stripVercelEnv.js'

// SEC — Vercel injects its build metadata already `VITE_`-prefixed, and Vite
// inlines every `VITE_*` variable into the client bundle whether or not anything
// reads it. Nineteen keys were shipping, including the full commit message and
// the commit author's name. Stripped at module scope, above `defineConfig`,
// because Vite has read the environment by the time any plugin hook runs.
// See `scripts/stripVercelEnv.js`.
stripVercelEnv()

// PERF-003 — this file used to be eight lines with no `build` section at all.
//
// Route splitting (`React.lazy` in `App.jsx`) is half the fix; the other half
// is deciding what the *shared* chunks are, because without `manualChunks`
// Rollup puts every library a lazy route touches into that route's chunk and
// the same 200 kB of `framer-motion` is re-downloaded on the next navigation.
//
// The split is deliberately by-library and small, not one `vendor` bundle:
// a single vendor chunk is the failure mode this finding is about, just moved.
// `react-router` and `react-icons` are separate from `react` because they
// change on a different cadence, so a React upgrade does not invalidate them.
const VENDOR_CHUNKS = {
    react: ['react', 'react-dom', 'scheduler', 'prop-types', 'object-assign'],
    router: ['react-router', 'react-router-dom'],
    motion: ['framer-motion'],
    icons: ['react-icons'],
    toast: ['react-toastify'],
}

/** `node_modules/<name>` — the package a module id belongs to. */
function packageOf(id) {
    const match = id.split('node_modules/').pop()
    if (!match) return null
    const parts = match.split('/')
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

export default defineConfig({
    plugins: [react()],
    server: { port: 5173 },
    build: {
        // The default 500 kB warning is the budget this phase is held to, so
        // it stays on and it stays at 500.
        chunkSizeWarningLimit: 500,
        // The manifest is what `scripts/bundle-budget.mjs` walks to work out
        // which chunks a route actually loads. Guessing from file names, or
        // summing the whole of `dist/`, is how "initial transfer" claims end up
        // wrong in both directions.
        manifest: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined
                    const pkg = packageOf(id)
                    if (!pkg) return undefined
                    for (const [chunk, packages] of Object.entries(VENDOR_CHUNKS)) {
                        if (packages.includes(pkg)) return `vendor-${chunk}`
                    }
                    return undefined
                },
            },
        },
    },
})
