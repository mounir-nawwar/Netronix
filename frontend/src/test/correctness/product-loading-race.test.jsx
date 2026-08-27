import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropTypes from 'prop-types'

import Product from '../../pages/Product.jsx'
import { ShopContext } from '../../context/shopContext.js'

const product = {
    _id: '680262846be92b2511550a66',
    name: 'Race-safe laptop',
    description: 'A product used to reproduce the catalog arrival race.',
    image: ['/product.webp'],
    priceMinor: 125000,
    tags: [],
    variants: [{ name: 'Memory', options: ['16 GB', '32 GB'] }],
    inventory: { '16 GB': 3, '32 GB': 2 },
}

function deferred() {
    let resolve
    const promise = new Promise((settle) => { resolve = settle })
    return { promise, resolve }
}

function contextValue(products, getSingleProduct) {
    return {
        products,
        getSingleProduct,
        addToCart: vi.fn(),
        navigate: vi.fn(),
        addToWishlist: vi.fn(),
        removeFromWishlist: vi.fn(),
        isInWishlist: () => false,
        availableFor: (item, key) => item.inventory[key] ?? null,
        getPriceMinor: (item) => item.priceMinor,
        formatPrice: (minor) => `$${(minor / 100).toFixed(2)}`,
    }
}

function ProductHarness({ products, getSingleProduct }) {
    return (
        <MemoryRouter initialEntries={[`/product/${product._id}`]}>
            <ShopContext.Provider value={contextValue(products, getSingleProduct)}>
                <Routes>
                    <Route path="/product/:productId" element={<Product />} />
                </Routes>
            </ShopContext.Provider>
        </MemoryRouter>
    )
}

ProductHarness.propTypes = {
    products: PropTypes.arrayOf(PropTypes.object).isRequired,
    getSingleProduct: PropTypes.func.isRequired,
}

describe('Product catalog/single-request race', () => {
    it('announces the pending product load', () => {
        render(<ProductHarness products={[]} getSingleProduct={() => new Promise(() => {})} />)
        expect(screen.getByRole('status', { name: /loading product/i })).toBeInTheDocument()
    })

    it('does not let a stale single-product response reset a variant selected after the catalog arrives', async () => {
        const single = deferred()
        const getSingleProduct = vi.fn(() => single.promise)
        const user = userEvent.setup()

        const view = render(<ProductHarness products={[]} getSingleProduct={getSingleProduct} />)
        expect(getSingleProduct).toHaveBeenCalledTimes(1)

        view.rerender(<ProductHarness products={[product]} getSingleProduct={getSingleProduct} />)
        const memory16 = await screen.findByRole('button', { name: '16 GB' })
        expect(screen.getByRole('button', { name: `Zoom in on ${product.name}` })).toHaveClass('aspect-square')
        expect(screen.getByRole('heading', { name: product.name })).not.toHaveStyle({ opacity: '0' })
        // `getAllByText(...).find(el => el.classList.contains('line-clamp-3'))`
        // was here, and it needed the `All` because the description was printed
        // **twice** on this page — clamped to three lines under the price, and
        // again in full under a one-item "Details" tab. There is one now, so
        // there is one element to find.
        expect(screen.getByText(product.description)).not.toHaveStyle({ opacity: '0' })
        expect(screen.getByText('$1250.00')).not.toHaveStyle({ opacity: '0' })
        await user.click(memory16)
        expect(memory16).toHaveAttribute('aria-pressed', 'true')

        await act(async () => { single.resolve({ ...product }) })

        expect(screen.getByRole('button', { name: '16 GB' })).toHaveAttribute('aria-pressed', 'true')
        expect(getSingleProduct).toHaveBeenCalledTimes(1)
    })
})
