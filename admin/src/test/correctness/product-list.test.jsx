// PHASE 3 — the product list's lifecycle (ADM-003 UI half, ADM-004, ADM-002).

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import List from '../../pages/List.jsx'
import { setCatalog, makeProduct, requestLog, VALID_ADMIN_TOKEN } from '../msw/handlers.js'
import * as handlers from '../msw/handlers.js'

const renderList = () => render(
    <MemoryRouter><List token={VALID_ADMIN_TOKEN} /></MemoryRouter>,
)

const matrixProduct = (overrides = {}) => makeProduct({
    name: 'Matrix Product',
    variants: [
        { name: 'GPU', options: ['RTX-4070', 'RTX-4080', 'RTX-4090'] },
        { name: 'RAM', options: ['16GB', '32GB', '64GB'] },
    ],
    inventory: {
        'RTX-4070-16GB': 0, 'RTX-4070-32GB': 0, 'RTX-4070-64GB': 0,
        'RTX-4080-16GB': 0, 'RTX-4080-32GB': 0, 'RTX-4080-64GB': 0,
        'RTX-4090-16GB': 0, 'RTX-4090-32GB': 0, 'RTX-4090-64GB': 0,
    },
    ...overrides,
})

describe('ADM-004 — the whole matrix saves in one request', () => {
    it('nine combinations produce exactly one request', async () => {
        const user = userEvent.setup()
        setCatalog([matrixProduct()])
        renderList()

        await screen.findByText('Matrix Product')
        await user.click(screen.getByRole('button', { name: /manage stock for matrix product/i }))
        await screen.findByRole('dialog')

        await user.click(screen.getByRole('button', { name: /save inventory/i }))

        // It used to be one HTTP request *per combination*, sequentially,
        // aborting on the first failure with the earlier ones already committed.
        await waitFor(() =>
            expect(requestLog.filter((entry) => entry.includes('/inventory'))).toHaveLength(1))
        expect(requestLog.filter((entry) => entry === 'POST /api/product/update-inventory')).toHaveLength(0)
    })

    it('sends every combination by its lossless option pairs (DB-003)', async () => {
        const user = userEvent.setup()
        setCatalog([matrixProduct()])
        renderList()

        await screen.findByText('Matrix Product')
        await user.click(screen.getByRole('button', { name: /manage stock for matrix product/i }))
        await screen.findByRole('dialog')

        await user.type(screen.getByLabelText('Quantity for GPU: RTX-4090, RAM: 64GB'), '7')
        await user.click(screen.getByRole('button', { name: /save inventory/i }))

        await waitFor(() => expect(handlers.lastInventoryRequest).not.toBeNull())
        const { entries } = handlers.lastInventoryRequest
        expect(entries).toHaveLength(9)
        // Named by options, never by the hyphen-joined key — which for
        // "RTX-4090-64GB" cannot be split back into its two option values.
        for (const entry of entries) {
            expect(entry).toHaveProperty('variantOptions')
            expect(entry).not.toHaveProperty('variantKey')
        }
        expect(entries).toContainEqual({
            variantOptions: { GPU: 'RTX-4090', RAM: '64GB' },
            quantity: 7,
        })
    })

    it('labels a hyphenated combination by its axes, not by the raw key', async () => {
        const user = userEvent.setup()
        setCatalog([matrixProduct()])
        renderList()

        await screen.findByText('Matrix Product')
        await user.click(screen.getByRole('button', { name: /manage stock for matrix product/i }))

        expect(await screen.findByText('GPU: RTX-4070, RAM: 16GB')).toBeInTheDocument()
        expect(screen.queryByText('RTX-4070-16GB')).toBeNull()
    })
})

