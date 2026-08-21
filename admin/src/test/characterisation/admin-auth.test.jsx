// CHARACTERISATION — the admin console's authentication and gating as they
// behave today.
//
// Related manifest flow: 2 (admin token carries no secret, SEC-001) — the
// console side of it. Target-state assertions live in
// src/test/target-state/admin.target.test.jsx.

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Login from '../../components/Login.jsx'
import { requestLog } from '../msw/handlers.js'

const readSource = (relative) => readFileSync(join(process.cwd(), 'src', relative), 'utf8')

describe('admin login', () => {
    it('posts the typed credentials and hands the token back to the caller', async () => {
        const user = userEvent.setup()
        let received = null
        render(<MemoryRouter><Login setToken={(token) => { received = token }} /></MemoryRouter>)

        await user.type(screen.getByLabelText(/email address/i), 'admin@netronix.test')
        await user.type(screen.getByLabelText(/password/i), 'test-admin-password-not-real')
        await user.click(screen.getByRole('button', { name: /sign in to admin/i }))

        await waitFor(() => expect(received).toBe('test.admin.token'))
        expect(requestLog).toContain('POST /api/user/admin')
    })

    it('does not set a token when the credentials are rejected', async () => {
        const user = userEvent.setup()
        let received = null
        render(<MemoryRouter><Login setToken={(token) => { received = token }} /></MemoryRouter>)

        await user.type(screen.getByLabelText(/email address/i), 'admin@netronix.test')
        await user.type(screen.getByLabelText(/password/i), 'wrong-password')
        await user.click(screen.getByRole('button', { name: /sign in to admin/i }))

        await waitFor(() => expect(requestLog).toContain('POST /api/user/admin'))
        expect(received).toBeNull()
    })

    it('CURRENT BEHAVIOUR: the console never holds the admin credentials in configuration (SEC-001)', () => {
        // The operator types them; nothing is baked into the bundle. This is the
        // one part of the admin auth story that is already correct, and the
        // Phase 1 rework must not regress it.
        for (const file of ['components/Login.jsx', 'App.jsx', 'pages/Dashboard.jsx']) {
            expect(readSource(file), file).not.toMatch(/ADMIN_PASSWORD|ADMIN_EMAIL/)
        }
        // config.js names them only to refuse them.
        expect(readSource('config.js')).not.toMatch(/import\.meta\.env\.VITE_ADMIN/)
    })
})

describe('console gating (SEC-012 — fixed)', () => {
    // FLIPPED IN PHASE 1, task 1.5.
    //
    // Phase 0 recorded that `App.jsx` rendered the dashboard whenever the stored
    // token was any non-empty string, that two different logout paths existed,
    // and that the token was written straight back to localStorage on every
    // change. The first two are now asserted the other way round. The behavioural
    // proof — that a fabricated value leaves the login form on screen — is in
    // src/test/target-state/admin.target.test.jsx, which this phase enables.

    it('the console gates on a server-verified session, not on a string comparison', () => {
        const source = readSource('App.jsx')

        expect(source).not.toMatch(/token === ""/)
        expect(source).toMatch(/\/api\/user\/admin\/session/)
        // Three states, so a valid session is not flashed past the login form
        // while it is being verified.
        expect(source).toMatch(/checking/)
        expect(source).toMatch(/signed-in/)
    })

    it('a failed verification leaves the console locked', () => {
        const source = readSource('lib/useAdminSession.js')

        // The shell is reachable from exactly one state, and no failure path
        // reaches it. Asserted structurally here; the behavioural proof — a
        // fabricated token leaves the login form on screen — is the
        // target-state test this phase enables.
        expect(source).toMatch(/status: 'signed-in'/)
        const signedOutAssignments = source.match(/status: 'signed-out'/g) ?? []
        expect(signedOutAssignments.length).toBeGreaterThanOrEqual(3)
        expect(readSource('App.jsx')).toMatch(/session\.status !== 'signed-in'/)
    })

    it('CURRENT BEHAVIOUR: the token is still persisted to localStorage (SEC-007 — deliberately deferred)', () => {
        // SEC-007 is a documented, reasoned deferral, not an oversight: moving
        // to httpOnly cookies introduces CSRF exposure that the current custom
        // `token` header does not have (SEC-021), and it has to land together
        // with CSRF defences. See the README.
        expect(readSource('lib/useAdminSession.js')).toMatch(/localStorage\.setItem\('token', token\)/)
    })

    it('there is exactly one logout path, and it revokes server-side (ADM-011 — fixed)', () => {
        const navbar = readSource('components/Navbar.jsx')
        const sidebar = readSource('components/Sidebar.jsx')

        // Phase 0: Navbar cleared React state, Sidebar removed the key and
        // forced a full page reload. Neither told the server.
        expect(sidebar).not.toMatch(/window\.location\.reload/)
        expect(navbar).not.toMatch(/setToken\(''\)/)

        // Both now call the one handler App.jsx owns.
        expect(navbar).toMatch(/onLogout/)
        expect(sidebar).toMatch(/onLogout/)
        expect(readSource('lib/useAdminSession.js')).toMatch(/\/api\/user\/logout/)
    })
})

describe('configuration wiring', () => {
    it('no page builds a backend URL of its own (DEVOPS-002)', () => {
        // Phase 3 moved the product writes behind `lib/productRequests`, so
        // `Add`, `Edit` and `List` reach the API through it rather than
        // assembling their own URLs. What must stay true is the property this
        // test was always about: exactly one validated source for the base URL,
        // and no page importing one from `App.jsx` (FE-008's admin twin).
        const pages = [
            'pages/Dashboard.jsx',
            'pages/Add.jsx',
            'pages/Edit.jsx',
            'pages/Orders.jsx',
            'pages/List.jsx',
            'components/Login.jsx',
        ]
        for (const file of pages) {
            const source = readSource(file)
            expect(source, file).not.toMatch(/from '\.\.\/App'/)
            expect(source, file).not.toMatch(/https?:\/\/localhost/)
            expect(source, file).not.toMatch(/import\.meta\.env\.VITE_/)
        }
    })

    it('the one base URL comes from the validated config module', () => {
        for (const file of ['lib/productRequests.js', 'pages/Dashboard.jsx', 'components/Login.jsx']) {
            expect(readSource(file), file).toMatch(/from '\.\.\/config'/)
        }
    })

    it('App.jsx exports only the component', () => {
        const source = readSource('App.jsx')
        expect(source).not.toMatch(/export const/)
        expect(source).toMatch(/export default App/)
    })
})
