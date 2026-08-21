// PHASE 3 — routes, guards and boundaries (FE-020, FE-021).
//
// Roadmap task 3.10, frontend plan F-8.

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { setCatalog, makeProduct } from '../msw/handlers.js'
import ErrorBoundary from '../../components/ErrorBoundary.jsx'
import RequireAuth from '../../components/RequireAuth.jsx'
import App from '../../App.jsx'
import PropTypes from 'prop-types'

const renderApp = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <ShopContextProvider><App /></ShopContextProvider>
    </MemoryRouter>,
)

describe('FE-020 — an unmatched URL says so', () => {
    it('renders a 404 page rather than empty chrome', async () => {
        renderApp('/nonexistent')
        expect(await screen.findByText(/page not found/i)).toBeInTheDocument()
    })

    it('still renders the site chrome around it, so the visitor can leave', async () => {
        renderApp('/definitely/not/a/route')
        await screen.findByText(/page not found/i)
        expect(screen.getByRole('link', { name: /back to home/i })).toBeInTheDocument()
    })

    it('a real route is unaffected', async () => {
        renderApp('/cart')
        expect(await screen.findByRole('heading', { name: /shopping cart/i })).toBeInTheDocument()
    })
})

describe('FE-003 — the collections route names the parameter the page reads', () => {
    it('renders a typed collection through the real route table', async () => {
        // Mounted through `App`, not through a `<Route>` this test declares.
        // The route was `/collections/*` — a splat — so `useParams()` gave
        // `{ '*': 'macbooks' }` and `const { type } = useParams()` was
        // `undefined`: every typed collection silently showed the whole
        // catalog. A component test that mounts its own
        // `<Route path="/collections/:type">` proves the filter works and says
        // nothing about whether the application ever calls it.
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000001', name: 'A MacBook', tags: ['MacBooks'] }),
            makeProduct({ _id: '5eed00000000000000000002', name: 'A Gaming PC', tags: ['Gaming PCs'] }),
        ])
        renderApp('/collections/macbooks')

        expect(await screen.findByText('A MacBook')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText('A Gaming PC')).not.toBeInTheDocument())
    })

    it('renders the whole catalog at /collections/all', async () => {
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000001', name: 'A MacBook', tags: ['MacBooks'] }),
            makeProduct({ _id: '5eed00000000000000000002', name: 'A Gaming PC', tags: ['Gaming PCs'] }),
        ])
        renderApp('/collections/all')

        expect(await screen.findByText('A MacBook')).toBeInTheDocument()
        expect(screen.getByText('A Gaming PC')).toBeInTheDocument()
    })
})

describe('FE-021 — guarded routes', () => {
    it('sends a logged-out visitor from /orders to the sign-in page', async () => {
        renderApp('/orders')
        // It used to render "No orders found", which is a claim about the
        // account rather than the session, and it is false.
        await waitFor(() => expect(screen.queryByText(/no orders found/i)).not.toBeInTheDocument())
        // A11Y-009 — the navbar's profile icon is a named control now ("Sign
        // in" for a signed-out visitor), so a bare role+name query matches two
        // buttons. The one this test is about is the form's submit button on
        // the sign-in page, which is inside <main>.
        const main = await screen.findByRole('main')
        expect(await within(main).findByRole('button', { name: /sign in|login/i })).toBeInTheDocument()
    })

    it('lets a signed-in customer through', async () => {
        localStorage.setItem('token', 'a-token')
        renderApp('/orders')
        expect(await screen.findByRole('heading', { name: /my orders/i })).toBeInTheDocument()
    })

    it('remembers where it sent them from', () => {
        let seen = null
        render(
            <MemoryRouter initialEntries={['/orders']}>
                <ShopContextProvider>
                    <Routes>
                        <Route path="/orders" element={<RequireAuth><div>orders</div></RequireAuth>} />
                        <Route
                            path="/login"
                            element={<LocationProbe onLocation={(location) => { seen = location }} />}
                        />
                    </Routes>
                </ShopContextProvider>
            </MemoryRouter>,
        )
        expect(seen?.state?.from).toBe('/orders')
    })

    it('keeps guest checkout public', async () => {
        // Buying without an account is a supported path (flows 11-12). Gating
        // it would remove a feature under the guise of fixing a bug.
        renderApp('/placeorder')
        expect(await screen.findByRole('heading', { name: /delivery information/i }))
            .toBeInTheDocument()
    })
})

function LocationProbe({ onLocation }) {
    onLocation(useLocation())
    return <div>login</div>
}

LocationProbe.propTypes = { onLocation: PropTypes.func.isRequired }

describe('FE-021 — the route-level error boundary', () => {
    const Explode = () => { throw new Error('component exploded') }

    it('catches a throwing child instead of blanking the page', () => {
        const errors = []
        const original = console.error
        console.error = (...args) => errors.push(args.join(' '))
        try {
            render(
                <MemoryRouter>
                    <ErrorBoundary><Explode /></ErrorBoundary>
                </MemoryRouter>,
            )
        } finally {
            console.error = original
        }

        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
        // The failure is reported somewhere a person can find it, rather than
        // swallowed — which would be worse than the blank page.
        expect(errors.join('\n')).toMatch(/component exploded|Unhandled error in a route/)
    })

    it('offers a way out that does not require a reload', () => {
        const original = console.error
        console.error = () => { }
        try {
            render(<MemoryRouter><ErrorBoundary><Explode /></ErrorBoundary></MemoryRouter>)
        } finally {
            console.error = original
        }
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /back to home/i })).toBeInTheDocument()
    })

    it('renders its children untouched when nothing throws', () => {
        render(<MemoryRouter><ErrorBoundary><div>all fine</div></ErrorBoundary></MemoryRouter>)
        expect(screen.getByText('all fine')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).toBeNull()
    })
})
