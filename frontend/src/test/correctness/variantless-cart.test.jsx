// PHASE 3 RECOVERY — a product with no variants can be bought.
//
// Found by the browser end-to-end suite (flow 11, guest checkout), and by
// nothing else: every unit fixture in this repository gave its product a
// variant axis, and the server has always accepted the empty legacy key.
//
// `Product.jsx` renders an enabled "ADD TO CART" for a product with no axes —
// correctly: there is nothing to select, and `resolveVariant` resolves the
// empty key to the product's single combination. `ShopContext.addToCart` then
// opened with `if (!variantKey) { toast.error('Select Product Options'); return }`
// and threw the click away. Every accessory in the catalog was unbuyable, in the
// guest cart and the signed-in cart alike.

import { describe, it, expect } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useContext } from 'react'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { ShopContext } from '../../context/shopContext.js'
import { makeProduct, setCatalog } from '../msw/handlers.js'

let captured = null

function Probe() {
    captured = useContext(ShopContext)
    return <span data-testid="count">{captured.getCartCount()}</span>
}

const renderProvider = () => render(
    <MemoryRouter><ShopContextProvider><Probe /></ShopContextProvider></MemoryRouter>,
)

const ACCESSORY = '5eed00000000000000000011'
const LAPTOP = '5eed00000000000000000012'

describe('a product with no variants', () => {
    it('goes into the cart under its empty combination key', async () => {
        setCatalog([
            makeProduct({ _id: ACCESSORY, name: 'Anker Prime 27K', variants: [], inventory: { '': 11 } }),
        ])
        renderProvider()
        await waitFor(() => expect(captured.products).toHaveLength(1))

        await act(async () => { await captured.addToCart(ACCESSORY, '', 1) })

        await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
        expect(captured.cartItems[ACCESSORY]).toEqual({ '': 1 })
    })

    it('is added even when the caller passes no variant key at all', async () => {
        setCatalog([
            makeProduct({ _id: ACCESSORY, name: 'Anker Prime 27K', variants: [], inventory: { '': 11 } }),
        ])
        renderProvider()
        await waitFor(() => expect(captured.products).toHaveLength(1))

        await act(async () => { await captured.addToCart(ACCESSORY) })

        await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    })

    it('still respects the stock it has', async () => {
        setCatalog([
            makeProduct({ _id: ACCESSORY, name: 'Anker Prime 27K', variants: [], inventory: { '': 1 } }),
        ])
        renderProvider()
        await waitFor(() => expect(captured.products).toHaveLength(1))

        await act(async () => { await captured.addToCart(ACCESSORY, '', 5) })
        expect(captured.cartItems[ACCESSORY]).toBeUndefined()
    })
})

describe('a product that does have variants', () => {
    it('still refuses an empty key, because there is something to choose', async () => {
        setCatalog([
            makeProduct({
                _id: LAPTOP,
                name: 'MacBook Pro 16" M4 Pro',
                variants: [{ name: 'Storage', options: ['512GB', '1TB'] }],
                inventory: { '512GB': 4, '1TB': 1 },
            }),
        ])
        renderProvider()
        await waitFor(() => expect(captured.products).toHaveLength(1))

        await act(async () => { await captured.addToCart(LAPTOP, '', 1) })
        expect(captured.cartItems[LAPTOP]).toBeUndefined()

        // And the real combination goes in.
        await act(async () => { await captured.addToCart(LAPTOP, '512GB', 1) })
        await waitFor(() => expect(captured.cartItems[LAPTOP]).toEqual({ '512GB': 1 }))
    })
})
