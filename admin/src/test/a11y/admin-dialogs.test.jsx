// ADM-012 / A11Y-002 — the admin's two modals, as keyboard surfaces.
//
// The inventory modal was the worst dialog in the project: a plain `<div>`
// overlay with no role, no focus management and no Escape. A keyboard user who
// opened it could not get out of it.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { makeProduct, setCatalog } from '../msw/handlers.js'
import Sidebar from '../../components/Sidebar.jsx'
import Navbar from '../../components/Navbar.jsx'

const TOKEN = 'test.admin.token'

describe('the responsive sidebar', () => {
    it('removes the closed mobile drawer from the DOM while retaining desktop navigation', () => {
        const { container } = render(
            <MemoryRouter><Sidebar open={false} onLogout={() => {}} onDismiss={() => {}} /></MemoryRouter>,
        )

        expect(container.querySelector('#admin-sidebar-mobile')).toBeNull()
        const desktop = container.querySelector('#admin-sidebar-desktop')
        expect(desktop).toBeInTheDocument()
        expect(desktop).toHaveClass('hidden', 'lg:block')
        expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    })

    it('associates the expanded mobile disclosure with the mounted drawer', () => {
        const { container } = render(
            <MemoryRouter>
                <Navbar onLogout={() => {}} navOpen onToggleNav={() => {}} />
                <Sidebar open onLogout={() => {}} onDismiss={() => {}} />
            </MemoryRouter>,
        )
        const disclosure = screen.getByRole('button', { name: /close the navigation menu/i })
        expect(disclosure).toHaveAttribute('aria-controls', 'admin-sidebar-mobile')
        expect(container.querySelector(`#${disclosure.getAttribute('aria-controls')}`)).toBeInTheDocument()
        const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.filter((id) => id === 'admin-sidebar-mobile')).toHaveLength(1)
    })

    it('does not claim to control an unmounted drawer when collapsed', () => {
        const { container } = render(
            <MemoryRouter>
                <Navbar onLogout={() => {}} navOpen={false} onToggleNav={() => {}} />
                <Sidebar open={false} onLogout={() => {}} onDismiss={() => {}} />
            </MemoryRouter>,
        )
        const disclosure = screen.getByRole('button', { name: /open the navigation menu/i })
        expect(disclosure).not.toHaveAttribute('aria-controls')
        expect(container.querySelector('#admin-sidebar-mobile')).toBeNull()
    })
})

async function openList() {
    const { default: List } = await import('../../pages/List.jsx')
    render(<MemoryRouter><List token={TOKEN} /></MemoryRouter>)
    return userEvent.setup()
}

describe('the inventory modal', () => {
    it('moves focus inside, keeps Tab there, and restores it on Escape', async () => {
        setCatalog([makeProduct({ name: 'Trap Product' })])
        const user = await openList()

        await screen.findByText('Trap Product')
        const opener = screen.getByRole('button', { name: /manage stock for Trap Product/i })
        opener.focus()
        await user.click(opener)

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveAttribute('aria-labelledby')

        // Focus went in.
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

        // Twelve tabs cannot walk out of a dialog with fewer than twelve
        // focusable elements — which is exactly what used to happen.
        for (let i = 0; i < 12; i += 1) {
            await user.tab()
            expect(dialog.contains(document.activeElement), `escaped after ${i + 1} tabs`).toBe(true)
        }

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

        // And focus is back where it started, not on <body>.
        await waitFor(() => expect(document.activeElement).toBe(opener))
    })

    it('closes on Escape rather than only on the Cancel button', async () => {
        setCatalog([makeProduct({ name: 'Escape Product' })])
        const user = await openList()

        await screen.findByText('Escape Product')
        await user.click(screen.getByRole('button', { name: /manage stock for Escape Product/i }))
        await screen.findByRole('dialog')

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
})

describe('the archive confirmation', () => {
    it('traps focus and restores it to the row action', async () => {
        setCatalog([makeProduct({ name: 'Archive Me' })])
        const user = await openList()

        await screen.findByText('Archive Me')
        const opener = screen.getByRole('button', { name: /archive Archive Me/i })
        opener.focus()
        await user.click(opener)

        const dialog = await screen.findByRole('dialog')
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

        for (let i = 0; i < 8; i += 1) {
            await user.tab()
            expect(dialog.contains(document.activeElement)).toBe(true)
        }

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await waitFor(() => expect(document.activeElement).toBe(opener))
    })
})

describe('row actions are uniquely named', () => {
    it('names every destructive action after its product', async () => {
        setCatalog([
            makeProduct({ _id: 'p-one', name: 'First Machine' }),
            makeProduct({ _id: 'p-two', name: 'Second Machine' }),
        ])
        await openList()

        await screen.findByText('First Machine')
        // Twenty rows used to announce twenty identical "Delete" buttons.
        expect(screen.getByRole('button', { name: /archive First Machine/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /archive Second Machine/i })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /edit First Machine/i })).toBeInTheDocument()
    })
})
