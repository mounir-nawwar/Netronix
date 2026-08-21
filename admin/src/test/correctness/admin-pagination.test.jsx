// PRE-COMMIT — bounded pagination must be complete or visibly fail closed.

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { collectPages, listProducts } from '../../lib/productRequests.js'
import Dashboard from '../../pages/Dashboard.jsx'
import List from '../../pages/List.jsx'
import Orders from '../../pages/Orders.jsx'
import {
    setCatalog, setOrders, makeOrder, makeProduct, requestLog, VALID_ADMIN_TOKEN,
} from '../msw/handlers.js'

const bulkCatalog = (count) => Array.from({ length: count }, (unused, index) => makeProduct({
    _id: `5eed${String(index).padStart(20, '0')}`,
    name: `Bulk Product ${String(index).padStart(3, '0')}`,
}))

const bulkOrders = (count) => Array.from({ length: count }, (unused, index) => makeOrder({
    _id: `6eed${String(index).padStart(20, '0')}`,
    orderNumber: 1000 + index,
}))

describe('collectPages', () => {
    it('stops after one request when there is one page', async () => {
        const calls = []
        const result = await collectPages(async (paging) => {
            calls.push(paging.page)
            return { items: [1, 2], total: 2, pages: 1 }
        })
        expect(calls).toEqual([1])
        expect(result.items).toEqual([1, 2])
        expect(result.truncated).toBe(false)
    })

    it('walks every page', async () => {
        const result = await collectPages(
            async (paging) => ({ items: [paging.page], total: 4, pages: 4 }),
            { limit: 1 },
        )
        expect(result.items).toEqual([1, 2, 3, 4])
        expect(result.truncated).toBe(false)
    })

    it('stops at its bound and says so', async () => {
        const result = await collectPages(
            async (paging) => ({ items: [paging.page], total: 500, pages: 500 }),
            { maxPages: 4, limit: 1 },
        )
        expect(result.items).toHaveLength(4)
        expect(result.truncated).toBe(true)
    })

    it('marks a bounded walk truncated when advertised pages remain even if total is stale', async () => {
        const result = await collectPages(
            async (paging) => ({
                items: Array.from({ length: 100 }, (_, index) => `${paging.page}-${index}`),
                total: 2000,
                pages: 21,
            }),
            { maxPages: 20, limit: 100 },
        )
        expect(result.items).toHaveLength(2000)
        expect(result.truncated).toBe(true)
    })

    it('remembers advertised pages when later responses omit total and paging metadata', async () => {
        const result = await collectPages(
            async ({ page }) => (page === 1
                ? { items: ['1'], pages: 5 }
                : { items: [String(page)] }),
            { maxPages: 3, limit: 1 },
        )
        expect(result.items).toEqual(['1', '2', '3'])
        expect(result.truncated).toBe(true)
    })

    it('does not trust a stale low total or a later lower page count', async () => {
        const result = await collectPages(
            async ({ page }) => ({
                items: [page],
                total: page === 1 ? 1 : 999,
                pages: page === 1 ? 5 : 2,
            }),
            { maxPages: 3, limit: 1 },
        )
        expect(result.items).toEqual([1, 2, 3])
        expect(result.truncated).toBe(true)
    })

    it('fails closed when pagination metadata is malformed', async () => {
        const result = await collectPages(
            async () => ({ items: ['one'], pages: 'five', total: 'unknown' }),
            { maxPages: 3, limit: 1 },
        )
        expect(result.truncated).toBe(true)
    })

    it('reads the legacy array name when there is no `items`', async () => {
        const result = await collectPages(async () => ({ products: ['legacy'], total: 1, pages: 1 }))
        expect(result.items).toEqual(['legacy'])
    })
})

describe('the product list the console holds', () => {
    it('contains every product, not just the first bounded page', async () => {
        setCatalog(bulkCatalog(150))
        const products = await listProducts()
        expect(products).toHaveLength(150)
        expect(products.some((product) => product.name === 'Bulk Product 149')).toBe(true)
        expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(2)
    })

    it('still issues one request for a list that fits', async () => {
        setCatalog(bulkCatalog(9))
        expect(await listProducts()).toHaveLength(9)
        expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(1)
    })

    it('fails closed instead of returning a silently truncated catalog', async () => {
        setCatalog(bulkCatalog(2001))
        await expect(listProducts()).rejects.toThrow(/incomplete.*2000.*2001/i)
    })
})

describe('paginated admin consumers', () => {
    it('calculates dashboard analytics from every product and order page', async () => {
        setCatalog(bulkCatalog(150))
        setOrders(bulkOrders(150))
        render(<MemoryRouter><Dashboard token={VALID_ADMIN_TOKEN} /></MemoryRouter>)

        const orderCard = (await screen.findByText('Total Orders', {}, { timeout: 10000 })).closest('div.bg-white')
        const productCard = screen.getByText('Products').closest('div.bg-white')
        expect(within(orderCard).getByText('150')).toBeInTheDocument()
        expect(within(productCard).getByText('150')).toBeInTheDocument()
        expect(requestLog.filter((entry) => entry === 'GET /api/product/list')).toHaveLength(2)
        expect(requestLog.filter((entry) => entry === 'POST /api/order/list')).toHaveLength(2)
    })

    it('shows an error and no analytics when dashboard collection is truncated', async () => {
        setCatalog(bulkCatalog(2001))
        setOrders(bulkOrders(1))
        render(<MemoryRouter><Dashboard token={VALID_ADMIN_TOKEN} /></MemoryRouter>)

        expect(await screen.findByRole('alert', {}, { timeout: 10000 })).toHaveTextContent(/dashboard data is incomplete/i)
        expect(screen.queryByText('Total Sales')).toBeNull()
    })

    it('surfaces product-list truncation in the page', async () => {
        setCatalog(bulkCatalog(2001))
        render(<MemoryRouter><List token={VALID_ADMIN_TOKEN} /></MemoryRouter>)
        expect(await screen.findByRole('alert', {}, { timeout: 10000 })).toHaveTextContent(/incomplete/i)
    })

    it('surfaces order-list truncation in the page', async () => {
        setOrders(bulkOrders(2001))
        render(<MemoryRouter><Orders token={VALID_ADMIN_TOKEN} /></MemoryRouter>)
        expect(await screen.findByRole('alert', {}, { timeout: 10000 })).toHaveTextContent(/incomplete/i)
    })
})
