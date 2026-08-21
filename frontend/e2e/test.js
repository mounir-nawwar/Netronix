// The test object every spec imports.
//
// `baseURL` is an overridable Playwright fixture, which is the only way to point
// the suite at a port the *global setup* chose. A value in `use.baseURL` is read
// when the config module loads — before the setup has run — so it cannot carry
// a dynamically allocated port.

import { test as base, expect } from '@playwright/test'

import { state } from './fixtures.js'

export const test = base.extend({
    // Playwright's fixture signature is `({ ...fixtures }, use)`, and it
    // *checks* that the first argument is a destructuring pattern — naming it
    // fails at collection time. The second argument is named `apply` only
    // because a parameter called `use` reads to the React lint rules as a hook
    // call in a function that is not a component.
    // eslint-disable-next-line no-empty-pattern -- required by Playwright
    baseURL: async ({ }, apply) => {
        await apply(state().storefrontUrl)
    },
})

export { expect }
