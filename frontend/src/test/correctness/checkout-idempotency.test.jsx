// PHASE 0–2 PRE-COMMIT — the storefront has to send an idempotency key.
//
// The server has honoured `Idempotency-Key` since Phase 2. The storefront never
// sent one, so a double-clicked "Place Order", a retry after a timeout, or a
// refresh while the request was in flight each created a second order and
// decremented stock a second time. `isSubmitting` guards none of those: it does
// not survive the reload a customer performs precisely when they cannot tell
// whether the order went through.

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import PlaceOrder from '../../pages/PlaceOrder.jsx'
import { makeProduct, setCatalog, placedOrders, failNextOrders } from '../msw/handlers.js'
import {
    IDEMPOTENCY_HEADER, attemptFingerprint, createCheckoutAttempt, newIdempotencyKey,
} from '../../lib/idempotency.js'

/** The server's own `KEY_PATTERN` and bounds, restated. */
const SERVER_KEY_PATTERN = /^[A-Za-z0-9_.:@-]+$/

const PRODUCT_ID = '5eed00000000000000000101'

const ADDRESS = {
    firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
    street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
    zipcode: '02022', country: 'Lebanon', phone: '+961 71 000 000',
}

describe('the key generator', () => {
    it('produces a key the server will accept', () => {
        const key = newIdempotencyKey()
        expect(key).toMatch(SERVER_KEY_PATTERN)
        expect(key.length).toBeGreaterThanOrEqual(4)
        expect(key.length).toBeLessThanOrEqual(200)
    })

    it('produces a different key every time', () => {
        const keys = new Set(Array.from({ length: 200 }, newIdempotencyKey))
        expect(keys.size).toBe(200)
    })
})

describe('attemptFingerprint', () => {
    const base = { items: [{ productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 }], address: ADDRESS }

    it('ignores the order the axes were named in', () => {
        expect(attemptFingerprint({ ...base, items: [{ productId: 'p1', variantOptions: { Colour: 'Black', Size: 'L' }, quantity: 1 }] }))
            .toBe(attemptFingerprint({ ...base, items: [{ productId: 'p1', variantOptions: { Size: 'L', Colour: 'Black' }, quantity: 1 }] }))
    })

    it('ignores the order the cart lines are in', () => {
        const items = [
            { productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 },
            { productId: 'p2', variantOptions: { Colour: 'White' }, quantity: 2 },
        ]
        expect(attemptFingerprint({ items, address: ADDRESS }))
            .toBe(attemptFingerprint({ items: [...items].reverse(), address: ADDRESS }))
    })

    it('groups duplicate equivalent lines like the server', () => {
        const split = [
            { productId: 'p1', variantOptions: { Colour: 'Black', Size: 'L' }, quantity: 1 },
            { productId: 'p1', variantOptions: { Size: 'L', Colour: 'Black' }, quantity: 2 },
        ]
        const grouped = [{
            productId: 'p1', variantOptions: { Colour: 'Black', Size: 'L' }, quantity: 3,
        }]
        expect(attemptFingerprint({ items: split, address: ADDRESS }))
            .toBe(attemptFingerprint({ items: grouped, address: ADDRESS }))
    })

    it('uses the same lossless identity precedence as the server', () => {
        const canonical = [{
            productId: 'p1', variantId: 'stale-id', variantKey: 'stale-key', size: 'stale-size',
            variantOptions: { Colour: 'Black', Size: 'L' }, quantity: 1,
        }]
        const equivalent = [{
            productId: 'p1', variantOptions: { Size: 'L', Colour: 'Black' }, quantity: 1,
        }]
        expect(attemptFingerprint({ items: canonical, address: ADDRESS }))
            .toBe(attemptFingerprint({ items: equivalent, address: ADDRESS }))
    })

    it('compares equal identities as equal instead of relying on sort stability', () => {
        const left = [
            { productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 },
            { productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 2 },
            { productId: 'p2', variantKey: 'legacy', quantity: 1 },
        ]
        const right = [left[1], left[0], left[2]]
        expect(attemptFingerprint({ items: left, address: ADDRESS }))
            .toBe(attemptFingerprint({ items: right, address: ADDRESS }))
    })

    it('changes when the quantity, the combination or the address changes', () => {
        const original = attemptFingerprint(base)
        expect(attemptFingerprint({ ...base, items: [{ ...base.items[0], quantity: 2 }] })).not.toBe(original)
        expect(attemptFingerprint({ ...base, items: [{ ...base.items[0], variantOptions: { Colour: 'White' } }] })).not.toBe(original)
        expect(attemptFingerprint({ ...base, address: { ...ADDRESS, street: 'Elsewhere' } })).not.toBe(original)
        expect(attemptFingerprint({ ...base, paymentMethod: 'WHISH' })).not.toBe(original)
    })
})

