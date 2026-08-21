// PHASE 3 — one ProductCard (FE-007, TEST-005).
//
// Roadmap task 3.7, frontend plan F-6.
//
// There were four implementations. `AllProducts`' was the good one — real
// mouse-position image scrubbing across the product's own photographs, touch
// swipe, tag badges. `Collections`' fabricated three images by repeating
// `image[0]` and read `product.vendor`, a field the schema has never had.
// `FeaturedProducts` had a third copy inline, and `ProductItem` put `alt=""` on
// a product photograph. A fix to image handling had to be made four times.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import ShopContextProvider from '../../context/ShopContext.jsx'
import ProductCard from '../../components/ProductCard.jsx'
// TEST-002 — these two pure helpers moved to `src/lib/productSummary.js` so
// `ProductCard.jsx` exports only components (react-refresh). Same functions,
// same behaviour, same assertions.
import { defaultVariantSelection, isSoldOut } from '../../lib/productSummary.js'
import { deriveInventoryV2 } from '../../lib/variant.js'

// A variant-less product still has exactly one purchasable combination, keyed
// by the empty string, so the default fixture gives it stock (DB-003).
const product = ({ variants = [], inventory = { '': 5 }, ...overrides } = {}) => ({
    _id: '5eed00000000000000000001',
    name: 'MacBook Pro 16" M4 Pro',
    brand: 'Apple',
    description: 'A 16-inch laptop.',
    price: 2499,
    priceMinor: 249900,
    image: ['data:image/svg+xml;base64,AAA', 'data:image/svg+xml;base64,BBB'],
    tags: ['MacBooks', 'Laptops'],
    variants,
    inventoryV2: deriveInventoryV2(variants, inventory).entries,
    date: 1785585600000,
    ...overrides,
})

const renderCard = (props) => render(
    <MemoryRouter>
        <ShopContextProvider><ProductCard {...props} /></ShopContextProvider>
    </MemoryRouter>,
)

describe('every presentation mode renders the fields its callers rendered', () => {
    it.each(['full', 'showcase', 'minimal'])('%s shows the name and the price', (variant) => {
        renderCard({ product: product(), variant })
        expect(screen.getByText('MacBook Pro 16" M4 Pro')).toBeInTheDocument()
        // Formatted through Intl, never by concatenation (DB-004 / FE-018).
        expect(screen.getByText('$2,499.00')).toBeInTheDocument()
    })

    it.each(['full', 'showcase'])('%s shows the brand', (variant) => {
        renderCard({ product: product(), variant })
        expect(screen.getByText('Apple')).toBeInTheDocument()
    })

    it('full shows the tag badges and the description', () => {
        renderCard({ product: product(), variant: 'full' })
        expect(screen.getByText('MacBooks')).toBeInTheDocument()
        expect(screen.getByText('A 16-inch laptop.')).toBeInTheDocument()
    })

    it('showcase renders the quick-add button only when asked', () => {
        const { unmount } = renderCard({ product: product(), variant: 'showcase' })
        expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull()
        unmount()

        renderCard({ product: product(), variant: 'showcase', showQuickAdd: true })
        expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument()
    })
})

describe('navigation is real, and reachable by keyboard', () => {
    it.each(['full', 'showcase', 'minimal'])('%s links to the product page', (variant) => {
        renderCard({ product: product(), variant })
        const link = screen.getAllByRole('link')[0]
        expect(link).toHaveAttribute('href', '/product/5eed00000000000000000001')
    })

    it('the root is a link, not a clickable div', () => {
        // Three of the four cards were `<motion.div onClick={...}>`, which no
        // keyboard user can reach and no screen reader announces as a target.
        renderCard({ product: product(), variant: 'showcase' })
        expect(screen.getAllByRole('link')[0].tagName).toBe('A')
    })
})

describe('images', () => {
    it('falls back to a placeholder rather than rendering a broken image', () => {
        renderCard({ product: product({ image: [] }), variant: 'full' })
        const image = screen.getByAltText('MacBook Pro 16" M4 Pro')
        // PERF-009 — the placeholder used to be a `placehold.co` URL, so the
        // fallback for "this image could not be fetched" was itself a fetch,
        // from a third-party host. It is an inline SVG data URI now.
        const src = image.getAttribute('src')
        expect(src).toMatch(/^data:image\/svg\+xml/)
        expect(decodeURIComponent(src)).toMatch(/No image/)
    })

    it('gives the image a meaningful alt, not an empty one', () => {
        // `ProductItem.jsx:10` used `alt=""` on a product photograph.
        renderCard({ product: product(), variant: 'minimal' })
        expect(screen.getByAltText('MacBook Pro 16" M4 Pro')).toBeInTheDocument()
    })

    it('shows one dot per real image, never a repeated one', () => {
        // `Collections` built `[image[0], image[0], image[0]]` so its dot row
        // always had three dots, promising two photographs that do not exist.
        renderCard({ product: product({ image: ['only-one'] }), variant: 'showcase' })
        expect(screen.queryByRole('button', { name: /show image/i })).toBeNull()

        renderCard({ product: product(), variant: 'showcase' })
        expect(screen.getAllByRole('button', { name: /show image/i })).toHaveLength(2)
    })

    it('scrubs through the images with the pointer, and restores on leave', () => {
        const { container } = renderCard({ product: product(), variant: 'full' })
        const frame = container.querySelector('.aspect-square')
        const image = screen.getByAltText('MacBook Pro 16" M4 Pro')

        frame.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 200 })
        expect(image.getAttribute('src')).toBe('data:image/svg+xml;base64,AAA')

        fireEvent.mouseMove(frame, { clientX: 150 })
        expect(screen.getByAltText('MacBook Pro 16" M4 Pro').getAttribute('src'))
            .toBe('data:image/svg+xml;base64,BBB')

        fireEvent.mouseLeave(frame)
        expect(screen.getByAltText('MacBook Pro 16" M4 Pro').getAttribute('src'))
            .toBe('data:image/svg+xml;base64,AAA')
    })

    it('advances on a touch swipe', () => {
        const { container } = renderCard({ product: product(), variant: 'full' })
        const frame = container.querySelector('.aspect-square')

        fireEvent.touchStart(frame, { touches: [{ clientX: 100 }] })
        fireEvent.touchMove(frame, { touches: [{ clientX: 40 }] })

        expect(screen.getByAltText('MacBook Pro 16" M4 Pro').getAttribute('src'))
            .toBe('data:image/svg+xml;base64,BBB')
    })
})

