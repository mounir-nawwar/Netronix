// PHASE 0–2 PRE-COMMIT — an unidentifiable cart line says so (DB-003).
//
// A legacy cart key is a hyphen join, and for a catalog that really contains
// `["16-inch","16"] × ["1TB","inch-1TB"]` the key `16-inch-1TB` names two
// different combinations. Nothing may choose between them.
//
// `availableFor` already answers `null` — "we cannot identify this" — as
// distinct from `0`. The cart collapsed the two with `?? 0` and told the
// customer "Out of stock. Please remove this item." about a product that is in
// stock, which is both untrue and unactionable: removing and re-adding the same
// option reproduces it.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import Cart from '../../pages/Cart.jsx'
import { makeProduct, setCatalog } from '../msw/handlers.js'

const PRODUCT_ID = '5eed00000000000000000201'

/** Both `16-inch` + `1TB` and `16` + `inch-1TB` join to `16-inch-1TB`. */
const COLLIDING = makeProduct({
    _id: PRODUCT_ID,
    name: 'Colliding Laptop',
    variants: [
        { name: 'Screen', options: ['16-inch', '16'] },
        { name: 'Storage', options: ['1TB', 'inch-1TB'] },
    ],
    inventory: { '16-inch-1TB': 4 },
})

const renderCart = () => render(
    <MemoryRouter><ShopContextProvider><Cart /></ShopContextProvider></MemoryRouter>,
)

describe('a cart line the catalog cannot identify', () => {
    it('is described as unidentifiable rather than as out of stock', async () => {
        setCatalog([COLLIDING])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { '16-inch-1TB': 1 } }))

        renderCart()

        expect(await screen.findByText(/cannot be identified/i)).toBeInTheDocument()
        expect(screen.queryByText(/out of stock/i)).toBeNull()
    })

    it('still offers the way out', async () => {
        setCatalog([COLLIDING])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { '16-inch-1TB': 1 } }))

        renderCart()

        await screen.findByText(/cannot be identified/i)
        expect(screen.getByRole('button', { name: 'Remove item' })).toBeInTheDocument()
    })

    it('still says out of stock when that is what is true', async () => {
        const soldOut = makeProduct({
            _id: PRODUCT_ID,
            variants: [{ name: 'Colour', options: ['Black'] }],
            inventory: { Black: 0 },
        })
        setCatalog([soldOut])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { Black: 1 } }))

        renderCart()

        expect(await screen.findByText(/out of stock/i)).toBeInTheDocument()
        expect(screen.queryByText(/cannot be identified/i)).toBeNull()
    })
})
