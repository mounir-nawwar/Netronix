// The displayed price has to move when a variant is chosen.
//
// The regression this covers is not hypothetical: every combination in the
// catalog carried a zero delta, so `displayPrice` was arithmetically correct
// and visibly wrong — the figure never changed, whichever option was pressed.
// Nothing in the suite clicked an option and read the price back, so the whole
// feature could be inert and green at the same time.
//
// So these tests drive the page the way a visitor does — press an option, read
// the price — rather than calling `displayPrice` directly, and they assert the
// formatted string that is actually on screen.

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropTypes from 'prop-types'

import Product from '../../pages/Product.jsx'
import { ShopContext } from '../../context/shopContext.js'
import { formatMoney } from '../../lib/money.js'
import { entriesOf } from '../../lib/variant.js'

/** Two priced axes, so a partial selection has more than one match. */
const laptop = {
    _id: '680262846be92b2511550a70',
    name: 'Two-axis laptop',
    description: 'A product whose price depends on two axes.',
    image: ['/laptop.webp'],
    price: 1299,
    priceMinor: 129900,
    tags: [],
    variants: [
        { name: 'Memory', options: ['16 GB', '32 GB'] },
        { name: 'Storage', options: ['512 GB', '1 TB'] },
    ],
    inventoryV2: [
        entry({ Memory: '16 GB', Storage: '512 GB' }, 5, 0),
        entry({ Memory: '16 GB', Storage: '1 TB' }, 4, 125),
        entry({ Memory: '32 GB', Storage: '512 GB' }, 3, 160),
        entry({ Memory: '32 GB', Storage: '1 TB' }, 2, 285),
    ],
}

/**
 * One axis, and the delta stored only in major units — the shape of a document
 * written before `priceMinorDelta` existed. Modelled on the two Edition-axis
 * products (Razer Cobra, PS5 Slim) that were repriced in the catalog.
 */
const mouse = {
    _id: '680262846be92b2511550a71',
    name: 'Single-axis mouse',
    description: 'A product with one priced axis and a legacy delta.',
    image: ['/mouse.webp'],
    price: 39.99,
    priceMinor: 3999,
    tags: [],
    variants: [{ name: 'Edition', options: ['Standard', 'Pro (Wireless)'] }],
    inventoryV2: [
        { ...entry({ Edition: 'Standard' }, 18, 0), priceMinorDelta: undefined },
        { ...entry({ Edition: 'Pro (Wireless)' }, 7, 90), priceMinorDelta: undefined },
    ],
}

function entry(options, quantity, priceDelta) {
    return {
        variantId: Object.entries(options).map(([name, value]) => `${name}=${value}`).join('|'),
        legacyKey: Object.values(options).join('-'),
        options,
        quantity,
        priceDelta,
        priceMinorDelta: Math.round(priceDelta * 100),
    }
}

/** Matches the way the real context resolves a selection: on the option pairs. */
function availableFor(product, selection) {
    const wanted = selection?.variantOptions ?? {}
    const names = Object.keys(wanted)
    const matches = entriesOf(product).filter(
        (candidate) => names.every((name) => candidate.options[name] === wanted[name]),
    )
    return matches.length === 1 ? matches[0].quantity : null
}

function ProductHarness({ product }) {
    const value = {
        products: [product],
        getSingleProduct: vi.fn(),
        addToCart: vi.fn(),
        navigate: vi.fn(),
        addToWishlist: vi.fn(),
        removeFromWishlist: vi.fn(),
        isInWishlist: () => false,
        availableFor,
        getPriceMinor: (item) => item.priceMinor,
        formatPrice: (minor) => formatMoney(minor),
    }
    return (
        <MemoryRouter initialEntries={[`/product/${product._id}`]}>
            <ShopContext.Provider value={value}>
                <Routes>
                    <Route path="/product/:productId" element={<Product />} />
                </Routes>
            </ShopContext.Provider>
        </MemoryRouter>
    )
}

ProductHarness.propTypes = { product: PropTypes.object.isRequired }

/** The one figure rendered as the product's price, read the way a visitor reads it. */
const shownPrice = () => screen.getByText(/^\$[\d,]+\.\d{2}$/).textContent

describe('Product page variant pricing', () => {
    it('shows the base price until an option is pressed', async () => {
        render(<ProductHarness product={laptop} />)
        await screen.findByRole('button', { name: '16 GB' })
        expect(shownPrice()).toBe('$1,299.00')
    })

    it('prices a complete selection at base + that combination’s delta', async () => {
        const user = userEvent.setup()
        render(<ProductHarness product={laptop} />)

        await user.click(await screen.findByRole('button', { name: '32 GB' }))
        await user.click(screen.getByRole('button', { name: '1 TB' }))

        expect(shownPrice()).toBe('$1,584.00')
    })

    it('reprices when one axis changes and the other stays put', async () => {
        const user = userEvent.setup()
        render(<ProductHarness product={laptop} />)

        await user.click(await screen.findByRole('button', { name: '32 GB' }))
        await user.click(screen.getByRole('button', { name: '1 TB' }))
        expect(shownPrice()).toBe('$1,584.00')

        await user.click(screen.getByRole('button', { name: '16 GB' }))
        expect(shownPrice()).toBe('$1,424.00')

        await user.click(screen.getByRole('button', { name: '512 GB' }))
        expect(shownPrice()).toBe('$1,299.00')
    })

    it('quotes the cheapest reachable combination while the selection is partial', async () => {
        const user = userEvent.setup()
        render(<ProductHarness product={laptop} />)

        // 32 GB alone matches +160 and +285; the visitor can still reach +160.
        await user.click(await screen.findByRole('button', { name: '32 GB' }))
        expect(shownPrice()).toBe('$1,459.00')

        // 1 TB alone matches +125 and +285.
        await user.click(screen.getByRole('button', { name: '16 GB' }))
        await user.click(screen.getByRole('button', { name: '1 TB' }))
        expect(shownPrice()).toBe('$1,424.00')
    })

    it('derives the delta from the major unit when only that was stored', async () => {
        const user = userEvent.setup()
        render(<ProductHarness product={mouse} />)

        await user.click(await screen.findByRole('button', { name: 'Standard' }))
        expect(shownPrice()).toBe('$39.99')

        await user.click(screen.getByRole('button', { name: 'Pro (Wireless)' }))
        expect(shownPrice()).toBe('$129.99')
    })
})
