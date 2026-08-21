// PHASE 0–2 PRE-COMMIT — the storefront must walk a bounded listing (BE-009).
//
// Phase 2 capped `/api/product/list` at 100 records and put `total`, `page` and
// `pages` in the envelope so a client could tell there was more. The storefront
// issued one request and rendered `items`, so a catalog of 150 products was a
// catalog of 100 — no error, no warning, and both halves behaving exactly as
// written. The products past the bound were unreachable from every surface:
// search, collections, the homepage, related products.

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useContext } from 'react'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { ShopContext } from '../../context/shopContext.js'
import { makeProduct, setCatalog, requestLog } from '../msw/handlers.js'
import { collectPages } from '../../api/client.js'

const bulkCatalog = (count) => Array.from({ length: count }, (unused, index) => makeProduct({
    _id: `5eed${String(index).padStart(20, '0')}`,
    name: `Bulk Product ${String(index).padStart(3, '0')}`,
    price: 10 + index,
}))

const renderContext = () => renderHook(() => useContext(ShopContext), {
    wrapper: ({ children }) => (
        <MemoryRouter><ShopContextProvider>{children}</ShopContextProvider></MemoryRouter>
    ),
})

describe('collectPages', () => {
    it('stops after one request when there is one page', async () => {
        const calls = []
        const result = await collectPages(async (paging) => {
            calls.push(paging)
            return { items: [1, 2, 3], total: 3, page: 1, pages: 1, limit: 100 }
        })

        expect(calls).toHaveLength(1)
        expect(result.items).toEqual([1, 2, 3])
        expect(result.truncated).toBe(false)
    })

    it('walks every page and asks for them in order', async () => {
        const calls = []
        const result = await collectPages(async (paging) => {
            calls.push(paging.page)
            return { items: [paging.page], total: 3, page: paging.page, pages: 3, limit: 1 }
        }, { limit: 1 })

        expect(calls).toEqual([1, 2, 3])
        expect(result.items).toEqual([1, 2, 3])
        expect(result.truncated).toBe(false)
    })

    it('stops at its bound and says the result is incomplete', async () => {
        const result = await collectPages(
            async (paging) => ({ items: [paging.page], total: 100, page: paging.page, pages: 100, limit: 1 }),
            { maxPages: 3, limit: 1 },
        )

        expect(result.items).toHaveLength(3)
        expect(result.truncated).toBe(true)
    })

    it('fails closed on an envelope with no paging fields at all', async () => {
        const result = await collectPages(async () => ({ items: ['only'] }))
        expect(result.items).toEqual(['only'])
        expect(result.truncated).toBe(true)
    })

    it('retains the highest credible pages and total when later metadata goes stale', async () => {
        const result = await collectPages(async ({ page }) => ({
            items: [page],
            page,
            limit: 1,
            pages: page === 1 ? 5 : 2,
            total: page === 1 ? 5 : 2,
        }), { maxPages: 3, limit: 1 })

        expect(result.items).toEqual([1, 2, 3])
        expect(result.pages).toBe(5)
        expect(result.total).toBe(5)
        expect(result.truncated).toBe(true)
    })

    it.each([
        ['malformed metadata', { items: ['one'], page: 1, pages: 'one', total: 1, limit: 1 }],
        ['a stale response page', { items: ['one'], page: 2, pages: 2, total: 2, limit: 1 }],
    ])('fails closed on %s', async (_label, response) => {
        const result = await collectPages(async () => response, { limit: 1 })
        expect(result.truncated).toBe(true)
    })
})

describe('the catalog the storefront actually holds', () => {
    it('contains every product, not just the first bounded page', async () => {
        setCatalog(bulkCatalog(150))

        const { result } = renderContext()

        await waitFor(() => expect(result.current.catalogStatus).toBe('ready'))
        expect(result.current.products).toHaveLength(150)

        // The last product, which one request could never have reached.
        expect(result.current.products.some((p) => p.name === 'Bulk Product 149')).toBe(true)
    })

    it('walks exactly as many pages as there are', async () => {
        setCatalog(bulkCatalog(150))

        const { result } = renderContext()
        await waitFor(() => expect(result.current.catalogStatus).toBe('ready'))

        const catalogRequests = requestLog.filter((entry) => entry === 'GET /api/product/list')
        expect(catalogRequests).toHaveLength(2)
    })

    it('still issues one request for a catalog that fits in one page', async () => {
        setCatalog(bulkCatalog(12))

        const { result } = renderContext()
        await waitFor(() => expect(result.current.catalogStatus).toBe('ready'))

        expect(result.current.products).toHaveLength(12)
        expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(1)
    })

    it('surfaces an incomplete bounded catalog as an error, never ready', async () => {
        setCatalog(bulkCatalog(2001))

        const { result } = renderContext()
        await waitFor(() => expect(result.current.catalogStatus).toBe('error'), { timeout: 10000 })

        expect(result.current.products).toEqual([])
        expect(result.current.catalogError).toMatch(/incomplete/i)
    })
})
