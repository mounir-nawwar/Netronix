// TARGET STATE — admin console behaviour after the remediation phases.
//
// These regression tests are active. Each block records the original finding
// and the phase that closed it.

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { BACKEND_URL, requestLog, setCatalog, makeProduct, VALID_ADMIN_TOKEN } from '../msw/handlers.js'
import { server } from '../msw/server.js'

const readSource = (relative) => readFileSync(join(process.cwd(), 'src', relative), 'utf8')

// ---------------------------------------------------------------------------
describe('TARGET STATE — admin authentication (SEC-001, SEC-012)', () => {
    // Finding:     SEC-012 (console gated only by a non-empty string)
    // ENABLED in Phase 1, roadmap task 1.5. Was: "`App.jsx:30` renders the
    // console whenever the stored token is not the empty string; nothing
    // inspects the token".
    it.each([
        ['an arbitrary string', 'obviously-not-a-jwt'],
        ['a plausible-looking fake', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.nope'],
    ])('GATE 1 — refuses to render the console for %s', async (_label, token) => {
        localStorage.setItem('token', token)
        const { default: App } = await import('../../App.jsx')
        render(<MemoryRouter><App /></MemoryRouter>)

        // The server is asked before anything renders, so the console shows a
        // verifying state first and the login form once the answer comes back.
        expect(await screen.findByRole('button', { name: /sign in to admin/i })).toBeInTheDocument()
        expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument()
        expect(requestLog).toContain('GET /api/user/admin/session')
        expect(localStorage.getItem('token')).toBeNull()
    })

    it('renders the console for a session the server confirms', async () => {
        localStorage.setItem('token', VALID_ADMIN_TOKEN)
        const { default: App } = await import('../../App.jsx')
        render(<MemoryRouter><App /></MemoryRouter>)

        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /sign in to admin/i })).not.toBeInTheDocument())
        expect(requestLog).toContain('GET /api/user/admin/session')
    })

    it('retains a valid stored token when session verification is temporarily unavailable', async () => {
        localStorage.setItem('token', VALID_ADMIN_TOKEN)
        server.use(http.get(`${BACKEND_URL}/api/user/admin/session`, () =>
            HttpResponse.json({ success: false }, { status: 503 })))
        const { default: App } = await import('../../App.jsx')
        render(<MemoryRouter><App /></MemoryRouter>)

        expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
        expect(localStorage.getItem('token')).toBe(VALID_ADMIN_TOKEN)
        expect(screen.getByRole('button', { name: /retry verification/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /sign in to admin/i })).not.toBeInTheDocument()
    })

    it('keeps the shell locked and the token intact after a network failure', async () => {
        localStorage.setItem('token', VALID_ADMIN_TOKEN)
        server.use(http.get(`${BACKEND_URL}/api/user/admin/session`, () => HttpResponse.error()))
        const { default: App } = await import('../../App.jsx')
        render(<MemoryRouter><App /></MemoryRouter>)

        expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
        expect(localStorage.getItem('token')).toBe(VALID_ADMIN_TOKEN)
        expect(screen.queryByText(/^dashboard$/i)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /sign in to admin/i })).not.toBeInTheDocument()
    })

    it('retries transient verification without requiring the administrator to sign in again', async () => {
        localStorage.setItem('token', VALID_ADMIN_TOKEN)
        let attempts = 0
        server.use(http.get(`${BACKEND_URL}/api/user/admin/session`, () => {
            attempts += 1
            if (attempts === 1) return HttpResponse.json({ success: false }, { status: 503 })
            return HttpResponse.json({
                success: true,
                admin: { id: 'admin', name: 'Test Admin', email: 'admin@netronix.test', role: 'admin' },
            })
        }))
        const { default: App } = await import('../../App.jsx')
        const user = userEvent.setup()
        render(<MemoryRouter><App /></MemoryRouter>)

        await user.click(await screen.findByRole('button', { name: /retry verification/i }))
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
        expect(attempts).toBe(2)
        expect(localStorage.getItem('token')).toBe(VALID_ADMIN_TOKEN)
    })

    it('clears a stored token after an authoritative forbidden response', async () => {
        localStorage.setItem('token', VALID_ADMIN_TOKEN)
        server.use(http.get(`${BACKEND_URL}/api/user/admin/session`, () =>
            HttpResponse.json({ success: false }, { status: 403 })))
        const { default: App } = await import('../../App.jsx')
        render(<MemoryRouter><App /></MemoryRouter>)

        expect(await screen.findByRole('button', { name: /sign in to admin/i })).toBeInTheDocument()
        expect(localStorage.getItem('token')).toBeNull()
    })

    // Finding:     SEC-001
    // ENABLED in Phase 1, roadmap task 1.5. Was: "the server issues a token
    // whose payload is the admin password; the console has nothing role-shaped
    // to read".
    //
    // The console reads the role from the *server's* answer rather than by
    // decoding the token itself, which is strictly stronger: a client-side
    // decode proves only that someone could write a JSON object.
    it('gates on a role the server asserts, rather than treating the token as opaque', () => {
        const source = readSource('lib/useAdminSession.js')
        expect(source).toMatch(/role/)
        expect(source).toMatch(/data\.admin\?\.role === 'admin'/)
    })

    // Finding:     ADM-011 (two inconsistent logout paths)
    // ENABLED early, in Phase 1 task 1.5: the secure logout contract needs a
    // single path that calls the revocation endpoint, so unifying the two was
    // part of that change rather than Phase 3's task 3.15.
    it('has exactly one logout implementation', () => {
        const navbar = readSource('components/Navbar.jsx')
        const sidebar = readSource('components/Sidebar.jsx')
        const reloads = [navbar, sidebar].filter((s) => /window\.location\.reload/.test(s))
        expect(reloads).toHaveLength(0)
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — product management (ADM-002 … ADM-005)', () => {
    // Finding:     ADM-002 (no edit-product capability)
    // ENABLED in Phase 3, roadmap task 3.14. Was: "no edit route and no edit UI
    // exist" — correcting a typo meant deleting the product, which orphaned it
    // in every order that referenced it (DB-007), and creating it again.
    //
    // A link rather than a button: it navigates to `/edit/:id`, and a control
    // that changes the URL should be something the browser can open in a new
    // tab (A11Y-004's structural half).
    it('offers an edit action for each product', async () => {
        setCatalog([makeProduct({ name: 'Editable Product' })])
        const { default: List } = await import('../../pages/List.jsx')
        render(<MemoryRouter><List token={VALID_ADMIN_TOKEN} /></MemoryRouter>)

        await screen.findByText('Editable Product')
        expect(screen.getByRole('link', { name: /edit editable product/i })).toBeInTheDocument()
    })

    // Finding:     ADM-003 (delete without confirmation)
    // ENABLED in Phase 3, roadmap task 3.14. Was: one click straight into
    // `findByIdAndDelete`, with no dialog of any kind.
    //
    // The destructive action is now named "Archive", because that is what it
    // does: a hard delete is refused while any order references the product, and
    // soft delete is the correct default for a shop.
    it('asks for confirmation before removing a product, and archives rather than deletes', async () => {
        const user = userEvent.setup()
        setCatalog([makeProduct({ name: 'Doomed Product' })])
        const { default: List } = await import('../../pages/List.jsx')
        render(<MemoryRouter><List token={VALID_ADMIN_TOKEN} /></MemoryRouter>)

        await screen.findByText('Doomed Product')
        await user.click(screen.getByRole('button', { name: /archive doomed product/i }))

        expect(await screen.findByRole('dialog')).toBeInTheDocument()
        expect(requestLog).not.toContain('POST /api/product/remove')
        expect(requestLog).not.toContain('POST /api/product/archive')

        // …and no one-click delete is offered anywhere.
        expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
    })

    // Finding:     ADM-004 (inventory update is N sequential non-atomic requests)
    // ENABLED in Phase 3, roadmap task 3.14. Was: one HTTP request per
    // combination, sequentially, aborting on the first failure with every
    // earlier one already committed — so a 3x3 product was nine requests and
    // nine chances to leave the matrix in a state nobody chose.
    it('saves a whole inventory matrix in one request', async () => {
        const user = userEvent.setup()
        setCatalog([makeProduct({
            name: 'Matrix Product',
            variants: [{ name: 'Storage', options: ['512GB', '1TB'] }],
            inventory: { '512GB': 1, '1TB': 2 },
        })])
        const { default: List } = await import('../../pages/List.jsx')
        render(<MemoryRouter><List token={VALID_ADMIN_TOKEN} /></MemoryRouter>)

        await screen.findByText('Matrix Product')
        await user.click(screen.getByRole('button', { name: /manage stock for matrix product/i }))
        await screen.findByRole('dialog')
        await user.click(screen.getByRole('button', { name: /save inventory/i }))

        await waitFor(() =>
            expect(requestLog.filter((e) => e.includes('/inventory'))).toHaveLength(1))
        expect(requestLog.filter((e) => e === 'POST /api/product/update-inventory')).toHaveLength(0)
    })

    // Finding:     ADM-009 (no price validation)
    // ENABLED in Phase 1, roadmap task 1.4.
    //
    // The form's price field has no <label> yet — labelling every control is
    // A-10 / A11Y-002 in Phase 4 — so the input is reached by its placeholder.
    // The rejection is surfaced through the existing toast mechanism, which is
    // how this form reports every other validation failure.
    it('refuses a negative price in the add-product form', async () => {
        const { describePriceProblem, describeImageProblem } = await import('../../lib/productForm.js')

        // The rule itself. `Number('lots')` used to reach the server as NaN and
        // `-10` was accepted outright.
        expect(describePriceProblem('-10')).toMatch(/greater than zero/i)
        expect(describePriceProblem('0')).toMatch(/greater than zero/i)
        expect(describePriceProblem('lots')).toMatch(/greater than zero/i)
        expect(describePriceProblem('')).toMatch(/greater than zero/i)
        expect(describePriceProblem('199.99')).toBeNull()

        // …and the form refuses to submit such a value, so nothing is sent.
        const user = userEvent.setup()
        const { default: Add } = await import('../../pages/Add.jsx')
        const { container } = render(<MemoryRouter><Add token={VALID_ADMIN_TOKEN} /></MemoryRouter>)

        // Reached by label now rather than by placeholder: extracting
        // `ProductForm` was the moment to give every control a real one.
        const price = screen.getByLabelText(/product price/i)
        expect(price).toHaveAttribute('min', '0.01')
        expect(price).toHaveAttribute('step', '0.01')

        await user.type(screen.getByLabelText(/product name/i), 'Cheap')
        await user.type(screen.getByLabelText(/product description/i), 'A description')
        await user.type(price, '-10')
        await user.click(screen.getByRole('button', { name: /add product/i }))

        await waitFor(() => expect(requestLog).not.toContain('POST /api/product/add'))
        expect(container.querySelector('form')).toBeInTheDocument()
        expect(typeof describeImageProblem).toBe('function')
    })

    // Finding:     ADM-013, SEC-008 (client half of upload hardening)
    // ENABLED in Phase 1, roadmap task 1.9.
    it('refuses an oversized or wrong-typed image before it is uploaded', async () => {
        const { describeImageProblem } = await import('../../lib/productForm.js')

        expect(describeImageProblem(new File(['x'], 'doc.pdf', { type: 'application/pdf' })))
            .toMatch(/not a PNG, JPEG or WebP/)

        const huge = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
        expect(describeImageProblem(huge)).toMatch(/the limit is 5 MB/)

        expect(describeImageProblem(new File(['x'], 'fine.png', { type: 'image/png' }))).toBeNull()
    })

    // Finding:     ADM-013 (object URLs created every render, never revoked)
    // ENABLED in Phase 1, roadmap task 1.9.
    it('revokes every preview object URL when the form unmounts', async () => {
        const created = []
        const revoked = []
        const originalCreate = URL.createObjectURL
        const originalRevoke = URL.revokeObjectURL

        URL.createObjectURL = () => {
            const url = `blob:mock/${created.length}`
            created.push(url)
            return url
        }
        URL.revokeObjectURL = (url) => revoked.push(url)

        try {
            const user = userEvent.setup()
            const { default: Add } = await import('../../pages/Add.jsx')
            const { container, unmount } = render(<MemoryRouter><Add token="test.admin.token" /></MemoryRouter>)

            const input = container.querySelector('#image1')
            await user.upload(input, new File(['x'], 'one.png', { type: 'image/png' }))
            await waitFor(() => expect(created.length).toBeGreaterThan(0))

            unmount()
            await waitFor(() => expect(revoked).toEqual(expect.arrayContaining(created)))
        } finally {
            URL.createObjectURL = originalCreate
            URL.revokeObjectURL = originalRevoke
        }
    })
})

