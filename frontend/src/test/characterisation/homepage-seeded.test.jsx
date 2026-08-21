// CHARACTERISATION — the homepage against a seeded catalog, and against an
// empty one (FE-004, PORT-001, FE-030).
//
// FLIPPED IN PHASE 3, roadmap task 3.6.
//
// Phase 0 recorded the transitional shim and the two failure modes it hid.
// Five components named the products they display by literal ObjectId, so the
// seed adopted those exact ids as its primary keys to make the homepage work at
// all. Against any other database:
//
//   * `ShopTheLook` spread `undefined` into an object, kept four nameless
//     entries through `.filter(Boolean)`, and then read `product.name` on one —
//     **throwing during render**. With no error boundary (FE-021) that was not a
//     blank section, it was a blank site.
//   * `FeaturedProduct` displayed an **invented product** — a "Razer Cobra
//     Mouse" at $79.99 that is in no catalog — which a visitor could not tell
//     from a real one, with an Add to Cart button that led nowhere.
//   * `FeaturedProducts` degraded quietly to three empty tabs.
//
// A product now declares which homepage surface it belongs to and where in it,
// through `showcase: [{ slot, order }]`. Selection is a pure function of the
// catalog the context already holds — so no section fetches anything, an empty
// catalog produces an empty state, and there is no id in the source to go stale.
//
// The backend half is `backend/test/scripts/seed.test.js` → "fills every
// showcase slot" and "names no product by literal id in any storefront
// component".

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ShopContextProvider from '../../context/ShopContext.jsx'
import FeaturedProducts from '../../components/FeaturedProducts.jsx'
import ShopTheLook from '../../components/ShopTheLook.jsx'
import FeaturedProduct from '../../components/FeaturedProduct.jsx'
import PropTypes from 'prop-types'
import HeroVideo from '../../components/HeroVideo.jsx'
import { setCatalog, makeProduct, slot, requestLog } from '../msw/handlers.js'

/**
 * A catalog shaped like the seeded one: every homepage surface filled, by
 * declaration rather than by id.
 *
 * The ids here are obviously synthetic. That is the point — nothing in the
 * storefront reads one, so the fixture is free to use whatever it likes, which
 * is exactly the coupling this phase removed.
 */
const seededCatalog = () => [
    makeProduct({
        _id: '5eed00000000000000000001', name: 'Seeded MacBook', price: 2499,
        tags: ['MacBooks', 'Laptops'], date: 1785585900000,
        showcase: [slot('featured', 0), slot('shop-the-look', 1)],
    }),
    makeProduct({
        _id: '5eed00000000000000000002', name: 'Seeded MacBook Air', price: 1149,
        tags: ['MacBooks', 'Laptops'], date: 1785585800000,
        showcase: [slot('featured', 1)],
    }),
    makeProduct({
        _id: '5eed00000000000000000003', name: 'Seeded Gaming Laptop', price: 2199,
        tags: ['Laptops', 'Gaming'], date: 1785585700000,
        showcase: [slot('featured', 2)],
    }),
    makeProduct({
        _id: '5eed00000000000000000004', name: 'Seeded Battlestation', price: 3299,
        tags: ['Gaming PCs', 'Gaming'], date: 1785585600000,
        showcase: [slot('featured', 3)],
    }),
    makeProduct({
        _id: '5eed00000000000000000005', name: 'Seeded Monitor', price: 899,
        tags: ['Accessories'], date: 1785585500000,
        showcase: [slot('shop-the-look', 0)],
    }),
    makeProduct({
        _id: '5eed00000000000000000006', name: 'Seeded Headset', price: 349,
        tags: ['Headphones'], date: 1785585400000,
        showcase: [slot('shop-the-look', 2)],
    }),
    makeProduct({
        _id: '5eed00000000000000000007', name: 'Seeded Keyboard', price: 199,
        tags: ['Accessories'], date: 1785585300000,
        showcase: [slot('shop-the-look', 3)],
    }),
    makeProduct({
        _id: '5eed00000000000000000008', name: 'Seeded Mouse', price: 129.99,
        tags: ['Accessories', 'Gaming'], date: 1785585200000,
        showcase: [slot('featured-product', 0), slot('hero-video', 0)],
    }),
    makeProduct({
        _id: '5eed00000000000000000009', name: 'Seeded Power Bank', price: 99,
        tags: ['Accessories'], date: 1785585100000,
        showcase: [],
    }),
]

const renderInStore = (component) =>
    render(<MemoryRouter><ShopContextProvider>{component}</ShopContextProvider></MemoryRouter>)

/** Catches a render error so a crash can be asserted rather than escaping. */
class Boundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    render() {
        if (this.state.error) return <div data-testid="crashed">{this.state.error.message}</div>
        return this.props.children
    }
}

Boundary.propTypes = { children: PropTypes.node }

