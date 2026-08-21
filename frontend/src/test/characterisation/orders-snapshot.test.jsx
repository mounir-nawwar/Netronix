// CHARACTERISATION — the storefront's order history after Phase 2 (FE-017,
// DB-005, DB-004, ARCH-003).
//
// FE-017 was one line: `{ ...item, ...productDetails }`. The catalog spread
// *after* the order line, so today's name, price and image overwrote what was
// actually bought. Changing a price rewrote every past order that contained the
// product; deleting one degraded the line to "Product" and "$0".
//
// The order is inverted now, and for an order placed after the migration the
// catalog is not consulted at all — the API serves a self-contained snapshot.
// The tests below cover both: a snapshot order whose product has since changed,
// and a pre-migration order that still has to render.

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import Orders from '../../pages/Orders.jsx'
import { setCatalog, setOrders, makeProduct, makeOrder } from '../msw/handlers.js'

const renderOrders = () => render(
    <MemoryRouter>
        <ShopContextProvider>
            <Orders />
        </ShopContextProvider>
    </MemoryRouter>,
)

/** The storefront only fetches orders when it holds a token. */
const withToken = () => localStorage.setItem('token', 'test.customer.token')

describe('flow 10 — order history shows what was bought (FE-017 — fixed)', () => {
    it('shows the snapshot price and name, not the catalog\'s current ones', async () => {
        withToken()
        // The catalog has moved on: renamed, and repriced from 2499 to 1.
        setCatalog([makeProduct({ _id: '680897a3a9a5ffb06b2e52c8', name: 'Renamed After Purchase', price: 1 })])
        setOrders([makeOrder()])

        renderOrders()

        expect(await screen.findByText('MacBook Pro 16" M4 Pro')).toBeInTheDocument()
        expect(screen.getByText('$2,499.00')).toBeInTheDocument()
        expect(screen.queryByText('Renamed After Purchase')).toBeNull()
        expect(screen.queryByText('$1.00')).toBeNull()
    })

    it('shows the variant label the order recorded rather than a hardcoded "Size:"', async () => {
        withToken()
        setOrders([makeOrder({
            items: [{ ...makeOrder().items[0], variantLabel: 'Size: 16-inch, GPU: RTX-4090' }],
        })])

        renderOrders()

        expect(await screen.findByText('Size: 16-inch, GPU: RTX-4090')).toBeInTheDocument()
    })

    it('survives the product being gone from the catalog entirely', async () => {
        withToken()
        setCatalog([])
        setOrders([makeOrder()])

        renderOrders()

        // Previously this degraded to "Product" and "$0" — the line held only
        // ids, and the catalog it was resolved against no longer had them.
        expect(await screen.findByText('MacBook Pro 16" M4 Pro')).toBeInTheDocument()
        expect(screen.getByText('$2,499.00')).toBeInTheDocument()
    })

    it('renders a pre-migration order, and marks a reconstructed line as an approximation', async () => {
        withToken()
        setCatalog([makeProduct({ _id: 'p-old', name: 'Older Product', price: 10.5 })])
        setOrders([makeOrder({
            _id: '5eed00000000000000001001',
            orderNumber: 1001,
            items: [{
                productId: 'p-old',
                size: '1TB',
                quantity: 2,
                // What migration 002 writes: reconstructed from the catalog as
                // it stood at migration time, and honest about it.
                name: 'Older Product',
                unitPrice: 10.5,
                unitPriceMinor: 1050,
                price: 10.5,
                _reconstructed: true,
            }],
            amountMinor: undefined,
            subtotalMinor: undefined,
            deliveryFeeMinor: undefined,
        })])

        renderOrders()

        expect(await screen.findByText('Older Product')).toBeInTheDocument()
        expect(screen.getByText('$10.50')).toBeInTheDocument()
        // Historical prices are not recoverable, so a reconstructed one must
        // never be presented as a record of what was charged.
        expect(screen.getByText('Reconstructed')).toBeInTheDocument()
    })

    it('does not label a genuine snapshot as reconstructed', async () => {
        withToken()
        setOrders([makeOrder()])
        renderOrders()

        await waitFor(() => expect(screen.getByText('MacBook Pro 16" M4 Pro')).toBeInTheDocument())
        expect(screen.queryByText('Reconstructed')).toBeNull()
    })
})