describe('createCheckoutAttempt', () => {
    const request = { items: [{ productId: 'p1', quantity: 1 }], address: ADDRESS, paymentMethod: 'COD' }

    it('keeps one key across every retry of the same attempt', () => {
        const attempt = createCheckoutAttempt()
        const first = attempt.keyFor(request)
        expect(attempt.keyFor(request)).toBe(first)
        expect(attempt.keyFor({ ...request })).toBe(first)
    })

    it('issues a new key when the request genuinely changes', () => {
        const attempt = createCheckoutAttempt()
        const first = attempt.keyFor(request)
        const second = attempt.keyFor({ ...request, items: [{ productId: 'p1', quantity: 2 }] })
        expect(second).not.toBe(first)
        // …and then holds the new one.
        expect(attempt.keyFor({ ...request, items: [{ productId: 'p1', quantity: 2 }] })).toBe(second)
    })

    it('issues a new key once an order has actually been placed', () => {
        const attempt = createCheckoutAttempt()
        const first = attempt.keyFor(request)
        attempt.settle()
        expect(attempt.keyFor(request)).not.toBe(first)
    })

    it('restores an unsettled key after a component remount or page reload', () => {
        const firstMount = createCheckoutAttempt(sessionStorage)
        const first = firstMount.keyFor(request)

        // A fresh holder models both a remounted checkout component and the
        // freshly evaluated application after a reload. Browser storage is the
        // only state shared by both.
        const remounted = createCheckoutAttempt(sessionStorage)
        expect(remounted.keyFor(request)).toBe(first)
    })

    it('reuses the reloaded key when equivalent duplicate lines are grouped', () => {
        const splitRequest = {
            ...request,
            items: [
                { productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 1 },
                { productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 2 },
            ],
        }
        const firstMount = createCheckoutAttempt(sessionStorage)
        const first = firstMount.keyFor(splitRequest)

        const reloaded = createCheckoutAttempt(sessionStorage)
        expect(reloaded.keyFor({
            ...request,
            items: [{ productId: 'p1', variantOptions: { Colour: 'Black' }, quantity: 3 }],
        })).toBe(first)
    })

    it('does not leak a completed attempt key into a later checkout', () => {
        const completed = createCheckoutAttempt(sessionStorage)
        const first = completed.keyFor(request)
        completed.settle()

        const laterCheckout = createCheckoutAttempt(sessionStorage)
        expect(laterCheckout.keyFor(request)).not.toBe(first)
    })
})

// ---------------------------------------------------------------------------
describe('the checkout screen', () => {
    beforeEach(() => {
        setCatalog([makeProduct({ _id: PRODUCT_ID, variants: [], inventory: { '': 5 } })])
        // A guest cart, which is what the provider restores on mount.
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { '': 1 } }))
    })

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

    it('sends an idempotency key the server will accept', async () => {
        const user = userEvent.setup()
        renderCheckout()
        await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument())

        await fillAndSubmit(user)

        await waitFor(() => expect(placedOrders).toHaveLength(1))
        const sent = placedOrders[0].idempotencyKey
        expect(sent, `no ${IDEMPOTENCY_HEADER} header was sent`).toBeTruthy()
        expect(sent).toMatch(SERVER_KEY_PATTERN)
    })

    it('reuses the same key when the first attempt fails in a way it cannot interpret', async () => {
        const user = userEvent.setup()
        // One 503, then success — the timeout/retry shape.
        failNextOrders(1)
        renderCheckout()
        await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument())

        await fillAndSubmit(user)
        await waitFor(() => expect(screen.getByRole('button', { name: /place order/i })).toBeEnabled())

        // The customer presses it again, which is what a customer does.
        await user.click(screen.getByRole('button', { name: /place order/i }))
        await waitFor(() => expect(placedOrders).toHaveLength(1))

        expect(placedOrders[0].idempotencyKey).toBeTruthy()
    })
})
