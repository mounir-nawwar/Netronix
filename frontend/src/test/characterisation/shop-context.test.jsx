// CHARACTERISATION — the global store as it behaves today.
//
// Manifest flows: 5 (logout clears everything, FE-002),
//                 6/7 (guest cart lifecycle, FE-009),
//                 9 (catalog fetched once, FE-001).
// Target-state assertions: src/test/target-state/frontend.target.test.jsx.
//
// Phase 3 flipped every block below. Each one recorded a defect that is now
// fixed, and each says what it used to record and what changed.

import { describe, it, expect, vi } from 'vitest'
import { useContext } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { ShopContext } from '../../context/shopContext.js'
import { BACKEND_URL, requestLog, setCatalog, setServerCart, makeProduct } from '../msw/handlers.js'
import { server } from '../msw/server.js'
import * as cartApi from '../../api/cart.js'
import * as authApi from '../../api/auth.js'

/** Captures the context value so it can be asserted on outside React. */
function renderWithProvider() {
    let captured = null
    const Probe = () => {
        captured = useContext(ShopContext)
        return null
    }

    const utils = render(
        <MemoryRouter>
            <ShopContextProvider><Probe /></ShopContextProvider>
        </MemoryRouter>,
    )
    return { ...utils, context: () => captured }
}

const readSource = (relative) => readFileSync(join(process.cwd(), 'src', relative), 'utf8')

const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

/**
 * Source with its comments removed.
 *
 * Every file this phase touched now carries a header explaining the defect that
 * was removed, and those explanations quote the very code they are about —
 * `typeof setCartItems`, `window.location.href`, `window.history.back()`. A
 * grep for the defect must not match the note saying it is gone.
 */
const readCode = (relative) =>
    readSource(relative)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')

// ---------------------------------------------------------------------------
describe('flow 5 — logout clears everything (FE-002, SEC-022 — FIXED)', () => {
    // FLIPPED in Phase 3, roadmap task 3.2.
    //
    // Phase 0 recorded three facts, and all three have changed:
    //   * the context value had no `setCartItems`;
    //   * `Navbar.logout` called it anyway, so the body threw *after* clearing
    //     the token and *before* navigating — the previous customer's cart
    //     stayed on screen, on a page that still looked signed in;
    //   * the guest cart in `localStorage` survived a token change.

    it('provides setCartItems to the consumers that destructure it', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        expect(typeof context().setCartItems).toBe('function')
    })

    it('owns logout in the context, and the Navbar no longer defines its own', () => {
        const navbar = readCode('components/Navbar.jsx')
        expect(navbar).toMatch(/logout\s*[},]/)
        expect(navbar).not.toMatch(/const logout = async/)
        expect(navbar).not.toMatch(/localStorage\.removeItem/)
        expect(readCode('context/ShopContext.jsx')).toMatch(/const logout = useCallback/)
    })

    it('clears the token, the cart, the wishlist and the guest cart, and throws nothing', async () => {
        localStorage.setItem('token', 'a-token')
        localStorage.setItem('guestCart', JSON.stringify({ someProduct: { Black: 2 } }))

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        await act(async () => { await context().logout() })

        expect(context().cartItems).toEqual({})
        expect(context().wishlist).toEqual([])
        expect(context().token).toBe('')
        expect(localStorage.getItem('token')).toBeNull()
        // SEC-022 — the previous customer's cart must not become the next one's.
        expect(localStorage.getItem('guestCart')).toBeNull()
    })

    it('calls the revocation endpoint on the way out (SEC-003)', async () => {
        localStorage.setItem('token', 'a-token')

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        await act(async () => { await context().logout() })

        expect(requestLog).toContain('POST /api/user/logout')
    })

    it('navigates to sign-in from finally even when revocation fails', async () => {
        localStorage.setItem('token', 'a-token')
        server.use(http.post(`${BACKEND_URL}/api/user/logout`, () =>
            HttpResponse.json({ success: false, message: 'offline' }, { status: 503 })))

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()?.token).toBe('a-token'))
        await act(async () => { await context().logout() })

        expect(context().token).toBe('')
        expect(readCode('context/ShopContext.jsx'))
            .toMatch(/finally\s*\{\s*navigate\(['"]\/login['"]\)/s)
    })

    it('PlaceOrder clears the cart directly, with no typeof guard (FE-002)', () => {
        const source = readCode('pages/PlaceOrder.jsx')
        expect(source).toMatch(/setCartItems\(\{\}\)/)
        // The guard turned a crash into wrong behaviour: it was false for a
        // signed-in customer, so the else branch ran and cleared a guest cart
        // they did not have, leaving theirs on screen after a successful order.
        expect(source).not.toMatch(/typeof setCartItems/)
    })
})

