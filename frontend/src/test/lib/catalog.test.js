// PHASE 3 — the pure catalog filters (FE-003, FE-010).
//
// `Collections.jsx` was 653 lines with its filtering inlined in an effect, which
// is why four separate defects lived there unnoticed. These are the same rules,
// extracted, where they can be stated one at a time.

import { describe, it, expect } from 'vitest'

import {
    catalogPriceCeiling, filterProducts, hasTag, matchesSearch, priceOf, sortProducts, tagsOf,
} from '../../lib/catalog.js'

/**
 * A product fixture.
 *
 * `priceMinor` is *derived* from whatever `price` the caller passed rather than
 * defaulted alongside it — the two representations of the same amount must not
 * be independently settable in a fixture, or a test overriding one silently
 * keeps the other and asserts against a product that could not exist (DB-004).
 */
const product = ({ price = 100, ...overrides } = {}) => ({
    _id: '5eed00000000000000000001',
    name: 'Test Product',
    brand: 'Netronix',
    description: 'A description for searching.',
    price,
    priceMinor: Math.round(price * 100),
    tags: ['Accessories'],
    date: 1785585600000,
    ...overrides,
})

describe('hasTag — case-insensitive, because the route is lower-cased', () => {
    it.each([
        ['Gaming', 'gaming', true],
        ['Gaming', 'Gaming', true],
        ['Gaming', 'GAMING', true],
        ['Gaming PCs', 'gaming pcs', true],
        ['Gaming', 'laptops', false],
    ])('a %s product against "%s" is %s', (tag, wanted, expected) => {
        expect(hasTag(product({ tags: [tag] }), wanted)).toBe(expected)
    })

    it('an absent tag list matches nothing but does not throw', () => {
        expect(hasTag({}, 'gaming')).toBe(false)
        expect(hasTag(undefined, 'gaming')).toBe(false)
    })

    it('no tag at all means "no filter", so everything matches', () => {
        expect(hasTag(product(), undefined)).toBe(true)
    })
})

describe('priceOf — the exact figure, from either representation (DB-004)', () => {
    it('prefers the integer minor units', () => {
        expect(priceOf({ priceMinor: 129999, price: 1 })).toBe(1299.99)
    })

    it('dual-reads a document written before the migration', () => {
        expect(priceOf({ price: 19.99 })).toBe(19.99)
    })

    it('treats an unpriceable product as zero rather than NaN', () => {
        expect(priceOf({})).toBe(0)
        expect(priceOf({ price: 'lots' })).toBe(0)
    })
})

describe('catalogPriceCeiling — derived, never the literal 1000 (FE-003)', () => {
    it('reaches above a $2,500 product', () => {
        const ceiling = catalogPriceCeiling([product({ price: 2500 })])
        expect(ceiling).toBe(3000)
        expect(ceiling).toBeGreaterThan(2500)
    })

    it('rounds a small catalog to the nearest hundred', () => {
        expect(catalogPriceCeiling([product({ price: 129 })])).toBe(200)
    })

    it('falls back only when there is no catalog to derive from', () => {
        expect(catalogPriceCeiling([])).toBe(1000)
        expect(catalogPriceCeiling([], 500)).toBe(500)
        expect(catalogPriceCeiling(undefined)).toBe(1000)
    })

    it('a $12,000 workstation is reachable, which the hardcoded ceiling made impossible', () => {
        expect(catalogPriceCeiling([product({ price: 12000 })])).toBe(12000)
    })
})

describe('tagsOf — the real taxonomy, and nothing invented (FE-010)', () => {
    it('collects and sorts the tags the catalog actually carries', () => {
        expect(tagsOf([
            product({ tags: ['Laptops', 'Gaming'] }),
            product({ tags: ['Accessories', 'Gaming'] }),
        ])).toEqual(['Accessories', 'Gaming', 'Laptops'])
    })

    it('ignores blanks and non-strings rather than offering them as filters', () => {
        expect(tagsOf([product({ tags: ['Laptops', '', '   ', null, 42] })])).toEqual(['Laptops'])
    })

    it('an empty catalog offers no categories at all', () => {
        // `addMissingCategories` injected about forty names here — `Networking`,
        // `Clearance`, `Webcam` — none of which any product carried, so every
        // one of those checkboxes could only ever produce an empty page.
        expect(tagsOf([])).toEqual([])
    })
})

