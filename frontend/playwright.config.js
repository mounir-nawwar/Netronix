import { defineConfig, devices } from '@playwright/test'

// Local end-to-end tests (roadmap Phase 3, task 10; test plan 19 § E2E).
//
// Everything runs on loopback against an in-memory MongoDB the test process
// creates and destroys — `backend/scripts/e2eEnv.js`. No external service is
// contacted, no real credential exists, and nothing survives the run.
//
// The API is started by the global setup rather than by `webServer`, because it
// has to come up *after* its database does and hand its port to the storefront's
// build-time configuration.

export default defineConfig({
    testDir: './e2e',
    // These drive a real browser through a real API against a real database.
    // Parallel workers would share the seeded catalog's stock levels, and the
    // checkout flows deliberately buy the single-unit combinations.
    workers: 1,
    fullyParallel: false,
    // Generous, and not because the tests are flaky. The homepage ships an
    // 11.5 MB video and a 3D iframe, and the storefront's initial JavaScript is
    // ~2.7 MB — all of which is PERF-001…003, Phase 4's work. Until that lands,
    // a first paint on a cold Vite dev server genuinely takes tens of seconds,
    // and a tight timeout here would be measuring the bundle rather than the
    // behaviour.
    timeout: 120_000,
    expect: { timeout: 30_000 },
    // A ceiling on the whole run. Seventeen tests at their worst case would
    // exceed this, which is the point: a suite that has gone wrong should stop
    // and be looked at rather than sit on a machine holding servers open.
    globalTimeout: 30 * 60_000,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    globalSetup: './e2e/global-setup.js',
    globalTeardown: './e2e/global-teardown.js',
    use: {
        // `baseURL` is supplied per test by the fixture in `e2e/test.js`, which
        // reads the port the global setup allocated. It cannot be set here: this
        // module is evaluated before the setup runs.
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
})