// ---------------------------------------------------------------------------
describe('flow 6 — the guest cart lifecycle (FE-009 — FIXED)', () => {
    it('loads a stored guest cart', async () => {
        localStorage.setItem('guestCart', JSON.stringify({ someProduct: { Black: 2 } }))
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()?.cartItems).toEqual({ someProduct: { Black: 2 } }))
    })

    it('a guest cart emptied to nothing does not come back on reload', async () => {
        localStorage.setItem('guestCart', JSON.stringify({ someProduct: { Black: 1 } }))

        const { context, unmount } = renderWithProvider()
        await waitFor(() => expect(context().cartItems).toEqual({ someProduct: { Black: 1 } }))

        await act(async () => { await context().updateQuantity('someProduct', 'Black', 0) })

        // The save used to be guarded by `Object.keys(cartItems).length > 0`, so
        // emptying the cart left the previous value in storage and the removed
        // item reappeared on the next load.
        await waitFor(() => expect(localStorage.getItem('guestCart')).toBeNull())

        unmount()
        const second = renderWithProvider()
        await waitFor(() => expect(second.context()).not.toBeNull())
        expect(second.context().cartItems).toEqual({})
    })

    it('discards a corrupt guest cart instead of failing on every load', async () => {
        localStorage.setItem('guestCart', '{not json')

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        expect(context().cartItems).toEqual({})
        expect(localStorage.getItem('guestCart')).toBeNull()
    })

    it('drops a malformed line rather than letting it reach the cart maths', async () => {
        localStorage.setItem('guestCart', JSON.stringify({
            good: { Black: 2 },
            bad: { Black: 'many' },
            alsoBad: 'not an object',
        }))

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        await waitFor(() => expect(context().cartItems).toEqual({ good: { Black: 2 } }))
    })
})

// ---------------------------------------------------------------------------
describe('flow 7 — the guest cart survives signing in (FE-009 — FIXED)', () => {
    // The old login path set the token and let an effect call `getUserCart`,
    // which replaced local state wholesale: everything chosen before signing in
    // was discarded at exactly the moment the customer committed to the site.

    it('merges the guest cart into the server cart on sign-in', async () => {
        setServerCart({ onServer: { Black: 1 } })
        localStorage.setItem('guestCart', JSON.stringify({ asGuest: { White: 2 } }))

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        await act(async () => { await context().applySession('a-token') })

        await waitFor(() => expect(context().cartItems).toEqual({
            onServer: { Black: 1 },
            asGuest: { White: 2 },
        }))
        expect(requestLog).toContain('POST /api/cart/merge')
        // Cleared only after the merge succeeded, so a failure loses nothing.
        expect(localStorage.getItem('guestCart')).toBeNull()
    })

    it('loads the server cart without a merge when there is nothing to hand over', async () => {
        setServerCart({ onServer: { Black: 1 } })

        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        await act(async () => { await context().applySession('a-token') })

        await waitFor(() => expect(context().cartItems).toEqual({ onServer: { Black: 1 } }))
        expect(requestLog).not.toContain('POST /api/cart/merge')
    })

    it('ignores late cart and wishlist restores after logout', async () => {
        const cart = deferred()
        const wishlist = deferred()
        const fetchCart = vi.spyOn(cartApi, 'fetchCart').mockReturnValue(cart.promise)
        const fetchWishlist = vi.spyOn(authApi, 'fetchWishlist').mockReturnValue(wishlist.promise)
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        let applying
        await act(async () => { applying = context().applySession('old-token') })
        await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(1))
        await act(async () => { await context().logout() })

        await act(async () => {
            cart.resolve([{ productId: 'private-cart', variantKey: '', quantity: 1 }])
            wishlist.resolve(['private-wish'])
            await applying
        })

        expect(context().token).toBe('')
        expect(context().cartLines).toEqual([])
        expect(context().wishlist).toEqual([])
        fetchCart.mockRestore()
        fetchWishlist.mockRestore()
    })

    it('ignores an older applySession that settles after a newer session', async () => {
        const oldCart = deferred()
        const oldWishlist = deferred()
        const fetchCart = vi.spyOn(cartApi, 'fetchCart')
            .mockReturnValueOnce(oldCart.promise)
            .mockResolvedValueOnce([{ productId: 'new-cart', variantKey: '', quantity: 2 }])
        const fetchWishlist = vi.spyOn(authApi, 'fetchWishlist')
            .mockReturnValueOnce(oldWishlist.promise)
            .mockResolvedValueOnce(['new-wish'])
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        let older
        await act(async () => { older = context().applySession('old-token') })
        await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(1))
        await act(async () => { await context().applySession('new-token') })

        await act(async () => {
            oldCart.resolve([{ productId: 'old-cart', variantKey: '', quantity: 9 }])
            oldWishlist.resolve(['old-wish'])
            await older
        })

        expect(context().token).toBe('new-token')
        expect(context().cartLines).toEqual([
            expect.objectContaining({ productId: 'new-cart', variantKey: '', quantity: 2 }),
        ])
        expect(context().wishlist).toEqual(['new-wish'])
        fetchCart.mockRestore()
        fetchWishlist.mockRestore()
    })
})

