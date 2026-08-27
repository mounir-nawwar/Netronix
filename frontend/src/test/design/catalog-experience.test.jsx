// The catalog, rebuilt.
//
// Two things are asserted here and they pull in opposite directions on purpose,
// the same way `contact-experience.test.jsx` does. The first is behaviour that
// was already correct and must survive a redesign: the taxonomy is the one the
// catalog really has, the price ceiling is derived from it, filtering narrows
// the grid, and a card is a link with a working quick-add. None of that may be
// lost to a visual rewrite.
//
// The second is composition. What this replaced was assembled out of the house
// style of a generative tool, and it is worth naming precisely, because a test
// cannot judge taste but it can hold the specific things that were wrong so
// they cannot come back one commit at a time:
//
//   * `bg-gradient-to-r from-indigo-600 to-purple-600` on the `/products`
//     filter header — a gradient in a palette this brand does not use, on a
//     site whose one accent is `#6a5acd`;
//   * five hardcoded `★★★★★` on every `full` card and a hardcoded `★ 4.5` on
//     every `showcase` card, against a schema with no rating field and no
//     review model, so the number was identical on all twenty products and
//     could never move;
//   * a hover overlay of three circular icon buttons, two of which — "Quick
//     view" and "Add to wishlist" — called `preventDefault()` and did nothing
//     at all;
//   * a price "slider" on `/products` that was a `<div>` nobody could drag;
//   * `<h1 className="text-3xl font-bold text-gray-900">Products</h1>`, the
//     framework default, on a site that sets every heading in Michroma;
//   * and two whole browse pages doing the same job to two different designs,
//     which is the part that is not a matter of taste: nobody designs the same
//     page twice on purpose.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import Collections from '../../pages/Collections.jsx'
import AllProducts from '../../pages/AllProducts.jsx'
import ProductCard from '../../components/ProductCard.jsx'
import { deriveInventoryV2 } from '../../lib/variant.js'
import { makeProduct, setCatalog } from '../msw/handlers.js'

/**
 * A fixture as a *card* reads one.
 *
 * `makeProduct` states inventory as the readable legacy bag, and the MSW
 * handler's `present()` converts it to the typed array the API actually serves.
 * A component rendered directly never goes through that handler, so it has to
 * be given the shape `entriesOf` expects (DB-003).
 */
const carded = ({ variants = [], inventory = { '': 5 }, ...overrides } = {}) => makeProduct({
    variants,
    inventoryV2: deriveInventoryV2(variants, inventory).entries,
    ...overrides,
})

/**
 * Reports the router's current query string, which `MemoryRouter` keeps off
 * `window`.
 *
 * A `<span>`, deliberately: `<output>` carries an implicit `role="status"`, and
 * the loading-state assertion below asks for *the* status on the page.
 */
const LocationProbe = () => {
    const location = useLocation()
    return <span data-testid="query">{location.search}</span>
}

// The surfaces this test governs. `Product.jsx` is included because the point
// of the redesign was that the catalog and the product page stop being two
// different products.
const CATALOG_SOURCES = [
    'components/ProductCard.jsx',
    'components/catalog/CatalogPage.jsx',
    'components/catalog/CatalogMasthead.jsx',
    'components/catalog/CatalogControls.jsx',
    'components/catalog/CatalogGrid.jsx',
    'components/catalog/RefineDrawer.jsx',
    'components/catalog/EditorialTile.jsx',
    'components/catalog/CardSkeleton.jsx',
    'pages/Collections.jsx',
    'pages/AllProducts.jsx',
    'pages/Product.jsx',
]

