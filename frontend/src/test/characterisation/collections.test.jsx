// CHARACTERISATION — the Collections page filters.
//
// Manifest flow: 11 (Collections shows expensive products, FE-003).
// Target-state assertions: src/test/target-state/frontend.target.test.jsx.
//
// FLIPPED IN PHASE 3, roadmap tasks 3.4 and 3.5.
//
// Phase 0 recorded four defects on one page, and all four are fixed:
//
//   * the price ceiling was the literal 1000, written into the state, into the
//     slider's `max` and into the percentage arithmetic — so `/collections/all`,
//     which is where the empty cart's own call to action points, hid every
//     product over $1,000 in a catalog whose laptops start at $1,149;
//   * the type filter read `item.category`, a field the schema has never had, so
//     every typed collection route rendered empty;
//   * the sidebar's checkbox list was derived from the same field, so it was
//     always empty too;
//   * "newest" sorted on `item.createdAt`, also absent, so the comparison was
//     `new Date(0)` against `new Date(0)` and the sort did nothing.
//
// The filtering itself now lives in `src/lib/catalog.js` as pure functions, and
// `src/test/lib/catalog.test.js` covers it directly. These tests drive the page.

import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import Collections from '../../pages/Collections.jsx'
import { setCatalog, makeProduct } from '../msw/handlers.js'

const CHEAP = makeProduct({
    _id: '5eed00000000000000000101',
    name: 'Affordable Mouse',
    price: 129,
    tags: ['Accessories'],
    date: 1785585600000,
})

const MID = makeProduct({
    _id: '5eed00000000000000000104',
    name: 'Midrange Monitor',
    price: 500,
    tags: ['Accessories'],
    date: 1785585500000,
})

const EXPENSIVE = makeProduct({
    _id: '5eed00000000000000000102',
    name: 'Expensive Laptop',
    price: 2500,
    tags: ['Laptops'],
    date: 1785585700000,
})

const renderCollections = (type = 'all') =>
    render(
        <MemoryRouter initialEntries={[`/collections/${type}`]}>
            <ShopContextProvider>
                <Routes>
                    <Route path="/collections/:type" element={<Collections />} />
                </Routes>
            </ShopContextProvider>
        </MemoryRouter>,
    )

/**
 * Open the Refine drawer, where the price range and the variant axes live.
 *
 * They used to be a permanent 16rem sidebar on every viewport — a quarter of
 * the grid's width, spent on controls most visits never touch. Behind a button
 * is a presentation decision; what these tests are actually holding is that the
 * ceiling is derived from the catalog and the taxonomy is never invented, and
 * both of those are unchanged. The tag chips are still in the page itself, so
 * only the price assertions need this.
 */
const openRefine = () => fireEvent.click(screen.getByRole('button', { name: /refine/i }))

describe('flow 11 — the whole catalog reaches the grid (FE-003 — FIXED)', () => {
    it('shows a $50, a $500 and a $2,500 product at /collections/all', async () => {
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000105', name: 'Budget Cable', price: 50, tags: ['Accessories'] }),
            MID,
            EXPENSIVE,
        ])
        renderCollections('all')

        expect(await screen.findByText('Expensive Laptop')).toBeInTheDocument()
        expect(screen.getByText('Budget Cable')).toBeInTheDocument()
        expect(screen.getByText('Midrange Monitor')).toBeInTheDocument()
    })

    it('derives the price ceiling from the catalog, so the slider can reach the top', async () => {
        setCatalog([CHEAP, EXPENSIVE])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')
        openRefine()

        // $2,500 rounds up to $3,000; the ceiling is a property of the catalog,
        // not a constant. Both range inputs agree on it.
        const sliders = screen.getAllByRole('slider')
        expect(sliders).toHaveLength(2)
        for (const slider of sliders) expect(slider).toHaveAttribute('max', '3000')
    })

    it('a product priced exactly at the old $1,000 ceiling is still kept', async () => {
        setCatalog([makeProduct({ _id: '5eed00000000000000000103', name: 'Edge Case PC', price: 1000 })])
        renderCollections('all')
        expect(await screen.findByText('Edge Case PC')).toBeInTheDocument()
    })
})