// ---------------------------------------------------------------------------
describe('flow 9 — one catalog walk per application load (FE-001 — FIXED)', () => {
    it('a provider issues one complete paginated walk and one tags request', async () => {
        renderWithProvider()
        await waitFor(() =>
            expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(1))
        expect(requestLog.filter((entry) => entry === 'GET /api/product/tags')).toHaveLength(1)
    })

    // FLIPPED in Phase 3, task 3.1. Was: "main.jsx and App.jsx each mount a
    // ShopContextProvider", so every fetch ran twice and the outer copy's
    // results were thrown away — no consumer was ever bound to it.
    it('only main.jsx mounts a provider, and it is inside BrowserRouter', () => {
        const main = readSource('main.jsx')
        expect(main).toMatch(/<ShopContextProvider>/)
        // It has to stay inside the router: the context calls `useNavigate`.
        expect(main.indexOf('<BrowserRouter>')).toBeLessThan(main.indexOf('<ShopContextProvider>'))
        expect(readSource('App.jsx')).not.toMatch(/<ShopContextProvider>/)
    })

    // FE-008 — App.jsx exported a second `backendUrl` defaulting to port 5000
    // while the backend listens on 4000. Nothing imported it, and nothing had
    // noticed it was wrong.
    it('exports no second backendUrl from App.jsx', () => {
        expect(readSource('App.jsx')).not.toMatch(/export const backendUrl/)
    })

    // FE-006 — no storefront component talks to axios directly any more.
    it('routes every request through the API layer', async () => {
        const { readdirSync, statSync } = await import('node:fs')

        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                if (['test', 'assets', 'api'].includes(entry)) continue
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) { walk(full); continue }
                if (!/\.jsx?$/.test(entry)) continue
                if (/^import .*from 'axios'/m.test(readFileSync(full, 'utf8'))) offenders.push(entry)
            }
        }
        walk(join(process.cwd(), 'src'))
        expect(offenders).toEqual([])
    })
})

