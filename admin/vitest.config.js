import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        // jsdom + MSW + a full React render is slow, and the admin gate test
        // mounts the whole App and waits on a round trip through the mocked
        // session endpoint. The 5 s default is tight enough that the suite
        // fails under CPU contention — from another suite running alongside
        // it, or from CI — which is a flaky test, not a real signal.
        testTimeout: 15_000,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        // Test-only configuration pointing at loopback. MSW intercepts every
        // request before it reaches the network.
        env: {
            VITE_BACKEND_URL: 'http://localhost:4000',
        },
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.{js,jsx}'],
            exclude: ['src/test/**', 'src/main.jsx', 'src/assets/**'],
        },
    },
})