// ---------------------------------------------------------------------------
describe('a seeded catalog renders every homepage section (FE-004 / PORT-001 — FIXED)', () => {
    it('FeaturedProducts fills its tabs from the featured slot', async () => {
        setCatalog(seededCatalog())
        renderInStore(<FeaturedProducts />)

        // The first tab is "Latest Laptops": the featured products tagged
        // `Laptops`, in declared order.
        expect(await screen.findAllByText('Seeded MacBook')).not.toHaveLength(0)
        expect(screen.queryAllByText('Seeded Gaming Laptop')).not.toHaveLength(0)
    })

    it('resolves every tab, and derives the tabs from real tags', async () => {
        const user = userEvent.setup()
        setCatalog(seededCatalog())
        renderInStore(<FeaturedProducts />)
        await screen.findAllByText('Seeded MacBook')

        const tabs = [
            ['Latest Laptops', ['Seeded MacBook', 'Seeded MacBook Air', 'Seeded Gaming Laptop']],
            ['Gaming PCs', ['Seeded Battlestation']],
            ['MacBooks', ['Seeded MacBook', 'Seeded MacBook Air']],
        ]
        for (const [label, names] of tabs) {
            await user.click(screen.getByRole('button', { name: label }))
            for (const name of names) {
                expect(screen.queryAllByText(name), `${label} → ${name}`).not.toHaveLength(0)
            }
        }
    })

    it('never shows a product that claims no showcase slot', async () => {
        setCatalog(seededCatalog())
        renderInStore(<FeaturedProducts />)
        await screen.findAllByText('Seeded MacBook')

        expect(screen.queryByText('Seeded Power Bank')).not.toBeInTheDocument()
    })

    it('ShopTheLook resolves all four hotspots, in declared order', async () => {
        setCatalog(seededCatalog())
        renderInStore(<ShopTheLook />)

        for (const name of ['Seeded Monitor', 'Seeded MacBook', 'Seeded Headset', 'Seeded Keyboard']) {
            expect(await screen.findByLabelText(`View ${name}`)).toBeInTheDocument()
        }
        // `order: 0` is the first hotspot and the panel's opening selection.
        expect(screen.getAllByText('Seeded Monitor')).not.toHaveLength(0)
    })

    it('FeaturedProduct resolves its single product without inventing one', async () => {
        setCatalog(seededCatalog())
        renderInStore(<FeaturedProduct />)

        expect(await screen.findAllByText('Seeded Mouse')).not.toHaveLength(0)
        expect(screen.queryByText('Razer Cobra Mouse')).not.toBeInTheDocument()
    })

    it('HeroVideo points its call to action at the hero-video product', async () => {
        setCatalog(seededCatalog())
        renderInStore(<HeroVideo />)

        const links = await screen.findAllByRole('link', { name: /view details/i })
        for (const link of links) {
            expect(link).toHaveAttribute('href', '/product/5eed00000000000000000008')
        }
    })

    it('no homepage section issues a catalog request of its own (FE-006)', async () => {
        setCatalog(seededCatalog())
        renderInStore(
            <>
                <FeaturedProducts />
                <ShopTheLook />
                <FeaturedProduct />
                <HeroVideo />
            </>,
        )
        await screen.findAllByText('Seeded MacBook')

        // Five sections used to pull the whole catalog concurrently, on top of
        // the two the duplicated provider already issued.
        expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(1)
    })
})

// ---------------------------------------------------------------------------
describe('an empty catalog gets an empty state, not a crash or a fiction (FE-004 — FIXED)', () => {
    it('ShopTheLook renders an empty state instead of throwing', async () => {
        setCatalog([])
        const onError = vi.spyOn(console, 'error').mockImplementation(() => { })

        renderInStore(<Boundary><ShopTheLook /></Boundary>)

        // Previously: `{ ...undefined, position }` survived `.filter(Boolean)`,
        // and `getProductImage` read `product.name.toLowerCase()` on it.
        await waitFor(() => expect(screen.queryByTestId('crashed')).toBeNull())
        expect(await screen.findByText(/no workspace picks yet/i)).toBeInTheDocument()
        onError.mockRestore()
    })

    it('ShopTheLook invents no placeholder products while loading or empty', async () => {
        setCatalog([])
        renderInStore(<ShopTheLook />)
        await screen.findByText(/no workspace picks yet/i)

        // The four placeholders it used to show, with a "Loading..." brand, a
        // price of $0 and a fabricated rating.
        for (const invented of ['Monitor', 'MacBook', 'Headset', 'Keyboard']) {
            expect(screen.queryByText(invented), invented).toBeNull()
        }
        expect(screen.queryByText('Loading...')).toBeNull()
    })

    it('FeaturedProducts says so rather than showing three empty tabs', async () => {
        setCatalog([])
        renderInStore(<FeaturedProducts />)
        expect(await screen.findByText(/no featured products yet/i)).toBeInTheDocument()
    })

    it('FeaturedProduct renders nothing rather than a product that does not exist', async () => {
        setCatalog([])
        const { container } = renderInStore(<FeaturedProduct />)

        await waitFor(() => expect(screen.queryByText('Razer Cobra Mouse')).toBeNull())
        expect(container.querySelector('section')).toBeNull()
    })

    it('HeroVideo keeps the video and drops the dead call to action', async () => {
        setCatalog([])
        const { container } = renderInStore(<HeroVideo />)

        await waitFor(() => expect(container.querySelector('video')).not.toBeNull())
        expect(screen.queryByRole('link', { name: /view details/i })).toBeNull()
    })
})

// ---------------------------------------------------------------------------
describe('no storefront component names a product by literal id (FE-004 / FE-030)', () => {
    it('has no 24-hex literal in any homepage component or in the chat client', () => {
        const files = [
            'components/FeaturedProducts.jsx',
            'components/ShopTheLook.jsx',
            'components/FeaturedProduct.jsx',
            'components/HeroVideo.jsx',
            'components/Chatbot/ChatInterface.jsx',
        ]
        for (const file of files) {
            const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')
            expect(source, `${file} still hardcodes an ObjectId`).not.toMatch(/['"][0-9a-f]{24}['"]/)
        }
    })
})
