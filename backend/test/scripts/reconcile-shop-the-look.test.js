import { describe, expect, it } from 'vitest'
import { IDS, PRODUCT_PLAN, assertTarget, validatePlan, withoutShopSlot } from '../../reconcile_shop_the_look.js'

describe('Professional Workspace catalog plan', () => {
    it('maps the four hotspot positions to the exact intended products', () => {
        expect(Object.values(PRODUCT_PLAN).map((product) => ({
            name: product.name,
            order: product.showcase.find(({ slot }) => slot === 'shop-the-look').order,
        }))).toEqual([
            { name: 'ASUS ROG Strix XG27AQ Gaming Monitor', order: 0 },
            { name: 'Apple MacBook Pro 14-inch (M4)', order: 1 },
            { name: 'Logitech G PRO X Wireless Gaming Headset', order: 2 },
            { name: 'Logitech MX Keys Mini Wireless Keyboard', order: 3 },
        ])
        expect(validatePlan()).toBe(true)
    })

    it('uses the existing MacBook id and stable new ids for the other three products', () => {
        expect(IDS.macbook).toBe('6a89ab116111a5cf6e199bf6')
        expect(new Set(Object.values(IDS)).size).toBe(4)
    })

    it('stores real keyboard color SKUs at one list price', () => {
        const keyboard = PRODUCT_PLAN.keyboard
        expect(keyboard.price).toBe(99.99)
        expect(keyboard.variants).toEqual([{ name: 'Color', options: ['Graphite', 'Pale Gray', 'Rose', 'Black'] }])
        expect(keyboard.inventoryV2.map(({ sku }) => sku)).toEqual([
            '920-010388', '920-010473', '920-010474', '920-010475',
        ])
        expect(keyboard.inventoryV2.every(({ priceDelta }) => priceDelta === 0)).toBe(true)
    })

    it('does not invent variants for exact single-SKU products', () => {
        expect(PRODUCT_PLAN.monitor.variants).toEqual([])
        expect(PRODUCT_PLAN.monitor.inventoryV2[0].sku).toBe('XG27AQ')
        expect(PRODUCT_PLAN.headset.variants).toEqual([])
        expect(PRODUCT_PLAN.headset.inventoryV2[0].sku).toBe('981-000906')
    })

    it('removes only the workspace assignment from displaced products', () => {
        const original = [
            { slot: 'featured', order: 10 },
            { slot: 'shop-the-look', order: 0 },
            { slot: 'featured-product', order: 0 },
        ]
        expect(withoutShopSlot(original)).toEqual([
            { slot: 'featured', order: 10 },
            { slot: 'featured-product', order: 0 },
        ])
        expect(original).toHaveLength(3)
    })

    it('refuses any database except the named Atlas catalog', () => {
        expect(() => assertTarget('mongodb+srv://user:secret@cluster.example.mongodb.net/e-commerce')).not.toThrow()
        expect(() => assertTarget('mongodb://127.0.0.1:27017/e-commerce')).toThrow()
        expect(() => assertTarget('mongodb+srv://cluster.example.mongodb.net/other')).toThrow()
    })

    it('rejects an incomplete hotspot order', () => {
        const bad = structuredClone(PRODUCT_PLAN)
        bad.keyboard.showcase.find(({ slot }) => slot === 'shop-the-look').order = 2
        expect(() => validatePlan(bad)).toThrow(/orders/)
    })
})
