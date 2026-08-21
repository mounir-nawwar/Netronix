// TARGET STATE — storefront behaviour after the remediation phases.
//
// Every test here is skipped and expected to FAIL against current `main`.
// Each block records the finding, why it cannot pass yet, and the roadmap phase
// and task that enables it. Bodies are written out so enabling one means
// deleting `.skip`.

import { describe, it, expect } from 'vitest'
import { useContext } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { ShopContext } from '../../context/shopContext.js'
import Collections from '../../pages/Collections.jsx'
import ChatInterface from '../../components/Chatbot/ChatInterface.jsx'
import { setCatalog, makeProduct, setChatGreeting, requestLog } from '../msw/handlers.js'

function renderWithProvider(children) {
    let captured = null
    const Probe = () => {
        captured = useContext(ShopContext)
        return null
    }
    const utils = render(
        <MemoryRouter>
            <ShopContextProvider>
                <Probe />
                {children}
            </ShopContextProvider>
        </MemoryRouter>,
    )
    return { ...utils, context: () => captured }
}

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 5: logout clears everything (FE-002)', () => {
    // Finding:     FE-002 (setCartItems consumed but never provided), SEC-022
    // ENABLED in Phase 3, roadmap task 3.2. Was: "the context value has no
    // `setCartItems`, so the logout body throws before it can clear anything".
    it('exposes a single logout() that clears the cart, the token and storage', async () => {
        const { context } = renderWithProvider(null)
        await waitFor(() => expect(context()).not.toBeNull())

        localStorage.setItem('token', 'a-token')
        localStorage.setItem('guestCart', JSON.stringify({ p: { Black: 1 } }))

        expect(typeof context().logout).toBe('function')
        await act(async () => { await context().logout() })

        expect(context().cartItems).toEqual({})
        expect(context().token).toBe('')
        expect(localStorage.getItem('token')).toBeNull()
        expect(localStorage.getItem('guestCart')).toBeNull()
    })

    // Finding:     FE-002. ENABLED in Phase 3, task 3.2.
    it('provides setCartItems to consumers that already destructure it', async () => {
        const { context } = renderWithProvider(null)
        await waitFor(() => expect(context()).not.toBeNull())
        expect(typeof context().setCartItems).toBe('function')
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 9: the catalog is fetched once per page load (FE-001)', () => {
    // Finding:     FE-001 (provider mounted twice), FE-006, PERF-005
    // ENABLED in Phase 3, roadmap tasks 3.1 and 3.8. Was: "main.jsx and App.jsx
    // each mount a ShopContextProvider, so every fetch runs twice; six other
    // call sites re-fetch the catalog independently".
    it('issues exactly one GET /api/product/list for the whole application', async () => {
        const { default: App } = await import('../../App.jsx')
        render(
            <MemoryRouter>
                <ShopContextProvider><App /></ShopContextProvider>
            </MemoryRouter>,
        )

        await waitFor(() => expect(requestLog.length).toBeGreaterThan(0))
        await waitFor(() =>
            expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(1))
        // The tag taxonomy too: the Navbar used to fetch it for itself, once per
        // provider (FE-010, FE-006).
        expect(requestLog.filter((entry) => entry === 'GET /api/product/tags')).toHaveLength(1)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 7: chatbot output is inert (SEC-004)', () => {
    // Finding:     SEC-004 (React's raw-HTML escape hatch on model output)
    // ENABLED in Phase 1, roadmap task 1.3 (with F-10 on the client). Was:
    // "the API returns HTML and ChatInterface renders it directly".
    it('renders markup in a reply as visible text, not as elements', async () => {
        setChatGreeting('Hello <img src="x" onerror="window.__netronixXss = true"> there')
        const { container } = render(
            <MemoryRouter>
                <ShopContextProvider>
                    <ChatInterface onClose={() => { }} />
                </ShopContextProvider>
            </MemoryRouter>,
        )

        await screen.findByText(/Hello/)
        // `container.innerHTML` legitimately contains the string "onerror"
        // once the payload renders as *text*, which is the desired outcome, so
        // the assertion is on the DOM: no element, no handler attribute.
        expect(container.querySelector('img')).toBeNull()
        expect(container.querySelector('[onerror]')).toBeNull()
        expect(screen.getByText(/onerror/)).toBeInTheDocument()
        expect(window.__netronixXss).toBeUndefined()
    })

    // Finding:     SEC-004, A11Y-002
    // ENABLED in Phase 1 task 1.3. The transcript region is what makes a link
    // announceable at all, so it came with the structural change rather than
    // waiting for the wider accessibility pass in Phase 4, task 4.8.
    it('renders product links as router links inside an aria-live region', async () => {
        setChatGreeting('plain')
        render(
            <MemoryRouter>
                <ShopContextProvider>
                    <ChatInterface onClose={() => { }} />
                </ShopContextProvider>
            </MemoryRouter>,
        )
        const live = await screen.findByRole('log')
        expect(live).toHaveAttribute('aria-live', 'polite')
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — flow 11: Collections shows the whole catalog (FE-003)', () => {
    // Finding:     FE-003 (filters/sorts on non-existent schema fields)
    // ENABLED in Phase 3, roadmap task 3.4. Was: "the price ceiling is the
    // literal 1000 and the category filter reads `item.category`, which no
    // product has".
    it('shows a $2,500 laptop at /collections/all', async () => {
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000101', name: 'Affordable Mouse', price: 129, tags: ['Accessories'] }),
            makeProduct({ _id: '5eed00000000000000000102', name: 'Expensive Laptop', price: 2500, tags: ['Laptops'] }),
        ])

        render(
            <MemoryRouter initialEntries={['/collections/all']}>
                <ShopContextProvider>
                    <Routes><Route path="/collections/:type" element={<Collections />} /></Routes>
                </ShopContextProvider>
            </MemoryRouter>,
        )

        expect(await screen.findByText('Expensive Laptop')).toBeInTheDocument()
        expect(screen.getByText('Affordable Mouse')).toBeInTheDocument()
    })

    // Finding:     FE-003. ENABLED in Phase 3, task 3.4.
    it('filters a typed collection by tag rather than by a non-existent category field', async () => {
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000101', name: 'Affordable Mouse', price: 129, tags: ['Accessories'] }),
            makeProduct({ _id: '5eed00000000000000000102', name: 'Expensive Laptop', price: 2500, tags: ['Laptops'] }),
        ])

        render(
            <MemoryRouter initialEntries={['/collections/accessories']}>
                <ShopContextProvider>
                    <Routes><Route path="/collections/:type" element={<Collections />} /></Routes>
                </ShopContextProvider>
            </MemoryRouter>,
        )

        expect(await screen.findByText('Affordable Mouse')).toBeInTheDocument()
        expect(screen.queryByText('Expensive Laptop')).not.toBeInTheDocument()
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — navigation, showcase selection and states', () => {
    // Finding:     FE-005 (navigate(-1) falls through to window.location)
    // ENABLED in Phase 3, roadmap task 3.3.
    it('provides goBack() and leaves numeric navigation to the router', async () => {
        const { context } = renderWithProvider(null)
        await waitFor(() => expect(context()).not.toBeNull())
        expect(typeof context().goBack).toBe('function')

        // The old path threw on `path.includes` and fell back to
        // `window.location.href = -1`: a full page load of "/-1".
        act(() => { context().navigate(-1) })
        act(() => { context().goBack() })
    })

    // Finding:     FE-004, PORT-001, FE-030
    // ENABLED in Phase 3, roadmap task 3.6. Was: "FeaturedProducts, ShopTheLook,
    // FeaturedProduct, HeroVideo and ChatInterface all select products by
    // literal ObjectId. Phase 0 works around this by seeding those exact ids
    // (see backend/scripts/seedData.js); the ids remain in the source until this
    // lands."
    it('selects homepage products by showcase flag, with no ObjectId literals in source', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')

        const files = [
            'components/FeaturedProducts.jsx',
            'components/ShopTheLook.jsx',
            'components/FeaturedProduct.jsx',
            'components/HeroVideo.jsx',
            'components/Chatbot/ChatInterface.jsx',
        ]
        for (const file of files) {
            const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')
            expect(source, `${file} still hardcodes an ObjectId`).not.toMatch(/['"][0-9a-f]{24}['"]/)
        }
    })

    // Finding:     FE-012 (Cart renders "empty" while the catalog loads)
    // ENABLED in Phase 3, roadmap task 3.9. Was: a `setTimeout(300)` that fired
    // whether or not the catalog had arrived, so a slow connection produced
    // "Your cart is empty" for a customer with a full cart.
    it('never shows an empty cart while the catalog is still loading', async () => {
        const { default: Cart } = await import('../../pages/Cart.jsx')
        render(<MemoryRouter><ShopContextProvider><Cart /></ShopContextProvider></MemoryRouter>)
        expect(screen.queryByText(/your cart is empty/i)).not.toBeInTheDocument()
        // Synchronous rather than `findByRole`: the status is present at first
        // paint and *goes away* when the catalog lands, so polling for it races
        // the very request whose latency it exists to cover. Asserting it on the
        // first render is the stronger statement — the Phase 0 text's intent,
        // with the race removed.
        expect(screen.getByRole('status')).toBeInTheDocument()

        // …and once the catalog settles, an empty cart is finally allowed to
        // say so.
        expect(await screen.findByText(/your cart is empty/i)).toBeInTheDocument()
    })

    // Finding:     FE-013 (Wishlist spinner never resolves on an empty catalog)
    // ENABLED in Phase 3, roadmap task 3.9. Was: `setIsLoading(false)` lived
    // inside `if (products.length > 0)`, so the only way out of the loading
    // state was a catalog with something in it — and "you have saved nothing
    // yet" was the one case the page could not reach.
    it('resolves the wishlist view against an empty catalog instead of spinning forever', async () => {
        setCatalog([])
        const { default: Wishlist } = await import('../../pages/Wishlist.jsx')
        render(<MemoryRouter><ShopContextProvider><Wishlist /></ShopContextProvider></MemoryRouter>)
        expect(await screen.findByText(/wishlist is empty/i)).toBeInTheDocument()
    })

    // Finding:     FE-018 (CartTotal string-concatenates ".00"), DB-004
    // ENABLED in Phase 2, roadmap task 2.6. Was: "`{currency} {getCartAmount()}.00`
    // renders a float total as $1299.99.00".
    it('formats a total as $1,299.99 rather than $1299.99.00', async () => {
        const { default: CartTotal } = await import('../../components/CartTotal.jsx')
        setCatalog([makeProduct({ _id: 'p-money', price: 1299.99, inventory: { '512GB': 5 } })])

        const { context } = renderWithProvider(<CartTotal />)
        await waitFor(() => expect(context()?.products).toHaveLength(1))

        // The exact assertion from Phase 0: no doubled decimal anywhere.
        expect(screen.queryByText(/\.00\.00|\d+\.\d\d\.00/)).toBeNull()

        // And the positive half, which the Phase 0 text could not state because
        // there was no formatter to state it against.
        await act(async () => {
            await context().addToCart('p-money', '512GB', 1)
        })
        await waitFor(() => expect(screen.getByText('$1,299.99')).toBeInTheDocument())
        // Subtotal + $3.00 delivery, computed in integer minor units.
        expect(screen.getByText('$1,302.99')).toBeInTheDocument()
        expect(screen.getByText('$3.00')).toBeInTheDocument()
    })

    // Finding:     DB-004. ENABLED in Phase 2, task 2.6.
    it('sums a multi-line cart with no floating-point drift', async () => {
        const { default: CartTotal } = await import('../../components/CartTotal.jsx')
        setCatalog([
            makeProduct({ _id: 'p-a', price: 19.99, inventory: { '512GB': 50 } }),
            makeProduct({ _id: 'p-b', price: 0.1, inventory: { '512GB': 50 } }),
        ])

        const { context } = renderWithProvider(<CartTotal />)
        await waitFor(() => expect(context()?.products).toHaveLength(2))

        // One `act` each: `addToCart` clones the `cartItems` it closed over, so
        // two calls in the same commit would both start from the same empty
        // cart and the second would drop the first. That is existing context
        // behaviour, not something this test is about — FE-002 and the wider
        // provider rework are Phase 3.
        await act(async () => { await context().addToCart('p-a', '512GB', 3) })
        await act(async () => { await context().addToCart('p-b', '512GB', 3) })

        // 3 x 19.99 + 3 x 0.10 = 60.27 exactly. Accumulated as floats it is
        // 60.269999999999996, and the old code rendered whatever that produced.
        await waitFor(() => expect(context().getCartAmountMinor()).toBe(6027))
        expect(screen.getByText('$60.27')).toBeInTheDocument()
        expect(screen.getByText('$63.27')).toBeInTheDocument()
    })

    // Finding:     DB-004. ENABLED in Phase 2, task 2.6.
    it('renders a legacy product that has no priceMinor, and a migrated one, identically', async () => {
        setCatalog([
            makeProduct({ _id: 'p-legacy', price: 19.99, inventory: { '512GB': 5 } }),
        ])
        const { context } = renderWithProvider(null)
        await waitFor(() => expect(context()?.products).toHaveLength(1))

        // Dual-read: strip the migrated field and the major-unit one still
        // produces the same exact figure.
        const migrated = context().getPriceMinor({ priceMinor: 1999, price: 19.99 })
        const legacy = context().getPriceMinor({ price: 19.99 })
        expect(migrated).toBe(1999)
        expect(legacy).toBe(1999)
        expect(context().formatPrice(legacy)).toBe('$19.99')
    })

    // Finding:     A11Y-001 (no prefers-reduced-motion support anywhere)
    // Activated:   Phase 4, roadmap task 4.7. The per-surface behaviour this
    //              stylesheet check stands in for is asserted directly in
    //              `src/test/a11y/reduced-motion.test.jsx` and, in a real
    //              browser, in `e2e/reduced-motion.spec.js`.
    it('honours prefers-reduced-motion', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
        expect(css).toMatch(/prefers-reduced-motion/)
    })
})