// ---------------------------------------------------------------------------
describe('the context contract consumers rely on', () => {
    it('exposes every key the storefront destructures today', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        // Locking this list down means a refactor that drops a key fails here
        // rather than at runtime in one unlucky component.
        //
        // Phase 3 adds the members this phase's findings needed: `setCartItems`
        // and `logout` (FE-002/SEC-022), `goBack` (FE-005), `catalogStatus`,
        // `catalogError` and `reloadCatalog` (FE-012/FE-013), `showcase` and
        // `showcaseOne` (FE-004), `tags` (FE-010), `applySession` (FE-009),
        // `wishlistStatus` (FE-013) and `getUnpricedCartLines` (FE-024).
        // Nothing was removed — `currency`, `delivery_fee` and `getCartAmount`
        // are all still here, because components that have not been touched
        // still read them.
        expect(Object.keys(context()).sort()).toEqual([
            'addToCart',
            'addToWishlist',
            'applySession',
            'availableFor',
            'backendUrl',
            'cartItems',
            // Additive: the lossless cart, one entry per combination the
            // customer chose (DB-003). `cartItems` remains the legacy view.
            'cartLines',
            'catalogError',
            'catalogStatus',
            'currency',
            'currencyCode',
            'deliveryFeeMinor',
            'delivery_fee',
            'formatPrice',
            'formatPriceMajor',
            'frontendUrl',
            'getCartAmount',
            'getCartAmountMinor',
            'getCartCount',
            'getPriceMinor',
            'getProductsByTag',
            'getSingleProduct',
            'getUnpricedCartLines',
            'getVariantDisplayName',
            'getVariantEntries',
            'goBack',
            'isInWishlist',
            'logout',
            'navigate',
            'products',
            'reloadCatalog',
            'removeFromWishlist',
            'search',
            'setCartItems',
            'setSearch',
            'setShowSearch',
            'setToken',
            'showSearch',
            'showcase',
            'showcaseOne',
            'tags',
            'token',
            'updateQuantity',
            'wishlist',
            'wishlistStatus',
        ])
    })

    it('loads the catalog into context', async () => {
        setCatalog([makeProduct({ _id: 'a'.repeat(24), name: 'Seeded Laptop' })])
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()?.products).toHaveLength(1))
        expect(context().products[0].name).toBe('Seeded Laptop')
    })

    it('reports the catalog request lifecycle rather than leaving it to a timer (FE-012)', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        await waitFor(() => expect(context().catalogStatus).toBe('ready'))
        expect(context().catalogError).toBeNull()
    })

    it('reads the delivery fee and currency the storefront advertises', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        // $3 flat. Two other surfaces claim $50 and $150 free-shipping
        // thresholds (PORT-008); this is the one the checkout actually charges.
        expect(context().delivery_fee).toBe(3)
        expect(context().currency).toBe('$')
    })

    it('resolves backendUrl through the validated config module (DEVOPS-002)', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        expect(context().backendUrl).toBe('http://localhost:4000')
    })
})

// ---------------------------------------------------------------------------
describe('navigation helper (FE-005 — FIXED)', () => {
    // FLIPPED in Phase 3, roadmap task 3.3.
    //
    // Phase 0 recorded that `navigate(-1)` never reached router history:
    // `navigateWithContext` called `path.includes('products')` on the number,
    // which throws, and its own `catch` then set `window.location.href = -1` —
    // a full page load of "/-1" and a blank page. `Wishlist.jsx` and
    // `BackButton.jsx` both did exactly that.

    it('hands a numeric argument to the router and never touches window.location', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        const errors = []
        const originalError = console.error
        console.error = (...args) => errors.push(args.join(' '))
        try {
            act(() => { context().navigate(-1) })
        } finally {
            console.error = originalError
        }

        // Nothing was swallowed, because nothing threw.
        expect(errors.join('\n')).not.toMatch(/Navigation error/)
        expect(readCode('context/ShopContext.jsx')).not.toMatch(/window\.location\.href/)
    })

    it('exposes goBack(), and the two back buttons use it', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())

        expect(typeof context().goBack).toBe('function')
        act(() => { context().goBack() })

        expect(readCode('components/BackButton.jsx')).toMatch(/goBack/)
        // It used to call `window.history.back()`, bypassing the router, while
        // importing a `useNavigate` it never used.
        expect(readCode('components/BackButton.jsx')).not.toMatch(/window\.history\.back/)
        expect(readCode('pages/Wishlist.jsx')).toMatch(/onClick=\{goBack\}/)
    })

    it('navigates normally for a string path', async () => {
        const { context } = renderWithProvider()
        await waitFor(() => expect(context()).not.toBeNull())
        act(() => { context().navigate('/products') })
    })
})
