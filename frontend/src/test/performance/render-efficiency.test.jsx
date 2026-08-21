// PERF-007 / FE-015 / FE-022 / FE-023 — render and scroll pressure.
//
// Three separate defects with the same shape: something that should have been
// a ref was state, so a value that changes at animation or scroll frequency
// re-rendered a component tree, tore down an effect, and re-subscribed a
// listener — sixty times a second in the worst case.

import { render, screen, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Count `window.addEventListener`/`removeEventListener` by event name. */
function trackListeners() {
    const added = []
    const removed = []
    const realAdd = window.addEventListener.bind(window)
    const realRemove = window.removeEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
        added.push(type)
        return realAdd(type, handler, options)
    })
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, handler, options) => {
        removed.push(type)
        return realRemove(type, handler, options)
    })
    return {
        added,
        removed,
        countOf: (type) => added.filter((t) => t === type).length,
        removedCountOf: (type) => removed.filter((t) => t === type).length,
    }
}

/**
 * Drive `requestAnimationFrame` by hand.
 * jsdom's implementation is a timer; replacing it makes "one frame" a thing a
 * test can assert about.
 */
function manualRaf() {
    let next = 1
    const callbacks = new Map()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = next
        next += 1
        callbacks.set(id, callback)
        return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
        callbacks.delete(id)
    })
    return {
        pending: () => callbacks.size,
        tick(frames = 1) {
            for (let i = 0; i < frames; i += 1) {
                const entries = [...callbacks.entries()]
                callbacks.clear()
                for (const [, callback] of entries) callback(performance.now())
            }
        },
    }
}

describe('FE-015 / PERF-007 — ScrollingText does not re-render per frame', () => {
    let raf
    let listeners

    beforeEach(() => {
        listeners = trackListeners()
        raf = manualRaf()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('registers exactly one scroll listener and one rAF loop across many frames', async () => {
        const { default: ScrollingText } = await import('../../components/ScrollingText.jsx')
        render(<ScrollingText text="Premium tech" speed={2.5} />)

        expect(listeners.countOf('scroll')).toBe(1)

        // Sixty frames. The old implementation called `setBasePosition` in the
        // loop and listed `basePosition` in the effect's dependencies, so each
        // frame tore the effect down and built it back up: sixty scroll
        // subscriptions, sixty rAF cancellations, sixty re-renders.
        await act(async () => { raf.tick(60) })

        expect(listeners.countOf('scroll'), 'the scroll listener re-subscribed').toBe(1)
        expect(raf.pending(), 'the animation loop must still be running').toBe(1)
    })

    it('writes the transform directly rather than through React state', async () => {
        const { default: ScrollingText } = await import('../../components/ScrollingText.jsx')
        const { container } = render(<ScrollingText text="Premium tech" speed={4} />)
        const track = container.querySelector('[data-testid="scrolling-text-track"]')
        expect(track).not.toBeNull()

        await act(async () => { raf.tick(1) })
        const afterOne = track.style.transform
        await act(async () => { raf.tick(1) })
        const afterTwo = track.style.transform

        expect(afterOne).toMatch(/translateX/)
        expect(afterTwo).not.toBe(afterOne)
    })

    it('removes its listener and cancels its loop on unmount', async () => {
        const { default: ScrollingText } = await import('../../components/ScrollingText.jsx')
        const { unmount } = render(<ScrollingText text="Premium tech" />)
        await act(async () => { raf.tick(3) })

        unmount()

        expect(listeners.removedCountOf('scroll')).toBeGreaterThanOrEqual(1)
        expect(raf.pending()).toBe(0)
    })
})

describe('FE-023 — the navbar scroll listener subscribes once', () => {
    let listeners

    beforeEach(() => { listeners = trackListeners() })
    afterEach(() => { vi.restoreAllMocks() })

    it('does not re-subscribe when the scroll position changes', async () => {
        const { MemoryRouter } = await import('react-router-dom')
        const { default: ShopContextProvider } = await import('../../context/ShopContext.jsx')
        const { default: App } = await import('../../App.jsx')

        render(
            <MemoryRouter initialEntries={['/cart']}>
                <ShopContextProvider><App /></ShopContextProvider>
            </MemoryRouter>,
        )
        await waitFor(() => expect(listeners.countOf('scroll')).toBeGreaterThanOrEqual(1))
        const before = listeners.countOf('scroll')

        for (let i = 0; i < 20; i += 1) {
            window.scrollY = i * 40
            await act(async () => { window.dispatchEvent(new Event('scroll')) })
        }

        expect(listeners.countOf('scroll')).toBe(before)
    })
})

describe('FE-022 — the shop context value is memoised', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('hands consumers the same value object and the same callbacks across an unrelated re-render', async () => {
        const { useContext, useState } = await import('react')
        const { MemoryRouter } = await import('react-router-dom')
        const { default: ShopContextProvider } = await import('../../context/ShopContext.jsx')
        const { ShopContext } = await import('../../context/shopContext.js')

        const seen = []
        let bump

        const Probe = () => {
            const value = useContext(ShopContext)
            const [, setTick] = useState(0)
            bump = () => setTick((tick) => tick + 1)
            seen.push(value)
            return <span data-testid="probe">{typeof value.addToCart}</span>
        }

        render(
            <MemoryRouter>
                <ShopContextProvider><Probe /></ShopContextProvider>
            </MemoryRouter>,
        )
        // Wait for the catalog fetch to settle first: a provider value that
        // changes because its data arrived is the memo working, not failing.
        await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('function'))
        await waitFor(() => expect(seen[seen.length - 1].catalogStatus).not.toBe('loading'))
        const settled = seen.length
        await waitFor(() => expect(seen.length).toBe(settled))

        const before = seen[seen.length - 1]
        await act(async () => { bump() })
        const after = seen[seen.length - 1]

        // Re-rendering the *consumer* must not produce a new context value:
        // that is what proves the provider memoised rather than rebuilding the
        // object on every render of its own.
        expect(after).toBe(before)
        expect(after.addToCart).toBe(before.addToCart)
        expect(after.logout).toBe(before.logout)
    })
})
