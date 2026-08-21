import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ProductCard from '../../components/ProductCard.jsx'
import FeaturedProduct from '../../components/FeaturedProduct.jsx'
import ShopTheLook from '../../components/ShopTheLook.jsx'
import RequireAuth from '../../components/RequireAuth.jsx'
import { ShopContext } from '../../context/shopContext.js'
import Product from '../../pages/Product.jsx'
import PlaceOrder from '../../pages/PlaceOrder.jsx'
import Wishlist from '../../pages/Wishlist.jsx'
import { canonicalVariantId } from '../../lib/variant.js'

const PRODUCT_ID = '5eed00000000000000000201'
const AMBIGUOUS_OPTIONS = { Size: '16-inch', Storage: '1TB' }

const ambiguousProduct = {
    _id: PRODUCT_ID,
    name: 'Lossless Laptop',
    brand: 'Netronix',
    description: 'A laptop with ambiguous legacy option keys.',
    priceMinor: 100000,
    image: ['data:image/svg+xml;base64,PHN2Zy8+'],
    tags: ['Gaming PCs'],
    variants: [
        { name: 'Size', options: ['16-inch', '16'] },
        { name: 'Storage', options: ['1TB', 'inch-1TB'] },
    ],
    inventoryV2: [
        {
            variantId: canonicalVariantId(AMBIGUOUS_OPTIONS),
            legacyKey: '16-inch-1TB',
            options: AMBIGUOUS_OPTIONS,
            quantity: 3,
        },
        {
            variantId: canonicalVariantId({ Size: '16', Storage: 'inch-1TB' }),
            legacyKey: '16-inch-1TB',
            options: { Size: '16', Storage: 'inch-1TB' },
            quantity: 3,
        },
    ],
}

const baseContext = (overrides = {}) => ({
    products: [],
    addToCart: vi.fn(),
    navigate: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    isInWishlist: () => false,
    getSingleProduct: vi.fn(),
    availableFor: () => 3,
    getPriceMinor: (product) => product.priceMinor,
    formatPrice: (minor) => `$${(minor / 100).toFixed(2)}`,
    token: '',
    cartLines: [],
    setCartItems: vi.fn(),
    getCartAmountMinor: () => 0,
    deliveryFeeMinor: 300,
    ...overrides,
})

function renderWithContext(node, context, entries = ['/']) {
    return render(
        <MemoryRouter initialEntries={entries}>
            <ShopContext.Provider value={context}>{node}</ShopContext.Provider>
        </MemoryRouter>,
    )
}

describe('lossless customer variant selections', () => {
    it('the product page sends the selected option pairs instead of an ambiguous key', async () => {
        const user = userEvent.setup()
        const context = baseContext({ products: [ambiguousProduct] })
        renderWithContext(
            <Routes><Route path="/product/:productId" element={<Product />} /></Routes>,
            context,
            [`/product/${PRODUCT_ID}`],
        )

        await user.click(await screen.findByRole('button', { name: '16-inch' }))
        await user.click(screen.getByRole('button', { name: '1TB' }))
        await user.click(screen.getByRole('button', { name: /add to cart/i }))

        expect(context.addToCart).toHaveBeenCalledWith(
            PRODUCT_ID,
            { variantOptions: AMBIGUOUS_OPTIONS },
            1,
        )
    })

    it('quick-add sends the first stocked typed option pairs', async () => {
        const user = userEvent.setup()
        const context = baseContext()
        renderWithContext(
            <ProductCard product={ambiguousProduct} variant="showcase" showQuickAdd />,
            context,
        )

        await user.click(screen.getByRole('button', { name: /add to cart/i }))
        expect(context.addToCart).toHaveBeenCalledWith(
            PRODUCT_ID,
            { variantOptions: AMBIGUOUS_OPTIONS },
            1,
        )
    })

    it('quick-add uses the valid empty option identity for a variantless product', async () => {
        const user = userEvent.setup()
        const context = baseContext()
        const variantless = {
            ...ambiguousProduct,
            variants: [],
            inventoryV2: [{ variantId: '', legacyKey: '', options: {}, quantity: 3 }],
        }
        renderWithContext(<ProductCard product={variantless} variant="showcase" showQuickAdd />, context)

        await user.click(screen.getByRole('button', { name: /add to cart/i }))
        expect(context.addToCart).toHaveBeenCalledWith(
            PRODUCT_ID,
            { variantOptions: {} },
            1,
        )
    })

    it('the featured product sends its typed default combination', async () => {
        const user = userEvent.setup()
        const context = baseContext({
            showcaseOne: () => ambiguousProduct,
            catalogStatus: 'ready',
        })
        renderWithContext(<FeaturedProduct />, context)

        await user.click(screen.getByRole('button', { name: /add to cart/i }))
        expect(context.addToCart).toHaveBeenCalledWith(
            PRODUCT_ID,
            { variantOptions: AMBIGUOUS_OPTIONS },
            1,
        )
    })

    it('shop-the-look quick-add sends typed options rather than its legacy key', async () => {
        const user = userEvent.setup()
        const context = baseContext({
            showcase: () => [ambiguousProduct],
            catalogStatus: 'ready',
        })
        renderWithContext(<ShopTheLook />, context)

        await user.click(screen.getByRole('button', { name: /add to cart/i }))
        expect(context.addToCart).toHaveBeenCalledWith(
            PRODUCT_ID,
            { variantOptions: AMBIGUOUS_OPTIONS },
            1,
        )
    })

    it('wishlist add uses the empty typed identity for a variantless product', async () => {
        const user = userEvent.setup()
        const variantless = { ...ambiguousProduct, variants: [] }
        const context = baseContext({
            wishlist: [PRODUCT_ID],
            wishlistStatus: 'ready',
            products: [variantless],
            catalogStatus: 'ready',
            catalogError: null,
            reloadCatalog: vi.fn(),
            goBack: vi.fn(),
        })
        renderWithContext(<Wishlist />, context)

        await user.click(screen.getByRole('button', { name: /add to cart/i }))
        expect(context.addToCart).toHaveBeenCalledWith(PRODUCT_ID, { variantOptions: {} })
    })
})

