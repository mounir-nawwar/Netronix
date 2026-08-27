import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

import { listProducts, updateProduct } from '../../lib/productRequests.js'
import { makeProduct, setCatalog, VALID_ADMIN_TOKEN } from '../msw/handlers.js'

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

// ---------------------------------------------------------------------------
// ADM-003 / DB-007 — the archived view is admin-only, and the console has to
// ask as an admin.
//
// `/api/product/list` is a public endpoint, but the route guards
// `includeArchived` behind `adminAuthForArchivedQuery`, which runs the full
// `adminAuth` the moment the parameter is truthy. `listProducts` was the only
// request in `productRequests.js` that never sent a token — every other one
// takes it and sets the `token` header — so ticking "Show archived" issued an
// anonymous request for an admin-only view.
//
// It failed silently in the worst possible place: the console archives a
// product, the product leaves the default list, and the archived list that is
// supposed to hold it comes back 401 and renders "No archived products". The
// product is still there, and there is no longer any way to reach it. The
// browser suite caught it; the unit suite did not, because the MSW handler
// modelled the filter without modelling the guard.
describe('listProducts and the archived view (ADM-003)', () => {
    it('sends the admin token, so the archived list is actually returned', async () => {
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000001', name: 'Live Product' }),
            makeProduct({ _id: '5eed00000000000000000002', name: 'Archived Product', archived: true }),
        ])

        const products = await listProducts({ includeArchived: true, token: VALID_ADMIN_TOKEN })
        expect(products.map((product) => product.name)).toContain('Archived Product')
    })

    it('fails loudly rather than reporting an empty archive when the token is missing', async () => {
        setCatalog([makeProduct({ _id: '5eed00000000000000000002', name: 'Archived Product', archived: true })])

        // The point is that this *throws*. An empty array here would be the
        // console telling an administrator their archived product does not
        // exist.
        await expect(listProducts({ includeArchived: true })).rejects.toThrow()
    })

    it('still needs no token for the ordinary listing', async () => {
        setCatalog([makeProduct({ _id: '5eed00000000000000000001', name: 'Live Product' })])

        const products = await listProducts()
        expect(products.map((product) => product.name)).toEqual(['Live Product'])
    })
})