// ---------------------------------------------------------------------------
describe('TARGET STATE — honesty and accessibility', () => {
    // Finding:     PORT-003, ADM-007 ("Under Development" pages in the sidebar)
    // Why skipped: Users.jsx and Settings.jsx both render a placeholder.
    // Enable in:   Phase 5, roadmap task 5.5.
    it.skip('ships no "Under Development" page', () => {
        for (const file of ['pages/Users.jsx', 'pages/Settings.jsx']) {
            expect(readSource(file), file).not.toMatch(/Under Development/i)
        }
    })

    // Finding:     ADM-008 (decorative search box and notification badge)
    // Enable in:   Phase 5, roadmap task 5.5.
    it.skip('has no decorative controls that do nothing', () => {
        const navbar = readSource('components/Navbar.jsx')
        // A search input with no handler and a hardcoded "2" notification count.
        expect(navbar).not.toMatch(/placeholder="Search\.\.\."/)
        expect(navbar).not.toMatch(/>2</)
    })

    // Finding:     ADM-012, A11Y-002 (no aria, no focus trap, desktop-only)
    // Activated:   Phase 4, roadmap task 4.8. Both modals now run on the
    //              shared `src/lib/useDialog.js` primitive — the same one the
    //              storefront's chat, mobile menu and search overlay use — so
    //              focus moves in, Tab stays in, Escape closes, and focus goes
    //              back to the row button that opened it. The full trap
    //              behaviour is exercised in
    //              `src/test/a11y/admin-dialogs.test.jsx`.
    it('gives the inventory modal dialog semantics and a focus trap', async () => {
        setCatalog([makeProduct({ name: 'Modal Product' })])
        const { default: List } = await import('../../pages/List.jsx')
        render(<MemoryRouter><List token="test.admin.token" /></MemoryRouter>)

        await screen.findByText('Modal Product')
        // ADM-012 — the row action is uniquely named per product
        // (`Manage stock for …`), which is the other half of this finding:
        // twenty identical "Manage Stock" announcements before Phase 3.
        await userEvent.setup().click(screen.getByRole('button', { name: /manage stock for Modal Product/i }))

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveAttribute('aria-labelledby')
    })

    // Finding:     TEST-002 (lint), tightened at Gate 4
    // Activated:   Phase 4, roadmap task 4.13. Both fetch callbacks are
    //              memoised and both effects depend on the function rather
    //              than on a subset of what it closes over. The refetch
    //              behaviour is deliberately identical: `calculateDashboardData`
    //              carries `timeRange`, so changing the range still refetches.
    //              `npm run lint` now runs with `--max-warnings 0` in both
    //              apps and CI enforces it.
    it('lints clean with zero warnings', () => {
        for (const file of ['pages/Dashboard.jsx', 'pages/Orders.jsx']) {
            const source = readSource(file)
            expect(source, file).toMatch(/useCallback/)
        }
    })
})