describe('filterProducts', () => {
    const cheap = product({ _id: 'a', name: 'Cheap', price: 50, tags: ['Accessories'] })
    const mid = product({ _id: 'b', name: 'Mid', price: 500, tags: ['Laptops'] })
    const dear = product({ _id: 'c', name: 'Dear', price: 2500, tags: ['Laptops'] })
    const catalog = [cheap, mid, dear]

    it('"all" is the whole catalog, including everything over $1,000', () => {
        const kept = filterProducts(catalog, { type: 'all', priceRange: [0, catalogPriceCeiling(catalog)] })
        expect(kept.map((p) => p.name)).toEqual(['Cheap', 'Mid', 'Dear'])
    })

    it('a typed collection keeps only its tag', () => {
        const kept = filterProducts(catalog, { type: 'laptops', priceRange: [0, 3000] })
        expect(kept.map((p) => p.name)).toEqual(['Mid', 'Dear'])
    })

    it('the price range is inclusive at both ends', () => {
        expect(filterProducts(catalog, { priceRange: [50, 500] }).map((p) => p.name))
            .toEqual(['Cheap', 'Mid'])
    })

    it('selected categories are a union, not an intersection', () => {
        expect(filterProducts(catalog, { priceRange: [0, 3000], tags: ['Accessories', 'Laptops'] }))
            .toHaveLength(3)
    })

    it('survives a null entry in the catalog', () => {
        expect(filterProducts([null, cheap], { priceRange: [0, 3000] })).toEqual([cheap])
    })
})

describe('sortProducts', () => {
    const older = product({ _id: 'a', name: 'Older', price: 300, date: 1000 })
    const newer = product({ _id: 'b', name: 'Newer', price: 100, date: 3000 })
    const middle = product({ _id: 'c', name: 'Middle', price: 200, date: 2000 })

    it('"newest" reads the schema\'s numeric date, descending (FE-003)', () => {
        // It sorted on `createdAt`, which no product has, so every comparison
        // was `new Date(0) - new Date(0)` and the order never changed.
        expect(sortProducts([older, newer, middle], 'newest').map((p) => p.name))
            .toEqual(['Newer', 'Middle', 'Older'])
    })

    it('breaks a date tie on _id, so the order is total and stable', () => {
        const a = product({ _id: 'aaa', name: 'A', date: 5 })
        const b = product({ _id: 'bbb', name: 'B', date: 5 })
        expect(sortProducts([b, a], 'newest').map((p) => p.name)).toEqual(['A', 'B'])
        expect(sortProducts([a, b], 'newest').map((p) => p.name)).toEqual(['A', 'B'])
    })

    it.each([
        ['price-low', ['Newer', 'Middle', 'Older']],
        ['price-high', ['Older', 'Middle', 'Newer']],
        ['name-asc', ['Middle', 'Newer', 'Older']],
        ['name-desc', ['Older', 'Newer', 'Middle']],
    ])('%s orders as expected', (order, expected) => {
        expect(sortProducts([older, newer, middle], order).map((p) => p.name)).toEqual(expected)
    })

    it('does not mutate its input', () => {
        const catalog = Object.freeze([older, newer])
        expect(() => sortProducts(catalog, 'price-low')).not.toThrow()
        expect(catalog[0].name).toBe('Older')
    })
})

describe('matchesSearch', () => {
    const laptop = product({ name: 'MacBook Pro 16 M4', brand: 'Apple', tags: ['MacBooks'] })

    it('an empty term matches everything', () => {
        expect(matchesSearch(laptop, '')).toBe(true)
        expect(matchesSearch(laptop, '   ')).toBe(true)
        expect(matchesSearch(laptop, undefined)).toBe(true)
    })

    it('a short term needs a substring of the name or the exact brand', () => {
        expect(matchesSearch(laptop, 'Ma')).toBe(true)
        expect(matchesSearch(laptop, 'Apple')).toBe(true)
        expect(matchesSearch(laptop, 'zz')).toBe(false)
    })

    it('a real term matches name, brand, description or an exact tag', () => {
        expect(matchesSearch(laptop, 'macbook')).toBe(true)
        expect(matchesSearch(laptop, 'apple')).toBe(true)
        expect(matchesSearch(laptop, 'macbooks')).toBe(true)
        expect(matchesSearch(laptop, 'searching')).toBe(true)
        expect(matchesSearch(laptop, 'refrigerator')).toBe(false)
    })
})