describe('supported navigation and valid interactive structure', () => {
    it('product tags link to the supported products query and encode the tag', async () => {
        renderWithContext(
            <Routes><Route path="/product/:productId" element={<Product />} /></Routes>,
            baseContext({ products: [ambiguousProduct] }),
            [`/product/${PRODUCT_ID}`],
        )
        expect(await screen.findByRole('link', { name: 'Gaming PCs' }))
            .toHaveAttribute('href', '/products?tag=Gaming+PCs')
    })

    it('a product card has independent actions without nesting buttons in its link', async () => {
        const context = baseContext()
        const { container } = renderWithContext(
            <ProductCard product={ambiguousProduct} variant="full" />,
            context,
        )
        await waitFor(() => expect(container.querySelector('.product-card')).not.toBeNull())

        expect(container.querySelectorAll('a button')).toHaveLength(0)
        expect(screen.getByRole('link', { name: ambiguousProduct.name }))
            .toHaveAttribute('href', `/product/${PRODUCT_ID}`)

        fireEvent.click(screen.getByRole('button', { name: /add .* to cart/i }))
        expect(context.addToCart).toHaveBeenCalledTimes(1)
    })
})

describe('form and quantity control names', () => {
    it('associates every checkout label with its input', () => {
        renderWithContext(<PlaceOrder />, baseContext())
        for (const name of [
            'First Name', 'Last Name', 'Email Address', 'Street Address', 'City',
            'State/Province', 'Zip/Postal Code', 'Country', 'Phone Number',
        ]) {
            expect(screen.getByLabelText(name)).toBeInTheDocument()
        }
    })

    it('labels the product quantity decrement and increment controls', async () => {
        renderWithContext(
            <Routes><Route path="/product/:productId" element={<Product />} /></Routes>,
            baseContext({ products: [{
                ...ambiguousProduct,
                variants: [],
                inventoryV2: [{ variantId: '', legacyKey: '', options: {}, quantity: 3 }],
            }] }),
            [`/product/${PRODUCT_ID}`],
        )
        expect(await screen.findByRole('button', { name: /decrease quantity/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /increase quantity/i })).toBeInTheDocument()
    })
})

describe('defensive auth gate storage access', () => {
    it('redirects rather than crashing when browser storage is unavailable', () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError')
        })
        try {
            renderWithContext(
                <Routes>
                    <Route path="/orders" element={<RequireAuth><div>private orders</div></RequireAuth>} />
                    <Route path="/login" element={<div>sign in safely</div>} />
                </Routes>,
                baseContext(),
                ['/orders'],
            )
            expect(screen.getByText('sign in safely')).toBeInTheDocument()
        } finally {
            getItem.mockRestore()
        }
    })
})
