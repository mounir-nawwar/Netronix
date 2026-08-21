// Admin console test setup.
//
// MSW runs with `onUnhandledRequest: 'error'`, so no test can reach the network.

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './msw/server.js'
import { resetFixtures, resetRequestLog } from './msw/handlers.js'

beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
    cleanup()
    server.resetHandlers()
    resetFixtures()
    resetRequestLog()
    localStorage.clear()
    vi.clearAllMocks()
})

afterAll(() => {
    server.close()
})

if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false, media: query, onchange: null,
        addListener() { }, removeListener() { },
        addEventListener() { }, removeEventListener() { },
        dispatchEvent: () => false,
    })
}

if (!window.ResizeObserver) {
    window.ResizeObserver = class { observe() { } unobserve() { } disconnect() { } }
}

window.scrollTo = window.scrollTo ?? (() => { })

// jsdom does not implement scrollIntoView; several components call it in an
// effect on mount.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => { }
}
