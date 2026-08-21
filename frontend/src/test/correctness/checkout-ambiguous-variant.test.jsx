// PHASE 0–2 PRE-COMMIT — the checkout must not guess a combination (DB-003).
//
// `PlaceOrder` built each order line with
// `getVariantEntries(product).find(c => c.legacyKey === size)` — the **first**
// entry whose legacy key matched — and attached that entry's `options` as
// `variantOptions`.
//
// For a catalog that really contains `["16-inch","16"] × ["1TB","inch-1TB"]`
// both combinations produce the key `16-inch-1TB`, so the client picked one and
// sent it as the lossless, unambiguous identity. That is worse than sending
// nothing: the server refuses an ambiguous legacy key precisely so that nobody
// guesses, and `variantOptions` bypasses that refusal with the guess. Stock
// would be taken from a combination the customer never selected.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import PlaceOrder from '../../pages/PlaceOrder.jsx'
import { makeProduct, setCatalog, placedOrders } from '../msw/handlers.js'

// The page reports this through a toast, and no `ToastContainer` is mounted in
// a unit test, so the call itself is what is asserted.
const toastError = vi.fn()
vi.mock('react-toastify', async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, toast: { ...actual.toast, error: (...args) => toastError(...args), success: vi.fn() } }
})

const PRODUCT_ID = '5eed00000000000000000301'

const COLLIDING = makeProduct({
    _id: PRODUCT_ID,
    name: 'Colliding Laptop',
    variants: [
        { name: 'Screen', options: ['16-inch', '16'] },
        { name: 'Storage', options: ['1TB', 'inch-1TB'] },
    ],
    inventory: { '16-inch-1TB': 4 },
})

const PLAIN = makeProduct({
    _id: PRODUCT_ID,
    name: 'Plain Laptop',
    variants: [{ name: 'Storage', options: ['1TB', '2TB'] }],
    inventory: { '1TB': 4, '2TB': 4 },
})

const ADDRESS = {
    firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
    street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
    zipcode: '02022', country: 'Lebanon', phone: '+961 71 000 000',
}

const renderCheckout = () => render(
    <MemoryRouter><ShopContextProvider><PlaceOrder /></ShopContextProvider></MemoryRouter>,
)

async function fillAndSubmit(user) {
    await user.type(screen.getByPlaceholderText('First name'), ADDRESS.firstName)
    await user.type(screen.getByPlaceholderText('Last name'), ADDRESS.lastName)
    await user.type(screen.getByPlaceholderText('Email Address'), ADDRESS.email)
    await user.type(screen.getByPlaceholderText('Street'), ADDRESS.street)
    await user.type(screen.getByPlaceholderText('City'), ADDRESS.city)
    await user.type(screen.getByPlaceholderText('State/Province'), ADDRESS.state)
    await user.type(screen.getByPlaceholderText('Zip/Postal Code'), ADDRESS.zipcode)
    await user.type(screen.getByPlaceholderText('Country'), ADDRESS.country)
    await user.type(screen.getByPlaceholderText('Phone Number'), ADDRESS.phone)
    await user.click(screen.getByRole('button', { name: /place order/i }))
}

describe('a cart line whose key names two combinations', () => {
    beforeEach(() => {
        setCatalog([COLLIDING])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { '16-inch-1TB': 1 } }))
    })

    it('is not sent as an order at all', async () => {
        const user = userEvent.setup()
        renderCheckout()
        await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument())

        await fillAndSubmit(user)

        // Nothing was placed, and in particular nothing was placed for a
        // combination the customer never chose.
        await waitFor(() => expect(screen.getByRole('button', { name: /place order/i })).toBeEnabled())
        expect(placedOrders).toHaveLength(0)
    })

    it('says what is wrong and what to do about it', async () => {
        const user = userEvent.setup()
        renderCheckout()
        await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument())

        await fillAndSubmit(user)

        await waitFor(() => expect(toastError).toHaveBeenCalled())
        expect(toastError.mock.calls.flat().join(' ')).toMatch(/cannot be identified/i)
    })
})

describe('a cart line whose key names exactly one combination', () => {
    it('still carries the lossless option pairs', async () => {
        setCatalog([PLAIN])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { '2TB': 1 } }))

        const user = userEvent.setup()
        renderCheckout()
        await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument())

        await fillAndSubmit(user)

        await waitFor(() => expect(placedOrders).toHaveLength(1))
        expect(placedOrders[0].body.items[0]).toMatchObject({
            productId: PRODUCT_ID,
            size: '2TB',
            variantOptions: { Storage: '2TB' },
            quantity: 1,
        })
    })
})