/** A source file with its comments removed, so prose about the old design is not evidence of it. */
const sourceOf = (file) => readFileSync(join(process.cwd(), 'src', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const LAPTOP = makeProduct({
    _id: '5eed00000000000000000201',
    name: 'Expensive Laptop',
    brand: 'Netronix',
    price: 2500,
    tags: ['Laptops'],
    date: 1785585700000,
})

const MOUSE = makeProduct({
    _id: '5eed00000000000000000202',
    name: 'Affordable Mouse',
    brand: 'Razer',
    price: 129,
    tags: ['Accessories'],
    date: 1785585600000,
})

const renderCollections = (type = 'all') => render(
    <MemoryRouter initialEntries={[`/collections/${type}`]}>
        <ShopContextProvider>
            <Routes><Route path="/collections/:type" element={<Collections />} /></Routes>
            <LocationProbe />
        </ShopContextProvider>
    </MemoryRouter>,
)

const renderAllProducts = (query = '') => render(
    <MemoryRouter initialEntries={[`/products${query}`]}>
        <ShopContextProvider>
            <Routes><Route path="/products" element={<AllProducts />} /></Routes>
        </ShopContextProvider>
    </MemoryRouter>,
)

// ---------------------------------------------------------------------------
describe('the catalog states only what the catalog knows', () => {
    it('invents no ratings anywhere in the browse experience', () => {
        for (const file of CATALOG_SOURCES) {
            const source = sourceOf(file)
            expect(source, `${file}: star glyph`).not.toMatch(/[★☆]/)
            expect(source, `${file}: star entity`).not.toMatch(/&#9733;|&#9734;/)
            // There is no review model. `aggregateRating` in structured data is
            // a claim search engines repeat.
            expect(source, `${file}: rating field`).not.toMatch(/\baggregateRating\b/)
            expect(source, `${file}: rating field`).not.toMatch(/\bproduct(Data)?\.rating\b/)
        }
    })

    it('reads no field the schema does not define', () => {
        for (const file of CATALOG_SOURCES) {
            const source = sourceOf(file)
            for (const field of ['createdAt', 'subCategory', 'vendor']) {
                expect(source, `${file}: ${field}`).not.toMatch(new RegExp(`\\b${field}\\b`))
            }
            // `category` survives only as a local name for a tag, never as a field.
            expect(source, `${file}: .category`).not.toMatch(/\b(item|product|productData|p)\.category\b/)
        }
    })

    it('surfaces stock from the typed inventory rather than a badge on every card', () => {
        const scarce = carded({
            _id: '5eed00000000000000000203',
            name: 'Nearly Gone',
            variants: [{ name: 'Size', options: ['S'] }],
            inventory: { S: 2 },
        })

        const { container, unmount } = render(
            <MemoryRouter><ShopContextProvider>
                <ProductCard product={scarce} variant="showcase" />
            </ShopContextProvider></MemoryRouter>,
        )
        expect(within(container).getByText('Last 2')).toBeInTheDocument()
        unmount()

        // A chip on every card is a texture, which is exactly what the five
        // stars were. A healthy product says nothing.
        const healthy = render(
            <MemoryRouter><ShopContextProvider>
                <ProductCard
                    product={carded({ _id: '5eed00000000000000000204', name: 'Plenty', inventory: { '': 40 } })}
                    variant="showcase"
                />
            </ShopContextProvider></MemoryRouter>,
        )
        expect(healthy.container.textContent).not.toMatch(/last \d|sold out/i)
    })
})

// ---------------------------------------------------------------------------
describe('every control on the page does something', () => {
    it('declares no button whose only job is to swallow its own click', () => {
        // `ProductCard`'s hover overlay shipped three circular icon buttons and
        // two of them were exactly this: an affordance for a feature that was
        // never built.
        const source = sourceOf('components/ProductCard.jsx')
        expect(source).not.toMatch(
            /onClick=\{\s*\(\s*event\s*\)\s*=>\s*\{\s*event\.preventDefault\(\)\s*;?\s*event\.stopPropagation\(\)\s*;?\s*\}\s*\}/,
        )
        expect(source).not.toMatch(/aria-label="Quick view"/)
    })

    it('offers no price track that cannot be dragged', () => {
        // `/products` rendered the filled portion of a range as a positioned
        // `<div>` with no input behind it at all.
        const drawer = sourceOf('components/catalog/RefineDrawer.jsx')
        expect(drawer).toMatch(/type="range"/)

        for (const file of ['pages/AllProducts.jsx', 'pages/Collections.jsx']) {
            expect(sourceOf(file), file).not.toMatch(/type="range"/)
        }
    })

    it('uses a real listbox for sort rather than unstyled OS chrome', () => {
        for (const file of CATALOG_SOURCES) {
            expect(sourceOf(file), `${file}: native select`).not.toMatch(/<select\b/)
        }
        expect(sourceOf('components/catalog/CatalogControls.jsx')).toMatch(/role="listbox"/)
    })
})

// ---------------------------------------------------------------------------
describe('one design language, and it is the homepage\'s', () => {
    it('uses the brand accent and never the framework default palette', () => {
        for (const file of CATALOG_SOURCES) {
            const source = sourceOf(file)
            expect(source, `${file}: indigo`).not.toMatch(/\bindigo-\d{2,3}\b/)
            expect(source, `${file}: purple-600`).not.toMatch(/\bpurple-\d{2,3}\b/)
            // The one gradient in the old sidebar header existed nowhere else
            // in the brand.
            expect(source, `${file}: gradient`).not.toMatch(/bg-gradient-to-/)
        }
    })

    it('carries the page name in the brand face, not in the framework default', () => {
        const masthead = sourceOf('components/catalog/CatalogMasthead.jsx')
        expect(masthead).toMatch(/font-michroma/)
        for (const file of ['pages/AllProducts.jsx', 'pages/Collections.jsx']) {
            expect(sourceOf(file), file).not.toMatch(/text-3xl font-bold/)
        }
    })

    it('builds depth from hairlines rather than from drop shadows', () => {
        for (const file of CATALOG_SOURCES) {
            expect(sourceOf(file), `${file}: shadow`).not.toMatch(/\bshadow-(sm|md|lg|xl)\b/)
        }
    })

    it('is one implementation, reached by both browse routes', () => {
        for (const file of ['pages/AllProducts.jsx', 'pages/Collections.jsx']) {
            const source = sourceOf(file)
            expect(source, file).toMatch(/from ['"]\.\.\/components\/catalog\/CatalogPage['"]/)
            // Neither page holds a filter sidebar, a sort control or a grid of
            // its own any more. Two of each is how they drifted apart.
            expect(source, `${file}: own grid`).not.toMatch(/grid-cols-/)
            expect(source, `${file}: own checkbox`).not.toMatch(/type="checkbox"/)
        }
    })
})

// ---------------------------------------------------------------------------
describe('the redesign kept the behaviour it inherited', () => {
    it('offers the real taxonomy, and nothing invented', async () => {
        setCatalog([MOUSE, LAPTOP])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')

        expect(screen.getByLabelText('Laptops')).toBeInTheDocument()
        expect(screen.getByLabelText('Accessories')).toBeInTheDocument()
        // Four of the forty names `addMissingCategories` used to inject.
        for (const invented of ['Networking', 'Clearance', 'Webcam', 'Router']) {
            expect(screen.queryByLabelText(invented), invented).toBeNull()
        }
    })

    it('narrows the grid from a tag chip, and says so in the URL', async () => {
        setCatalog([MOUSE, LAPTOP])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')
        fireEvent.click(screen.getByLabelText('Accessories'))

        // Filters were component state, so a filtered view could not be linked,
        // reloaded, or reached with the back button.
        await waitFor(() => {
            expect(screen.queryByText('Expensive Laptop')).not.toBeInTheDocument()
        })
        expect(screen.getByText('Affordable Mouse')).toBeInTheDocument()
        expect(screen.getByTestId('query').textContent).toContain('tags=Accessories')
    })

    it('derives the price ceiling from the catalog, inside the Refine drawer', async () => {
        setCatalog([MOUSE, LAPTOP])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')
        fireEvent.click(screen.getByRole('button', { name: /refine/i }))

        // $2,500 rounds up to $3,000. The literal 1000 this replaces was written
        // into the state, the `max` attribute and the track's arithmetic alike.
        const sliders = screen.getAllByRole('slider')
        expect(sliders).toHaveLength(2)
        for (const slider of sliders) expect(slider).toHaveAttribute('max', '3000')
    })

    it('is a dialog, with the focus behaviour A11Y-002 exists to guarantee', async () => {
        const user = userEvent.setup()
        setCatalog([MOUSE, LAPTOP])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')
        const opener = screen.getByRole('button', { name: /refine/i })
        // `userEvent`, not `fireEvent`: focus restore can only put focus back
        // where it came from, and a synthetic click never moves it there.
        await user.click(opener)

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toContainElement(document.activeElement)

        fireEvent.keyDown(document, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(document.activeElement).toBe(opener)
    })

    it('still distinguishes a request that failed from a catalog that is empty', async () => {
        setCatalog([MOUSE])
        renderCollections('all')

        // FE-012 — "no products found" is a claim about the catalog, and while
        // the request is in flight the page has no basis for making it.
        expect(screen.queryByText(/no products found/i)).not.toBeInTheDocument()
        expect(screen.getByRole('status')).toBeInTheDocument()

        await waitFor(() => expect(screen.getByText('Affordable Mouse')).toBeInTheDocument())
    })

    it('keeps the search entry point /products is linked to', async () => {
        setCatalog([MOUSE, LAPTOP])
        renderAllProducts('?search=Mouse')

        expect(await screen.findByText('Affordable Mouse')).toBeInTheDocument()
        await waitFor(() => {
            expect(screen.queryByText('Expensive Laptop')).not.toBeInTheDocument()
        })
    })
})
