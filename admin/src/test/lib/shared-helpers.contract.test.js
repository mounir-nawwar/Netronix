// CONTRACT — the shared money and variant helpers must not drift (DB-003, DB-004).
//
// `src/lib/money.js` and `src/lib/variant.js` are verbatim copies of
// `backend/lib/*`. There is no shared package (ARCH-004) and building one is
// Phase 3's work, so the guarantee has to come from a test.
//
// Two halves, and both matter:
//
//   1. **The source is identical.** Everything below the mirror header is
//      compared byte for byte with the backend's file. A silent edit to one copy
//      fails here rather than surfacing as a total that disagrees with the
//      server's.
//   2. **The behaviour is identical.** The same table of values the backend
//      suite runs is run again here. If the mirror check were ever relaxed, this
//      would still catch a behavioural divergence.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
    toMinor, toMajor, sumMinor, multiplyMinor, readMinor, formatMoney, isMinorAmount,
    DEFAULT_CURRENCY,
} from '../../lib/money.js'
import {
    canonicalVariantId, parseVariantId, legacyVariantKey, variantLabel, buildCombinations,
    deriveInventoryV2, resolveVariant, sameVariant, entriesOf, VariantResolutionError,
    IMPLICIT_AXIS_NAME,
} from '../../lib/variant.js'

const here = dirname(fileURLToPath(import.meta.url))
const BACKEND_LIB = resolve(here, '../../../../backend/lib')

/** Everything after the mirror header, which is the only permitted difference. */
const bodyOf = (source) => {
    const marker = '// ---------------------------------------------------------------------------\n'
    const index = source.lastIndexOf(marker)
    return index === -1 ? source : source.slice(index + marker.length)
}

describe('the mirrored helpers are byte-identical to the backend originals', () => {
    it.each(['money.js', 'variant.js', 'showcase.js'])('%s matches backend/lib', (file) => {
        const mine = readFileSync(resolve(here, '../../lib', file), 'utf8')
        const theirs = readFileSync(resolve(BACKEND_LIB, file), 'utf8')
        expect(bodyOf(mine)).toBe(theirs)
    })
})

describe('DB-004 — money is exact integer minor units', () => {
    it.each([
        [19.99, 1999],
        [0.01, 1],
        [1299.99, 129999],
        [0, 0],
        [2499, 249900],
        [0.1 + 0.2, 30],
    ])('converts %s to %s', (major, minor) => {
        expect(toMinor(major)).toBe(minor)
        expect(toMajor(minor)).toBeCloseTo(Number(major.toFixed(2)), 10)
    })

    it('adds a multi-line cart with no float drift', () => {
        // 0.1 + 0.2 in floats is 0.30000000000000004. Three lines of 19.99 plus
        // two of 1299.99 is the kind of sum the storefront accumulated in a
        // browser and then persisted verbatim.
        const total = sumMinor(multiplyMinor(1999, 3), multiplyMinor(129999, 2))
        expect(total).toBe(265995)
        expect(toMajor(total)).toBe(2659.95)

        const drifted = [0.1, 0.2, 0.3].reduce((sum, value) => sum + value, 0)
        expect(drifted).not.toBe(0.6)
        expect(sumMinor(toMinor(0.1), toMinor(0.2), toMinor(0.3))).toBe(60)
    })

    it('refuses a value it cannot represent rather than writing 0 or NaN', () => {
        expect(() => toMinor(Number.NaN)).toThrow()
        expect(() => toMinor(Infinity)).toThrow()
        expect(() => toMinor(-1)).toThrow()
        expect(isMinorAmount(19.99)).toBe(false)
        expect(isMinorAmount(1999)).toBe(true)
    })

    it('dual-reads a record in either representation', () => {
        expect(readMinor({ priceMinor: 1999, price: 19.99 }, 'priceMinor', 'price')).toBe(1999)
        // A record written before the migration has only the major-unit field.
        expect(readMinor({ price: 19.99 }, 'priceMinor', 'price')).toBe(1999)
        expect(readMinor({}, 'priceMinor', 'price')).toBeNull()
    })

    it('formats through Intl.NumberFormat, never string concatenation (FE-018)', () => {
        // The defect this replaces rendered `{currency} {getCartAmount()}.00`,
        // which produced "$1299.99.00".
        expect(formatMoney(129999)).toBe('$1,299.99')
        expect(formatMoney(1999)).toBe('$19.99')
        expect(formatMoney(0)).toBe('$0.00')
        expect(formatMoney(1)).toBe('$0.01')
        expect(formatMoney(129999)).not.toMatch(/\.00$/)
        expect(DEFAULT_CURRENCY).toBe('USD')
    })
})

