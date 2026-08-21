// CHARACTERISATION — the admin console's money and variant consumers, after
// Phase 2 (DB-003, DB-004, ARCH-003, ADM-004's display half).
//
// Three of the five variant consumers the audit names live in this application:
// `Add.jsx` encodes a matrix, `List.jsx` formats and edits it, and `Orders.jsx`
// renders what was bought. All three used to build and take apart a string of
// option values joined with "-", and all three used to print money by
// concatenating a symbol onto a float.
//
// Two things are asserted here rather than assumed:
//
//   * a **hyphenated** option — the case that breaks the old encoding — renders
//     and round-trips correctly through the console;
//   * an order written **before** the migration, carrying only the legacy
//     fields, still renders, because the rollout is additive and a deployed
//     console must not need the new fields to exist.

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import List from '../../pages/List.jsx'
import Orders from '../../pages/Orders.jsx'
import { makeProduct, makeOrder, setCatalog, setOrders, requestLog, VALID_ADMIN_TOKEN } from '../msw/handlers.js'
import * as handlers from '../msw/handlers.js'

const renderPage = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

/** Order rows collapse by default; the line detail is behind the header. */
const expandFirstOrder = async (orderNumber) => {
    const header = await screen.findByText(`#${orderNumber}`)
    await userEvent.click(header)
}

/** A laptop whose option values both contain the delimiter (DB-003). */
const hyphenatedProduct = () => makeProduct({
    _id: 'p-hyphen',
    name: 'Netronix Forge 16',
    price: 2499.5,
    variants: [
        { name: 'Size', options: ['14-inch', '16-inch'] },
        { name: 'GPU', options: ['RTX-4090'] },
    ],
    inventory: { '14-inch-RTX-4090': 4, '16-inch-RTX-4090': 1 },
})

describe('List — money and the variant matrix (DB-003, DB-004)', () => {
    it('formats a price through Intl rather than concatenating a symbol', async () => {
        setCatalog([makeProduct({ price: 2499.5 })])
        renderPage(<List token={VALID_ADMIN_TOKEN} />)

        // Was `${item.price}` — "$2499.5", with no decimals and no separator.
        expect(await screen.findByText('$2,499.50')).toBeInTheDocument()
        expect(screen.queryByText('$2499.5')).toBeNull()
    })

    it('labels a hyphenated combination by its axes, not by the raw key', async () => {
        setCatalog([hyphenatedProduct()])
        renderPage(<List token={VALID_ADMIN_TOKEN} />)

        await userEvent.click(await screen.findByRole('button', { name: /manage stock/i }))

        // `formatVariantKey` split on "-" and bailed out to the raw key whenever
        // the segment count disagreed with the axis count — which "16-inch" and
        // "RTX-4090" guarantee. The console showed "16-inch-RTX-4090".
        expect(await screen.findByText('Size: 16-inch, GPU: RTX-4090')).toBeInTheDocument()
        expect(screen.getByText('Size: 14-inch, GPU: RTX-4090')).toBeInTheDocument()
        expect(screen.queryByText('16-inch-RTX-4090')).toBeNull()
    })

    it('sends the lossless option pairs when the matrix is saved, in one request', async () => {
        // FLIPPED in Phase 3, task 3.14 (ADM-004). Phase 2 made the payload
        // lossless — the combination named by its option pairs rather than by
        // the hyphen-joined key — but left the *shape* of the save alone: one
        // request per combination, which for this two-axis product was two, and
        // for a 3x3 product nine. The losslessness is unchanged; the save is now
        // a single atomic request.
        setCatalog([hyphenatedProduct()])
        renderPage(<List token={VALID_ADMIN_TOKEN} />)

        await userEvent.click(await screen.findByRole('button', { name: /manage stock/i }))
        await screen.findByText('Size: 16-inch, GPU: RTX-4090')
        await userEvent.click(screen.getByRole('button', { name: /save inventory/i }))

        await waitFor(() =>
            expect(requestLog.filter((entry) => entry.includes('/inventory'))).toHaveLength(1))

        const { entries } = handlers.lastInventoryRequest
        expect(entries.every((entry) => entry.variantOptions !== undefined)).toBe(true)
        // The fixture's own quantities, unchanged: the save carries the matrix
        // as it stands, and both hyphenated combinations survive the round trip.
        expect(entries).toContainEqual({
            variantOptions: { Size: '16-inch', GPU: 'RTX-4090' },
            quantity: 1,
        })
        expect(entries).toContainEqual({
            variantOptions: { Size: '14-inch', GPU: 'RTX-4090' },
            quantity: 4,
        })
    })

    it('renders a product that predates the migration, which carries no priceMinor', async () => {
        // The dual-read half of the rollout: `presentProduct` derives the minor
        // figure when the document has only the major one.
        setCatalog([makeProduct({ _id: 'p-legacy', name: 'Legacy Product', price: 19.99 })])
        renderPage(<List token={VALID_ADMIN_TOKEN} />)

        expect(await screen.findByText('Legacy Product')).toBeInTheDocument()
        expect(screen.getByText('$19.99')).toBeInTheDocument()
    })
})