describe('the default combination comes from the typed inventory (DB-003)', () => {
    it('prefers a combination that has stock', () => {
        const laptop = product({
            variants: [{ name: 'Size', options: ['14-inch', '16-inch'] }],
            inventory: { '14-inch': 0, '16-inch': 3 },
        })
        expect(defaultVariantSelection(laptop)).toEqual({ variantOptions: { Size: '16-inch' } })
    })

    it('never joins option values into a key that cannot be split apart', () => {
        // Every card built this as `variants.map(v => v.options[0]).join('-')`,
        // which for a 16-inch/1TB laptop produced "16-inch-1TB" — a string the
        // server cannot decode back into its two option values.
        const laptop = product({
            variants: [
                { name: 'Size', options: ['16-inch'] },
                { name: 'Storage', options: ['1TB'] },
            ],
            inventory: { '16-inch-1TB': 2 },
        })
        const entry = laptop.inventoryV2[0]
        expect(defaultVariantSelection(laptop)).toEqual({ variantOptions: entry.options })
        expect(entry.options).toEqual({ Size: '16-inch', Storage: '1TB' })
    })

    it('a variant-less product uses its single empty-string combination', () => {
        // `legacyKey` is '' for the one combination such a product has, and the
        // card sends the empty option set; no legacy sentinel is invented.
        expect(defaultVariantSelection(product())).toEqual({ variantOptions: {} })
        expect(defaultVariantSelection({ inventoryV2: [] })).toEqual({ variantOptions: {} })
    })
})

describe('sold out is derived, not guessed', () => {
    it('is sold out only when every combination is at zero', () => {
        const none = product({
            variants: [{ name: 'Size', options: ['S', 'M'] }],
            inventory: { S: 0, M: 0 },
        })
        const some = product({
            variants: [{ name: 'Size', options: ['S', 'M'] }],
            inventory: { S: 0, M: 4 },
        })
        expect(isSoldOut(none)).toBe(true)
        expect(isSoldOut(some)).toBe(false)
    })

    it('a variant-less product with stock is not sold out', () => {
        expect(isSoldOut(product())).toBe(false)
    })

    it('a product whose matrix is genuinely absent is not sold out either', () => {
        // "No inventory recorded" is not "none available". Reading the two as
        // the same is how `isOutOfStock` used to fail *open* on a hyphenated
        // option and offer an unavailable combination for sale (DB-003).
        expect(isSoldOut({ inventoryV2: [] })).toBe(false)
        expect(isSoldOut({})).toBe(false)
    })

    it('disables the quick-add button for a sold-out product', () => {
        const none = product({
            variants: [{ name: 'Size', options: ['S'] }],
            inventory: { S: 0 },
        })
        renderCard({ product: none, variant: 'showcase', showQuickAdd: true })
        expect(screen.getByRole('button', { name: /sold out/i })).toBeDisabled()
    })
})

describe('there is exactly one card implementation left (FE-007)', () => {
    it('the superseded components are gone', () => {
        const components = readdirSync(join(process.cwd(), 'src/components'))
        expect(components).not.toContain('ProductItem.jsx')
        expect(components).not.toContain('featuredCollection.jsx')
    })

    it('every tiled surface renders the shared component', () => {
        for (const file of [
            'pages/AllProducts.jsx',
            'pages/Collections.jsx',
            'components/FeaturedProducts.jsx',
            'components/RelatedProducts.jsx',
        ]) {
            const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')
            expect(source, file).toMatch(/from ['"].*ProductCard['"]/)
            // …and none of them still declares one of its own.
            expect(source, file).not.toMatch(/^const ProductCard = /m)
        }
    })

    it('no file outside ProductCard.jsx declares a component by that name', () => {
        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                if (entry === 'test') continue
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) { walk(full); continue }
                if (!/\.jsx$/.test(entry) || entry === 'ProductCard.jsx') continue
                if (/^const ProductCard = /m.test(readFileSync(full, 'utf8'))) offenders.push(entry)
            }
        }
        walk(join(process.cwd(), 'src'))
        expect(offenders).toEqual([])
    })

    it('references no field the schema does not define', () => {
        const source = readFileSync(join(process.cwd(), 'src/components/ProductCard.jsx'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1')
        // `Collections.ProductCard` read `product.vendor`, which has never existed.
        expect(source).not.toMatch(/\bproduct\.vendor\b/)
        expect(source).not.toMatch(/\bproduct\.rating\b/)
    })
})