describe('ADM-003 — nothing destructive happens on one click', () => {
    it('archiving asks first, naming the product', async () => {
        const user = userEvent.setup()
        setCatalog([makeProduct({ name: 'Doomed Product' })])
        renderList()

        await screen.findByText('Doomed Product')
        await user.click(screen.getByRole('button', { name: /archive doomed product/i }))

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        // The dialog names the product, so a confirmation cannot be given for
        // one product while looking at another.
        expect(within(dialog).getByRole('heading', { name: /Doomed Product/ })).toBeInTheDocument()

        // Nothing has been sent yet.
        expect(requestLog).not.toContain('POST /api/product/archive')
        expect(requestLog).not.toContain('POST /api/product/remove')
    })

    it('cancelling sends nothing', async () => {
        const user = userEvent.setup()
        setCatalog([makeProduct({ name: 'Doomed Product' })])
        renderList()

        await screen.findByText('Doomed Product')
        await user.click(screen.getByRole('button', { name: /archive doomed product/i }))
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }))

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(requestLog).not.toContain('POST /api/product/archive')
    })

    it('confirming archives rather than deleting', async () => {
        const user = userEvent.setup()
        setCatalog([makeProduct({ name: 'Doomed Product' })])
        renderList()

        await screen.findByText('Doomed Product')
        await user.click(screen.getByRole('button', { name: /archive doomed product/i }))
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: /^archive doomed product$/i }))

        await waitFor(() => expect(requestLog).toContain('POST /api/product/archive'))
        // Soft delete is the default, because a hard one orphans the product in
        // every order that references it (DB-007).
        expect(requestLog).not.toContain('POST /api/product/remove')
    })

    it('offers no one-click delete anywhere in the row', async () => {
        setCatalog([makeProduct({ name: 'Doomed Product' })])
        renderList()
        await screen.findByText('Doomed Product')

        expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
    })
})

describe('ADM-003 — archived products can be found and restored', () => {
    it('hides archived products from the default list', async () => {
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000001', name: 'Live Product' }),
            makeProduct({ _id: '5eed00000000000000000002', name: 'Archived Product', archived: true }),
        ])
        renderList()

        await screen.findByText('Live Product')
        expect(screen.queryByText('Archived Product')).toBeNull()
    })

    it('shows them behind the archived filter, and offers a restore', async () => {
        const user = userEvent.setup()
        setCatalog([
            makeProduct({ _id: '5eed00000000000000000001', name: 'Live Product' }),
            makeProduct({ _id: '5eed00000000000000000002', name: 'Archived Product', archived: true }),
        ])
        renderList()

        await screen.findByText('Live Product')
        await user.click(screen.getByLabelText(/show archived/i))

        expect(await screen.findByText('Archived Product')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /restore archived product/i })).toBeInTheDocument()
        // A restored product cannot also be archived from the same row.
        expect(screen.queryByRole('button', { name: /archive archived product/i })).toBeNull()
    })

    it('restoring sends the restore request', async () => {
        const user = userEvent.setup()
        setCatalog([makeProduct({ name: 'Archived Product', archived: true })])
        renderList()

        await user.click(await screen.findByLabelText(/show archived/i))
        await user.click(await screen.findByRole('button', { name: /restore archived product/i }))

        await waitFor(() => expect(requestLog).toContain('POST /api/product/restore'))
    })
})

describe('ADM-002 — every row offers an edit', () => {
    it('links to the edit route for that product', async () => {
        setCatalog([makeProduct({ _id: '680897a3a9a5ffb06b2e52c8', name: 'Editable Product' })])
        renderList()

        await screen.findByText('Editable Product')
        const edit = screen.getByRole('link', { name: /edit editable product/i })
        expect(edit).toHaveAttribute('href', '/edit/680897a3a9a5ffb06b2e52c8')
    })
})

describe('the list distinguishes loading from empty', () => {
    it('says it is loading before the catalog arrives', async () => {
        setCatalog([makeProduct({ name: 'Slow Product' })])
        renderList()
        expect(screen.getByRole('status')).toBeInTheDocument()
        expect(screen.queryByText(/no products found/i)).toBeNull()
        await screen.findByText('Slow Product')
    })

    it('settles on an empty state for an empty catalog', async () => {
        setCatalog([])
        renderList()
        expect(await screen.findByText(/no products found/i)).toBeInTheDocument()
    })
})