describe('Orders — snapshots and money (DB-005, DB-004, ARCH-003)', () => {
    it('renders the snapshot the order carries, formatted exactly', async () => {
        setOrders([makeOrder()])
        renderPage(<Orders token={VALID_ADMIN_TOKEN} />)
        await expandFirstOrder(1000)

        expect(await screen.findByText('MacBook Pro 16" M4 Pro')).toBeInTheDocument()
        // Was `{currency}{order.amount}` — "$2502".
        expect(screen.getAllByText('$2,502.00').length).toBeGreaterThan(0)
        // The line total and the order subtotal are the same figure on a
        // single-line order, so both appear.
        expect(screen.getAllByText('$2,499.00').length).toBe(2)
        expect(screen.getByText('$3.00')).toBeInTheDocument()
        expect(screen.queryByText('$2502')).toBeNull()
    })

    it('shows the variant label the order recorded, not a hardcoded "Size:"', async () => {
        setOrders([makeOrder({
            items: [{
                ...makeOrder().items[0],
                variantLabel: 'Size: 16-inch, GPU: RTX-4090',
                variantKey: '16-inch-RTX-4090',
                size: '16-inch-RTX-4090',
            }],
        })])
        renderPage(<Orders token={VALID_ADMIN_TOKEN} />)
        await expandFirstOrder(1000)

        expect(await screen.findByText('Size: 16-inch, GPU: RTX-4090')).toBeInTheDocument()
    })

    it('renders an order written before the migration, with only the legacy fields', async () => {
        // No `amountMinor`, no `unitPriceMinor`, no `variantLabel` — the exact
        // shape a pre-Phase-2 order has, and the reason the money helpers
        // dual-read rather than requiring the new fields.
        setOrders([{
            _id: '5eed00000000000000001001',
            orderNumber: 1001,
            items: [{ productId: 'p-old', size: '1TB', quantity: 2, name: 'Older Product', price: 10.5 }],
            amount: 24,
            subtotal: 21,
            delivery_fee: 3,
            address: { firstName: 'Demo', lastName: 'Customer', city: 'Beirut', country: 'Lebanon', phone: '+961 71 000 000' },
            status: 'Delivered',
            paymentMethod: 'COD',
            payment: true,
            date: '2026-08-01T09:30:00.000Z',
            isGuestOrder: true,
        }])
        renderPage(<Orders token={VALID_ADMIN_TOKEN} />)
        await expandFirstOrder(1001)

        expect(await screen.findByText('Older Product')).toBeInTheDocument()
        expect(screen.getAllByText('$24.00').length).toBeGreaterThan(0)
        // $21.00 twice: the subtotal, and the line total recomputed from the
        // unit price because this order never recorded one (2 x $10.50).
        expect(screen.getAllByText('$21.00').length).toBe(2)
        // The legacy key stands in for a label the order never had.
        expect(screen.getByText('1TB')).toBeInTheDocument()
    })
})
