// A11Y-002 / A11Y-004 / A11Y-005 / A11Y-006 / A11Y-008 / A11Y-009 —
// dialog semantics, keyboard-operable controls, landmarks and labels.
//
// The audit's numbers: 27 `aria-*` attributes across the whole storefront,
// **0** `role` attributes, no `<main>`/`<nav>`/`<header>` anywhere, no skip
// link, no focus styles, and a checkout whose payment selector could not be
// reached by Tab at all.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import ShopContextProvider from '../../context/ShopContext.jsx'
import App from '../../App.jsx'
import { makeProduct, setCatalog } from '../msw/handlers.js'

const renderApp = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
        <ShopContextProvider><App /></ShopContextProvider>
    </MemoryRouter>,
)

describe('landmarks and the skip link', () => {
    it('exposes header, nav and main, and a skip link that targets main', async () => {
        renderApp('/cart')

        expect(screen.getByRole('banner')).toBeInTheDocument()
        expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument()

        const main = await screen.findByRole('main')
        expect(main).toHaveAttribute('id', 'main-content')

        const skip = screen.getByRole('link', { name: /skip to main content/i })
        expect(skip).toHaveAttribute('href', '#main-content')
    })

    it('makes the skip link the first thing Tab reaches', async () => {
        const user = userEvent.setup()
        renderApp('/cart')

        await user.tab()
        expect(document.activeElement).toHaveTextContent(/skip to main content/i)
    })
})

describe('the search overlay', () => {
    it('is a labelled modal dialog, traps focus, and restores it on Escape', async () => {
        const user = userEvent.setup()
        renderApp('/cart')

        const opener = screen.getAllByRole('button', { name: /search products/i })[0]
        opener.focus()
        await user.click(opener)

        const dialog = await screen.findByRole('dialog', { name: /search products/i })
        expect(dialog).toHaveAttribute('aria-modal', 'true')

        // A11Y-009 — the input had a placeholder and no accessible name.
        expect(within(dialog).getByLabelText(/search for products/i)).toBeInTheDocument()
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

        for (let i = 0; i < 6; i += 1) {
            await user.tab()
            expect(dialog.contains(document.activeElement)).toBe(true)
        }

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog', { name: /search products/i })).toBeNull())
        await waitFor(() => expect(document.activeElement).toBe(opener))
    })
})

describe('the support chat', () => {
    it('opens as a modal dialog with a live transcript and returns focus on close', async () => {
        const user = userEvent.setup()
        renderApp('/cart')

        const launcher = screen.getByRole('button', { name: /open support chat/i })
        expect(launcher).toHaveAttribute('aria-expanded', 'false')
        launcher.focus()
        await user.click(launcher)

        const dialog = await screen.findByRole('dialog', { name: /netronix support/i })
        expect(dialog).toHaveAttribute('aria-modal', 'true')

        // A screen-reader user is told a reply arrived (A11Y-002).
        const log = within(dialog).getByRole('log')
        expect(log).toHaveAttribute('aria-live', 'polite')

        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog', { name: /netronix support/i })).toBeNull())
        await waitFor(() => expect(document.activeElement).toBe(launcher))
    })
})

describe('A11Y-005 — the payment selector', () => {
    it('is a grouped set of real radios, operable by keyboard', async () => {
        const user = userEvent.setup()
        renderApp('/placeorder')

        const group = await screen.findByRole('group', { name: /payment method/i })
        const radios = within(group).getAllByRole('radio')
        expect(radios).toHaveLength(2)

        const [whish, cod] = radios
        expect(cod).toBeChecked()

        // Reachable and operable without a mouse: focus the group and use the
        // arrow keys, which is how a radio group works and is exactly what two
        // `<div onClick>`s could not do.
        cod.focus()
        await user.keyboard('{ArrowUp}')
        await waitFor(() => expect(whish).toBeChecked())
        await user.keyboard('{ArrowDown}')
        await waitFor(() => expect(cod).toBeChecked())
    })
})

describe('A11Y-004 — no interactive element is nested in another', () => {
    it('has no <a> inside a <button> and no <button> inside an <a>', async () => {
        setCatalog([makeProduct()])
        const { container } = renderApp('/products')
        await screen.findByRole('main')
        await waitFor(() => expect(container.querySelector('.product-card')).not.toBeNull())

        expect(container.querySelectorAll('button a')).toHaveLength(0)
        expect(container.querySelectorAll('a button')).toHaveLength(0)
    })
})

describe('every control has an accessible name', () => {
    it('leaves no unnamed button on the shell', async () => {
        renderApp('/cart')
        await screen.findByRole('main')

        const unnamed = screen.getAllByRole('button').filter((button) => {
            const label = button.getAttribute('aria-label') ?? button.textContent ?? ''
            return label.trim() === ''
        })
        expect(unnamed.map((button) => button.outerHTML.slice(0, 120))).toEqual([])
    })
})
