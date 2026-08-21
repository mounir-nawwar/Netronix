import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

import { updateProduct } from '../../lib/productRequests.js'

describe('partial product request contract', () => {
    afterEach(() => vi.restoreAllMocks())

    it('omits inventory fields when an unrelated edit preserves unresolved legacy stock', async () => {
        const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { success: true } })

        await updateProduct('product-id', {
            name: 'Renamed safely',
            description: 'Unchanged',
            price: '10',
            brand: 'Netronix',
            bestSeller: false,
            tags: ['Laptops'],
            showcase: [],
            imageFiles: {},
            clearImages: [],
        }, 'admin-token')

        const formData = patch.mock.calls[0][1]
        expect([...formData.keys()]).not.toContain('variants')
        expect([...formData.keys()]).not.toContain('inventory')
        expect([...formData.keys()]).not.toContain('inventoryV2')
    })

    it('sends the explicit legacy inventory resolution in the actual PATCH request', async () => {
        const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { success: true } })

        await updateProduct('product-id', {
            name: 'Resolved', description: 'Resolved', price: '10', brand: 'Netronix',
            bestSeller: false, tags: ['Laptops'], showcase: [], imageFiles: {}, clearImages: [],
            variants: [{ name: 'Size', options: ['S'] }],
            inventory: { S: 3 },
            inventoryV2: [{ options: { Size: 'S' }, quantity: 3 }],
            inventoryResolution: 'resolve',
        }, 'admin-token')

        const [url, formData, config] = patch.mock.calls[0]
        expect(url).toMatch(/\/api\/product\/product-id$/)
        expect(formData.get('inventoryResolution')).toBe('resolve')
        expect(config.headers.token).toBe('admin-token')
    })
})
