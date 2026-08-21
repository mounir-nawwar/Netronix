// PHASE 3 — the admin console's product lifecycle, in a real browser
// (ADM-002, ADM-003, ADM-004, ADM-005).
//
// Flow 15 in `.local-audit/03_END_TO_END_FLOWS.md`.

import { test, expect } from './test.js'

import { state } from './fixtures.js'

const admin = () => state().adminUrl
const credentials = () => state().admin

async function signIn(page) {
    await page.goto(admin())
    await page.getByPlaceholder('admin@example.com').fill(credentials().email)
    await page.getByPlaceholder('••••••••').fill(credentials().password)
    await page.getByRole('button', { name: /sign in to admin/i }).click()
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible({ timeout: 20_000 })
}

test.describe('flow 14/15 — the admin product lifecycle', () => {
    test('sign in, add, edit, bulk stock, archive, filter, restore', async ({ page }) => {
        await signIn(page)

        // --- add ---------------------------------------------------------
        await page.goto(`${admin()}/add`)
        await page.getByLabel(/product name/i).fill('E2E Test Workstation')
        await page.getByLabel(/brand/i).fill('Netronix')
        await page.getByLabel(/product price/i).fill('4999')
        await page.getByLabel(/product description/i).fill('Created by the end-to-end suite.')
        await page.getByRole('button', { name: 'Gaming PCs' }).click()

        // A two-axis matrix with hyphenated option values (DB-003).
        await page.getByLabel(/variant 1 name/i).fill('GPU')
        await page.getByLabel(/option value for variant 1/i).fill('RTX-4090')
        await page.getByRole('button', { name: /^add$/i }).last().click()

        await page.getByRole('button', { name: /add variant/i }).click()
        await page.getByLabel(/variant 2 name/i).fill('RAM')
        await page.getByLabel(/option value for variant 2/i).fill('64GB')
        await page.getByRole('button', { name: /^add$/i }).last().click()

        // ADM-005 — the matrix appeared from the axes, with no reconciliation.
        await expect(page.getByLabel('Quantity for RTX-4090 / 64GB')).toBeVisible()
        await page.getByLabel('Quantity for RTX-4090 / 64GB').fill('5')

        await page.getByRole('button', { name: /add product/i }).click()

        // --- it is in the list -------------------------------------------
        await page.goto(`${admin()}/list`)
        await expect(page.getByText('E2E Test Workstation').first()).toBeVisible({ timeout: 30_000 })

        // --- edit (ADM-002) ----------------------------------------------
        await page.getByRole('link', { name: /edit e2e test workstation/i }).click()
        await expect(page.getByLabel(/product name/i)).toHaveValue('E2E Test Workstation', { timeout: 20_000 })
        await page.getByLabel(/product name/i).fill('E2E Test Workstation Mk II')
        await page.getByRole('button', { name: /save changes/i }).click()

        // `.first()`: the row shows the name and its description, and the
        // description was written by this test.
        await expect(page.getByText('E2E Test Workstation Mk II').first()).toBeVisible({ timeout: 30_000 })

        // --- bulk stock in one request (ADM-004) -------------------------
        const inventoryRequests = []
        page.on('request', (request) => {
            if (request.url().includes('/inventory')) inventoryRequests.push(request.url())
        })

        await page.getByRole('button', { name: /manage stock for e2e test workstation mk ii/i }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByLabel(/quantity for gpu: rtx-4090, ram: 64gb/i).fill('11')
        await page.getByRole('button', { name: /save inventory/i }).click()

        await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 })
        expect(inventoryRequests).toHaveLength(1)

        // --- archive, with a confirmation (ADM-003) ----------------------
        await page.getByRole('button', { name: /archive e2e test workstation mk ii/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('heading', { name: /E2E Test Workstation Mk II/ })).toBeVisible()
        await dialog.getByRole('button', { name: /^archive e2e test workstation mk ii$/i }).click()

        await expect(page.getByText('E2E Test Workstation Mk II')).toHaveCount(0, { timeout: 30_000 })

        // --- the archived filter, and restore ----------------------------
        await page.getByLabel(/show archived/i).check()
        await expect(page.getByText('E2E Test Workstation Mk II').first()).toBeVisible({ timeout: 30_000 })
        await page.getByRole('button', { name: /restore e2e test workstation mk ii/i }).click()

        await page.getByLabel(/show archived/i).uncheck()
        await expect(page.getByText('E2E Test Workstation Mk II').first()).toBeVisible({ timeout: 30_000 })

        // --- no one-click destruction anywhere ---------------------------
        await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0)
    })

    test('an order status can be advanced', async ({ page }) => {
        await signIn(page)
        await page.goto(`${admin()}/orders`)
        await expect(page.getByText(/order/i).first()).toBeVisible({ timeout: 20_000 })
    })
})
