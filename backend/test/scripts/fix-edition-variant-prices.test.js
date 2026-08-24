// Pure safety and pricing-plan tests for the one-off Edition updater.
// Importing the script performs no I/O and never connects to MongoDB.

import { describe, expect, it } from 'vitest'

import {
    assertCatalogTarget,
    diffFor,
    PLAN,
    UnsafeCatalogTargetError,
} from '../../fix_edition_variant_prices.js'

const product = ({ name, price, priceMinor, options, entries }) => ({
    name,
    price,
    priceMinor,
    variants: [{ name: 'Edition', options }],
    inventoryV2: entries.map(({ option, quantity, delta = 0 }) => ({
        variantId: `Edition=${option}`,
        options: { Edition: option },
        quantity,
        priceDelta: delta,
        priceMinorDelta: Math.round(delta * 100),
    })),
})

describe('Edition price updater target guard', () => {
    it('accepts only the named Atlas database', () => {
        expect(() => assertCatalogTarget(
            'mongodb+srv://user:password@cluster.example.mongodb.net/e-commerce',
        )).not.toThrow()
    })

    it.each([
        'mongodb://127.0.0.1:27017/e-commerce',
        'mongodb+srv://attacker.example.com/e-commerce',
        'mongodb+srv://cluster.example.mongodb.net/other-db',
    ])('refuses unsafe target %s', (uri) => {
        expect(() => assertCatalogTarget(uri)).toThrow(UnsafeCatalogTargetError)
    })
})

describe('Edition price updater plan', () => {
    it('prices the Razer Standard and Pro editions without touching quantity', () => {
        const intent = PLAN.find(({ name }) => name === 'Razer Cobra Gaming Mouse')
        const before = product({
            name: intent.name,
            price: 39.99,
            priceMinor: 3999,
            options: ['Standard', 'Pro (Wireless)'],
            entries: [
                { option: 'Standard', quantity: 18 },
                { option: 'Pro (Wireless)', quantity: 7 },
            ],
        })

        const diff = diffFor(before, intent)
        expect(diff.changedRows.map(({ label, toDelta, entry }) => [label, toDelta, entry.quantity]))
            .toEqual([
                ['Pro (Wireless)', 90, 7],
            ])
    })

    it('uses Digital as the PS5 base and keeps Disc at its existing final price', () => {
        const intent = PLAN.find(({ name }) => name === 'PlayStation 5 (PS5) Slim Console')
        const before = product({
            name: intent.name,
            price: 499.99,
            priceMinor: 49999,
            options: ['Standard (Disc)', 'Digital'],
            entries: [
                { option: 'Standard (Disc)', quantity: 25 },
                { option: 'Digital', quantity: 12 },
            ],
        })

        const diff = diffFor(before, intent)
        expect(intent.price).toBe(449.99)
        expect(intent.price + intent.deltas.Digital).toBe(449.99)
        expect(intent.price + intent.deltas['Standard (Disc)']).toBe(499.99)
        expect(diff.priceChanges).toBe(true)
    })

    it('is settled when all major/minor values already match', () => {
        const intent = PLAN[0]
        const settled = product({
            name: intent.name,
            price: intent.price,
            priceMinor: Math.round(intent.price * 100),
            options: ['Standard', 'Pro (Wireless)'],
            entries: [
                { option: 'Standard', quantity: 18, delta: 0 },
                { option: 'Pro (Wireless)', quantity: 7, delta: 90 },
            ],
        })

        expect(diffFor(settled, intent).settled).toBe(true)
    })
})
