import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// PERF-003 — the admin built as a single 965 kB chunk (283 kB gzip) and
// Recharts was the bulk of it, for the benefit of exactly one route. Route
// splitting in `App.jsx` moves the chart page out of the entry; this puts the
// charting library in its own cached chunk rather than letting it ride along
// inside the dashboard's route chunk.
const VENDOR_CHUNKS = {
    react: ['react', 'react-dom', 'scheduler', 'prop-types', 'object-assign'],
    router: ['react-router', 'react-router-dom'],
    motion: ['framer-motion'],
    icons: ['react-icons'],
    http: ['axios'],
    toast: ['react-toastify'],
    schema: ['zod'],
}

// Recharts is deliberately **not** in the table above.
//
// Naming it as a manual chunk looked right and was measurably wrong: Rollup
// cannot defer a manual chunk whose modules have top-level side effects, so it
// emitted a bare `import "./vendor-charts.js"` into the entry and a
// `modulepreload` link into `index.html`. The charting library was pinned to
// the initial load *by the very config meant to split it out* — 110 kB gzip
// that only one route needs. Left alone, Rollup keeps it inside the
// dynamically imported `Dashboard` chunk, which is the correct place for it.

function packageOf(id) {
    const match = id.split('node_modules/').pop()
    if (!match) return null
    const parts = match.split('/')
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

export default defineConfig({
    plugins: [react()],
    server: { port: 5174 },
    build: {
        chunkSizeWarningLimit: 500,
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
