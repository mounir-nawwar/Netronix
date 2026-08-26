import { describe, expect, it } from 'vitest'
import { assertCatalogTarget, diffFor, PLAN } from '../../reconcile_variant_prices.js'

const productFor = (intent, { price = intent.basePrice, offsets = {}, quantities = {} } = {}) => ({
    _id: intent._id,
    name: intent.name,
    price,
    priceMinor: Math.round(price * 100),
    variants: [{ name: intent.axis, options: Object.keys(intent.finals) }],
    inventoryV2: Object.keys(intent.finals).map((option) => {
        const final = intent.finals[option]
        const delta = final - intent.basePrice + (offsets[option] ?? 0)
        return {
            variantId: `${intent.axis}=${option}`,
            options: { [intent.axis]: option },
            quantity: quantities[option] ?? 7,
            priceDelta: delta,
            priceMinorDelta: Math.round(delta * 100),
        }
    }),
})

describe('reviewed catalog price plan', () => {
    it('covers all ten non-cosmetic products with reviewed final prices', () => {
        expect(PLAN).toHaveLength(10)
        expect(PLAN.find((p) => p.name === 'Razer Cobra Gaming Mouse').finals)
            .toEqual({ Standard: 39.99, 'Pro (Wireless)': 129.99 })
        expect(PLAN.find((p) => p.name === 'Apple MacBook M4').finals)
            .toEqual({ '512GB': 1599, '1TB': 1799, '2TB': 2199 })
        expect(PLAN.find((p) => p.name === 'Apple iPhone Charger').finals)
            .toEqual({ '20W USB-C': 19, '35W Dual USB-C': 59 })
    })

    it('accepts only the named Atlas catalog', () => {
        expect(() => assertCatalogTarget('mongodb+srv://user:***@cluster.example.mongodb.net/e-commerce')).not.toThrow()
        expect(() => assertCatalogTarget('mongodb://127.0.0.1:27017/e-commerce')).toThrow()
        expect(() => assertCatalogTarget('mongodb+srv://cluster.example.mongodb.net/other')).toThrow()
    })

    it('detects a wrong variant price while retaining quantity in the row', () => {
        const intent = PLAN.find((p) => p.name === 'MSI Cyborg Gaming Laptop')
        const product = productFor(intent, {
            offsets: { 'RTX 4060': 90 },
            quantities: { 'RTX 4050': 6, 'RTX 4060': 9 },
        })
        const diff = diffFor(product, intent)
        const changed = diff.rows.find((row) => row.option === 'RTX 4060')
        expect(diff.changed).toBe(true)
        expect(changed.finalPrice).toBe(1199)
        expect(changed.delta).toBe(200)
        expect(changed.entry.quantity).toBe(9)
    })

    it('treats equal audited AirPods MSRPs as settled rather than forcing a difference', () => {
        const intent = PLAN.find((p) => p.name === 'Apple AirPods Pro')
        expect(diffFor(productFor(intent), intent).changed).toBe(false)
        expect(new Set(Object.values(intent.finals))).toEqual(new Set([249]))
    })

    it('refuses an option set that changed under the updater', () => {
        const intent = PLAN[0]
        const product = productFor(intent)
        product.variants[0].options.push('Unknown')
        expect(() => diffFor(product, intent)).toThrow(/no longer match/)
    })
})
