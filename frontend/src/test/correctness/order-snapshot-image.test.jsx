// PHASE 0–2 PRE-COMMIT — the order snapshot's image survives being rendered.
//
// Migration 002 and `orderService` both store an order line's `image` as a
// **string**: `Array.isArray(product.image) ? product.image[0] : product.image`.
// `Orders.jsx` kept indexing it as the catalog array it used to be —
// `item.image && item.image[0]` — so it rendered the first *character* of the
// URL. Every order line in the storefront's history asked the browser for a
// one-character image, and the truthiness guard passed, so the fallback icon
// never showed either.
//
// The admin console already handled both forms. The storefront did not.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import Orders from '../../pages/Orders.jsx'
import { setCatalog, setOrders, makeOrder, makeProduct } from '../msw/handlers.js'
import { firstImage } from '../../lib/catalog.js'

const SNAPSHOT_URL = 'https://res.cloudinary.com/demo/image/upload/v1/netronix/macbook-16.png'

const renderOrders = () => render(
    <MemoryRouter><ShopContextProvider><Orders /></ShopContextProvider></MemoryRouter>,
)

const withToken = () => localStorage.setItem('token', 'test.customer.token')

describe('firstImage', () => {
    it('accepts the string a snapshot stores', () => {
        expect(firstImage(SNAPSHOT_URL)).toBe(SNAPSHOT_URL)
    })

    it('accepts the array the catalog stores', () => {
        expect(firstImage([SNAPSHOT_URL, 'second.png'])).toBe(SNAPSHOT_URL)
    })

    it('skips empty entries in a legacy array rather than rendering one', () => {
        expect(firstImage(['', '   ', SNAPSHOT_URL])).toBe(SNAPSHOT_URL)
    })

    it('is empty for anything that is not an image', () => {
        expect(firstImage(undefined)).toBe('')
        expect(firstImage(null)).toBe('')
        expect(firstImage([])).toBe('')
        expect(firstImage(42)).toBe('')
        expect(firstImage({ url: SNAPSHOT_URL })).toBe('')
    })
})

describe('order history renders the snapshot image it was given', () => {
    it('uses the whole URL of a string snapshot, not its first character', async () => {
        withToken()
        setCatalog([])
        setOrders([makeOrder({ items: [{ ...makeOrder().items[0], image: SNAPSHOT_URL }] })])

        renderOrders()

        const image = await screen.findByRole('img', { name: /macbook pro/i })
        expect(image).toHaveAttribute('src', SNAPSHOT_URL)
    })

    it('still renders a pre-migration line whose image is an array', async () => {
        withToken()
        setCatalog([])
        setOrders([makeOrder({ items: [{ ...makeOrder().items[0], image: [SNAPSHOT_URL, 'other.png'] }] })])

        renderOrders()

        const image = await screen.findByRole('img', { name: /macbook pro/i })
        expect(image).toHaveAttribute('src', SNAPSHOT_URL)
    })

    it('falls back to the placeholder when the snapshot carries no image', async () => {
        withToken()
        setCatalog([])
        setOrders([makeOrder({ items: [{ ...makeOrder().items[0], image: '' }] })])

        renderOrders()

        expect(await screen.findByText('MacBook Pro 16" M4 Pro')).toBeInTheDocument()
        expect(screen.queryByRole('img', { name: /macbook pro/i })).toBeNull()
    })

    it('does not let the catalog array leak back over the snapshot string', async () => {
        withToken()
        // The catalog has a different image today. The order shows what was
        // bought (DB-005), including its picture.
        setCatalog([makeProduct({ _id: '680897a3a9a5ffb06b2e52c8', image: ['https://example.test/new.png'] })])
        setOrders([makeOrder({ items: [{ ...makeOrder().items[0], image: SNAPSHOT_URL }] })])

        renderOrders()

        const image = await screen.findByRole('img', { name: /macbook pro/i })
        expect(image).toHaveAttribute('src', SNAPSHOT_URL)
    })
})
