// Storefront test setup.
//
// MSW is started for the whole run with `onUnhandledRequest: 'error'`, so a
// request no handler covers fails the test instead of reaching the network.
// Nothing in the suite may contact a real service.

import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './msw/server.js'
import { resetCatalog, resetRequestLog, resetChatGreeting } from './msw/handlers.js'

// Route pages are genuine dynamic imports. On a cold worker Vite may need more
// than Testing Library's one-second default to transform the first chunk; that
// is test-runner work, not a user-facing loading deadline. Keep asynchronous
// assertions deterministic on constrained CI hosts without adding sleeps to
// individual tests.
configure({ asyncUtilTimeout: 5000 })

beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
    cleanup()
    server.resetHandlers()
    resetCatalog()
    resetRequestLog()
    resetChatGreeting()
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
})

afterAll(() => {
    server.close()
})

// jsdom implements neither of these, and several storefront components call
// them on mount. Stubbing here keeps the stubs out of individual tests.
if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() { },
        removeListener() { },
        addEventListener() { },
        removeEventListener() { },
        dispatchEvent: () => false,
    })
}

// jsdom has no IntersectionObserver, and a stub whose `observe()` does nothing
// is worse than none: code that defers work until an element is in view then
// never runs at all, and a test asserting the deferred behaviour passes for the
// wrong reason. Every element in jsdom is laid out at the origin with no
// viewport to be outside of, so "intersecting" is the honest answer — this
// stub reports it, once, on the next microtask.
if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
        constructor(callback) {
            this.callback = callback
            this.elements = new Set()
        }

        observe(element) {
            this.elements.add(element)
            Promise.resolve().then(() => {
                if (!this.elements.has(element)) return
                this.callback([{ target: element, isIntersecting: true, intersectionRatio: 1 }], this)
            })
        }

        unobserve(element) { this.elements.delete(element) }
        disconnect() { this.elements.clear() }
        takeRecords() { return [] }
    }
}

if (!window.ResizeObserver) {
    window.ResizeObserver = class {
        observe() { }
        unobserve() { }
        disconnect() { }
    }
}

// jsdom defines scrollTo, but its definition only emits a "not implemented"
// error. Replace it rather than using ??, which retained the unusable stub.
window.scrollTo = vi.fn()

// jsdom does not implement scrollIntoView; several components call it in an
// effect on mount.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => { }
}
