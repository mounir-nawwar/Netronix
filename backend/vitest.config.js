import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['test/**/*.test.js'],
        setupFiles: ['./test/setup.js'],
        // An in-memory MongoDB replica set takes a few seconds to come up the
        // first time a suite needs one.
        testTimeout: 30_000,
        hookTimeout: 120_000,
        // Each test file gets its own process, so a module-scope side effect in
        // one suite cannot leak into another.
        pool: 'forks',
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            reporter: ['text', 'html', 'lcov'],
            include: ['app.js', 'config/**/*.js', 'controllers/**/*.js', 'middleware/**/*.js', 'models/**/*.js', 'routes/**/*.js', 'scripts/**/*.js', 'services/**/*.js'],
            exclude: ['setupEnv.js'],
        },
    },
})