describe('flow 11 — typed collections filter by tag (FE-003 — FIXED)', () => {
    it('shows only the products carrying the route\'s tag', async () => {
        setCatalog([CHEAP, EXPENSIVE])
        renderCollections('accessories')

        expect(await screen.findByText('Affordable Mouse')).toBeInTheDocument()
        expect(screen.queryByText('Expensive Laptop')).not.toBeInTheDocument()
    })

    it('matches a tag case-insensitively, because the route is lower-cased', async () => {
        // `/collections/laptops` has to find the `Laptops` tag. Comparing the
        // two verbatim is why every typed route rendered empty even after the
        // field name was right.
        setCatalog([CHEAP, EXPENSIVE])
        renderCollections('laptops')

        expect(await screen.findByText('Expensive Laptop')).toBeInTheDocument()
        expect(screen.queryByText('Affordable Mouse')).not.toBeInTheDocument()
    })

    it('offers the real taxonomy in the sidebar, and nothing invented (FE-010)', async () => {
        setCatalog([CHEAP, EXPENSIVE])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')

        // The two tags the fixtures carry.
        expect(screen.getByLabelText('Accessories')).toBeInTheDocument()
        expect(screen.getByLabelText('Laptops')).toBeInTheDocument()
        // None of the forty names `addMissingCategories` used to inject.
        for (const invented of ['Networking', 'Clearance', 'Webcam', 'Electronics', 'Router']) {
            expect(screen.queryByLabelText(invented), invented).toBeNull()
        }
    })
})

describe('flow 11 — sorting uses the field the schema has (FE-003 — FIXED)', () => {
    it('orders "newest" by the numeric date, descending', async () => {
        setCatalog([MID, CHEAP, EXPENSIVE])
        renderCollections('all')

        await screen.findByText('Expensive Laptop')

        // EXPENSIVE is the newest date, then CHEAP, then MID. Sorting on the
        // absent `createdAt` left the catalog in whatever order it arrived.
        // The sidebar draws level-3 headings of its own ("Filters", "Price
        // Range", "Categories"), so the product names are read off the cards.
        const names = screen.getAllByRole('link')
            .map((node) => node.getAttribute('aria-label'))
            .filter(Boolean)
        expect(names).toEqual(['Expensive Laptop', 'Affordable Mouse', 'Midrange Monitor'])
    })

    it('renders no reference to a field the schema does not define', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const source = readFileSync(join(process.cwd(), 'src/pages/Collections.jsx'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1')

        for (const field of ['createdAt', 'subCategory', 'vendor']) {
            expect(source, field).not.toMatch(new RegExp(`\\b${field}\\b`))
        }
        // `category` survives only as a *local* variable name for a tag, never
        // as a product field.
        expect(source).not.toMatch(/\b(item|product|p)\.category\b/)
    })
})

describe('flow 20 — Collections distinguishes loading from empty (FE-012)', () => {
    it('says nothing about emptiness while the catalog is still loading', async () => {
        setCatalog([CHEAP])
        renderCollections('all')

        // Before the request settles the page shows a status, never "No
        // products found" — which is a claim about the catalog, not about the
        // request.
        expect(screen.queryByText(/no products found/i)).not.toBeInTheDocument()
        expect(screen.getByRole('status')).toBeInTheDocument()

        await waitFor(() => expect(screen.getByText('Affordable Mouse')).toBeInTheDocument())
    })

    it('settles on an honest empty state for an empty catalog', async () => {
        setCatalog([])
        renderCollections('all')
        expect(await screen.findByText(/no products found/i)).toBeInTheDocument()
    })
})