describe('DB-003 — variant identity is lossless in both directions', () => {
    const twoAxis = [
        { name: 'Size', options: ['14-inch', '16-inch'] },
        { name: 'Storage', options: ['512GB', '1TB'] },
    ]

    it.each([
        ['one axis', [{ name: 'Colour', options: ['Black'] }], { Colour: 'Black' }, 'Black'],
        ['two axes', twoAxis, { Size: '16-inch', Storage: '1TB' }, '16-inch-1TB'],
        ['three axes', [
            { name: 'Switch', options: ['Gateron-Red'] },
            { name: 'Layout', options: ['ANSI'] },
            { name: 'Finish', options: ['Black'] },
        ], { Switch: 'Gateron-Red', Layout: 'ANSI', Finish: 'Black' }, 'Gateron-Red-ANSI-Black'],
        ['a hyphenated GPU', [{ name: 'GPU', options: ['RTX-4090'] }, { name: 'RAM', options: ['32GB'] }],
            { GPU: 'RTX-4090', RAM: '32GB' }, 'RTX-4090-32GB'],
        ['no axes at all', [], {}, ''],
    ])('round-trips %s', (_label, variants, options, legacyKey) => {
        const id = canonicalVariantId(options)
        // Forward: the identity produces the legacy key the old encoder made.
        expect(legacyVariantKey(variants, options)).toBe(legacyKey)
        // Backward: the identity recovers the option values. `split('-')` cannot.
        expect(parseVariantId(id)).toEqual(options)
        expect(sameVariant(parseVariantId(id), options)).toBe(true)
    })

    it('gives "16-inch" and "RTX-4090" distinct identities from their look-alikes', () => {
        // The collision at the heart of DB-003: both join to "16-inch-1TB".
        expect(legacyVariantKey(twoAxis, { Size: '16-inch', Storage: '1TB' }))
            .toBe(legacyVariantKey(
                [{ name: 'Size', options: ['16'] }, { name: 'Storage', options: ['inch-1TB'] }],
                { Size: '16', Storage: 'inch-1TB' },
            ))
        // The canonical identities do not collide, which is the whole point.
        expect(canonicalVariantId({ Size: '16-inch', Storage: '1TB' }))
            .not.toBe(canonicalVariantId({ Size: '16', Storage: 'inch-1TB' }))
    })

    it('is order-independent, so a differently-ordered selection is the same combination', () => {
        expect(canonicalVariantId({ Storage: '1TB', Size: '16-inch' }))
            .toBe(canonicalVariantId({ Size: '16-inch', Storage: '1TB' }))
    })

    it('escapes its own separators, so no option value can forge an identity', () => {
        const hostile = { 'A;x': 'b=c\\d' }
        expect(parseVariantId(canonicalVariantId(hostile))).toEqual(hostile)
    })

    it('labels a combination in declaration order', () => {
        expect(variantLabel(twoAxis, { Size: '16-inch', Storage: '1TB' }))
            .toBe('Size: 16-inch, Storage: 1TB')
        expect(variantLabel([], {})).toBe('')
        expect(variantLabel([], { [IMPLICIT_AXIS_NAME]: 'Black' })).toBe('Black')
    })

    it('builds every combination a definition generates', () => {
        expect(buildCombinations(twoAxis)).toHaveLength(4)
        expect(buildCombinations([])).toEqual([{}])
    })

    it('derives V2 from a legacy bag and reports ambiguity instead of guessing', () => {
        const clean = deriveInventoryV2(twoAxis, { '16-inch-1TB': 1, '14-inch-512GB': 4 })
        expect(clean.ambiguousKeys).toEqual([])
        expect(clean.entries.find((entry) => entry.legacyKey === '16-inch-1TB').quantity).toBe(1)

        const ambiguous = deriveInventoryV2(
            [{ name: 'A', options: ['16-inch', '16'] }, { name: 'B', options: ['1TB', 'inch-1TB'] }],
            { '16-inch-1TB': 9 },
        )
        expect(ambiguous.ambiguousKeys).toEqual(['16-inch-1TB'])
        for (const entry of ambiguous.entries.filter((e) => e.legacyKey === '16-inch-1TB')) {
            expect(entry.needsReview).toBe(true)
            expect(entry.quantity).toBe(0)
        }
    })

    it('resolves against a product and fails CLOSED on anything it cannot identify', () => {
        // `Product.isOutOfStock` used to compare segment counts and return
        // false — "in stock" — whenever they disagreed, which a hyphenated
        // option guaranteed. Every failure below is a throw.
        const product = {
            variants: twoAxis,
            inventoryV2: deriveInventoryV2(twoAxis, { '16-inch-1TB': 1 }).entries,
        }

        expect(resolveVariant(product, { variantOptions: { Size: '16-inch', Storage: '1TB' } }).quantity).toBe(1)
        expect(resolveVariant(product, { variantKey: '16-inch-1TB' }).quantity).toBe(1)
        expect(resolveVariant(product, { variantId: 'Size=16-inch;Storage=1TB' }).quantity).toBe(1)

        expect(() => resolveVariant(product, { variantKey: 'nonsense' })).toThrow(VariantResolutionError)
        expect(() => resolveVariant(product, { variantOptions: { Size: 'Nope' } })).toThrow(VariantResolutionError)
        expect(() => resolveVariant(product, {})).toThrow(VariantResolutionError)
        expect(() => resolveVariant({ inventoryV2: [] }, { variantKey: '' })).toThrow(VariantResolutionError)
    })

    it('refuses an ambiguous legacy key rather than picking one', () => {
        const variants = [{ name: 'A', options: ['16-inch', '16'] }, { name: 'B', options: ['1TB', 'inch-1TB'] }]
        const product = { variants, inventoryV2: deriveInventoryV2(variants, {}).entries }
        expect(() => resolveVariant(product, { variantKey: '16-inch-1TB' }))
            .toThrow(/ambiguous/i)
    })

    it('reads a product served by the API, whose entries arrive as plain objects', () => {
        const served = {
            variants: twoAxis,
            inventoryV2: [{ variantId: 'Size=16-inch;Storage=1TB', legacyKey: '16-inch-1TB', options: { Size: '16-inch', Storage: '1TB' }, quantity: 3 }],
        }
        expect(entriesOf(served)[0].options).toEqual({ Size: '16-inch', Storage: '1TB' })
        expect(entriesOf({}).length).toBe(0)
    })
})
