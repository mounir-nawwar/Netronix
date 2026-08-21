// PHASE 3 — the derived variant matrix and the shared product form
// (ADM-005 / A-6, ADM-002 / A-3).
//
// The matrix is the admin's best feature and the audit's most-cited example of
// state handled badly. Every handler shallow-copied `variants`, mutated the
// nested object in place, called `setVariants`, then called
// `updateInventoryKeys()` — which read `variants` from a stale closure.
// `addVariantOption` worked only because the mutation had already changed the
// object the stale closure pointed at; `removeVariant` used `splice` on the copy
// and was genuinely stale, leaving orphaned inventory combinations behind.
//
// The behavioural tests run the form inside `<StrictMode>`, because StrictMode's
// double-invocation is exactly what turns that accident into a visible bug.

import { StrictMode } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import ProductForm from '../../components/ProductForm.jsx'
import { combinationsOf, describeImageProblem, describePriceProblem } from '../../lib/productForm.js'
import { canonicalVariantId } from '../../lib/variant.js'

const renderForm = (props = {}) => render(
    <StrictMode>
        <MemoryRouter>
            <ProductForm mode="add" onSubmit={async () => { }} {...props} />
        </MemoryRouter>
    </StrictMode>,
)

/** Declare one axis and its options, through the UI. */
const addAxis = async (user, name, options) => {
    if (name) {
        const nameInputs = screen.getAllByLabelText(/variant \d+ name/i)
        await user.type(nameInputs.at(-1), name)
    }

    for (const option of options) {
        const optionInputs = screen.getAllByLabelText(/option value for variant/i)
        await user.type(optionInputs.at(-1), option)
        const addButtons = screen.getAllByRole('button', { name: /^add$/i })
        await user.click(addButtons.at(-1))
    }
}

describe('combinationsOf — the matrix is a function of the axes (ADM-005)', () => {
    it('produces the Cartesian product', () => {
        const combinations = combinationsOf([
            { name: 'Size', options: ['S', 'M'] },
            { name: 'Colour', options: ['Red', 'Blue'] },
        ])
        expect(combinations).toHaveLength(4)
        expect(combinations).toContainEqual({ Size: 'S', Colour: 'Red' })
        expect(combinations).toContainEqual({ Size: 'M', Colour: 'Blue' })
    })

    it('produces nothing while an axis has no options yet', () => {
        expect(combinationsOf([{ name: 'Size', options: [] }])).toEqual([])
        expect(combinationsOf([])).toEqual([{}])
        expect(combinationsOf(undefined)).toEqual([])
    })

    it('keeps hyphenated option values intact (DB-003)', () => {
        const [combination] = combinationsOf([
            { name: 'Size', options: ['16-inch'] },
            { name: 'GPU', options: ['RTX-4090'] },
        ])
        expect(combination).toEqual({ Size: '16-inch', GPU: 'RTX-4090' })
        // The canonical identity round-trips; the legacy joined key would not.
        expect(canonicalVariantId(combination)).toBe('GPU=RTX-4090;Size=16-inch')
    })

    it('never mutates the variants it is given', () => {
        const variants = Object.freeze([
            Object.freeze({ name: 'Size', options: Object.freeze(['S', 'M']) }),
        ])
        expect(() => combinationsOf(variants)).not.toThrow()
    })
})

describe('the matrix follows the axes, under StrictMode', () => {
    it('adding an option immediately produces the new combinations', async () => {
        const user = userEvent.setup()
        renderForm()

        await addAxis(user, 'Size', ['S'])
        expect(await screen.findByLabelText('Quantity for S')).toBeInTheDocument()

        await addAxis(user, '', ['M'])
        expect(await screen.findByLabelText('Quantity for M')).toBeInTheDocument()
        expect(screen.getByLabelText('Quantity for S')).toBeInTheDocument()
    })

    it('removing a variant removes its combinations', async () => {
        // This is the one that genuinely failed before: `splice` on a shallow
        // copy left `updateInventoryKeys` reading the pre-removal array, so the
        // combinations the removed axis generated stayed in the inventory map.
        const user = userEvent.setup()
        renderForm()

        await addAxis(user, 'Size', ['S', 'M'])
        await user.click(screen.getByRole('button', { name: /add variant/i }))
        await addAxis(user, 'Colour', ['Red'])

        await screen.findByLabelText('Quantity for S / Red')

        await user.click(screen.getByRole('button', { name: /remove variant colour/i }))

        await waitFor(() => expect(screen.queryByLabelText('Quantity for S / Red')).toBeNull())
        expect(screen.getByLabelText('Quantity for S')).toBeInTheDocument()
        expect(screen.getByLabelText('Quantity for M')).toBeInTheDocument()
    })

    it('removing an option removes only that option\'s combinations', async () => {
        const user = userEvent.setup()
        renderForm()

        await addAxis(user, 'Size', ['S', 'M'])
        await screen.findByLabelText('Quantity for M')

        await user.click(screen.getByRole('button', { name: /remove option M/i }))

        await waitFor(() => expect(screen.queryByLabelText('Quantity for M')).toBeNull())
        expect(screen.getByLabelText('Quantity for S')).toBeInTheDocument()
    })

    it('quantities survive an unrelated edit', async () => {
        const user = userEvent.setup()
        renderForm()

        await addAxis(user, 'Size', ['S'])
        const quantity = await screen.findByLabelText('Quantity for S')
        await user.type(quantity, '7')
        expect(quantity).toHaveValue(7)

        // Editing the brand must not disturb the matrix.
        await user.type(screen.getByLabelText(/brand/i), 'Netronix')
        expect(screen.getByLabelText('Quantity for S')).toHaveValue(7)
    })

    it('a quantity is keyed by canonical identity, so hyphenated rows stay distinct', async () => {
        const user = userEvent.setup()
        renderForm()

        await addAxis(user, 'Size', ['16-inch'])
        await user.click(screen.getByRole('button', { name: /add variant/i }))
        await addAxis(user, 'Storage', ['1TB'])

        expect(await screen.findByLabelText('Quantity for 16-inch / 1TB')).toBeInTheDocument()
    })
})

describe('the form submits what the matrix currently holds', () => {
    it('exposes every image picker to keyboard and assistive technology', () => {
        renderForm()
        for (let slot = 1; slot <= 4; slot += 1) {
            const input = screen.getByLabelText(`Choose product image ${slot}`)
            expect(input).toHaveAttribute('type', 'file')
            expect(input).toHaveClass('sr-only')
            expect(input).not.toHaveClass('hidden')
            expect(input).not.toHaveAttribute('tabindex', '-1')
            input.focus()
            expect(input).toHaveFocus()
        }
    })

    it('adds a product with no variant axes and one default stock quantity', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ onSubmit: async (payload) => { submitted = payload } })

        await user.click(screen.getByRole('button', { name: /remove variant 1/i }))
        await user.type(screen.getByLabelText(/product name/i), 'Variantless Mouse Pad')
        await user.type(screen.getByLabelText(/product description/i), 'One stock pool.')
        await user.type(screen.getByLabelText(/product price/i), '25')
        await user.click(screen.getByRole('button', { name: 'Accessories' }))
        await user.type(screen.getByLabelText('Quantity for Default'), '12')
        await user.click(screen.getByRole('button', { name: /add product/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.variants).toEqual([])
        expect(submitted.inventoryV2).toEqual([{ options: {}, quantity: 12 }])
        expect(submitted.inventory).toEqual({ '': 12 })
    })

    it('sends only the combinations that still exist, in both representations', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ onSubmit: async (payload) => { submitted = payload } })

        await user.type(screen.getByLabelText(/product name/i), 'Test Laptop')
        await user.type(screen.getByLabelText(/product description/i), 'A description.')
        await user.type(screen.getByLabelText(/product price/i), '1999')
        await user.click(screen.getByRole('button', { name: 'Laptops' }))

        await addAxis(user, 'Size', ['S', 'M'])
        await user.type(await screen.findByLabelText('Quantity for S'), '3')

        await user.click(screen.getByRole('button', { name: /remove option M/i }))
        await waitFor(() => expect(screen.queryByLabelText('Quantity for M')).toBeNull())

        await user.click(screen.getByRole('button', { name: /add product/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.inventoryV2).toEqual([{ options: { Size: 'S' }, quantity: 3 }])
        // A removed combination is *absent*, not set to zero — which is what
        // makes pruning correct rather than merely tidy.
        expect(submitted.inventory).toEqual({ S: 3 })
        expect(submitted.tags).toEqual(['Laptops'])
    })

    it('refuses a bad price before anything is sent (ADM-009)', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ onSubmit: async (payload) => { submitted = payload } })

        await user.type(screen.getByLabelText(/product name/i), 'Cheap')
        await user.type(screen.getByLabelText(/product description/i), 'A description.')
        await user.type(screen.getByLabelText(/product price/i), '-10')
        await user.click(screen.getByRole('button', { name: /add product/i }))

        await waitFor(() => expect(submitted).toBeNull())
    })

    it('requires at least one tag', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ onSubmit: async (payload) => { submitted = payload } })

        await user.type(screen.getByLabelText(/product name/i), 'Untagged')
        await user.type(screen.getByLabelText(/product description/i), 'A description.')
        await user.type(screen.getByLabelText(/product price/i), '99')
        await addAxis(user, 'Size', ['S'])
        await user.click(screen.getByRole('button', { name: /add product/i }))

        await waitFor(() => expect(submitted).toBeNull())
    })
})

describe('the form is shared by Add and Edit (ADM-002)', () => {
    const existing = {
        _id: '680897a3a9a5ffb06b2e52c8',
        name: 'Existing Laptop',
        description: 'Already in the catalog.',
        price: 1999,
        brand: 'Netronix',
        bestSeller: true,
        tags: ['Laptops'],
        image: ['https://cdn.test/one.png'],
        variants: [{ name: 'Size', options: ['14-inch', '16-inch'] }],
        inventoryV2: [
            { variantId: 'Size=14-inch', options: { Size: '14-inch' }, quantity: 2 },
            { variantId: 'Size=16-inch', options: { Size: '16-inch' }, quantity: 5 },
        ],
        showcase: [{ slot: 'featured', order: 0 }],
    }

    it('loads an existing product into every field', async () => {
        renderForm({ mode: 'edit', product: existing })

        expect(screen.getByLabelText(/product name/i)).toHaveValue('Existing Laptop')
        expect(screen.getByLabelText(/product price/i)).toHaveValue(1999)
        expect(screen.getByLabelText(/brand/i)).toHaveValue('Netronix')
        expect(screen.getByLabelText('Quantity for 14-inch')).toHaveValue(2)
        expect(screen.getByLabelText('Quantity for 16-inch')).toHaveValue(5)
    })

    it('edits a variantless product without inventing an axis or losing stock', async () => {
        const user = userEvent.setup()
        let submitted = null
        const variantless = {
            ...existing,
            name: 'Simple Cable',
            variants: [],
            inventoryV2: [{ variantId: '', options: {}, quantity: 9 }],
            inventory: { '': 9 },
        }
        renderForm({ mode: 'edit', product: variantless, onSubmit: async (payload) => { submitted = payload } })

        expect(screen.queryByLabelText(/variant 1 name/i)).toBeNull()
        expect(screen.getByLabelText('Quantity for Default')).toHaveValue(9)
        await user.type(screen.getByLabelText(/brand/i), ' updated')
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.variants).toEqual([])
        expect(submitted.inventoryV2).toEqual([{ options: {}, quantity: 9 }])
        expect(submitted.inventory).toEqual({ '': 9 })
    })

    it('derives typed quantities from a legacy inventory-only product on unrelated edit', async () => {
        const user = userEvent.setup()
        let submitted = null
        const legacyOnly = {
            ...existing,
            name: 'Legacy Colour Cable',
            variants: [],
            inventoryV2: undefined,
            inventory: { Black: 5, White: 3 },
        }
        renderForm({ mode: 'edit', product: legacyOnly, onSubmit: async (payload) => { submitted = payload } })

        expect(screen.getByLabelText('Quantity for Black')).toHaveValue(5)
        expect(screen.getByLabelText('Quantity for White')).toHaveValue(3)
        await user.type(screen.getByLabelText(/brand/i), ' updated')
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.variants).toEqual([{ name: 'Option', options: ['Black', 'White'] }])
        expect(submitted.inventoryV2).toEqual([
            { options: { Option: 'Black' }, quantity: 5 },
            { options: { Option: 'White' }, quantity: 3 },
        ])
        expect(submitted.inventory).toEqual({ Black: 5, White: 3 })
    })

    it('preserves unresolved and orphaned legacy stock during an unrelated edit', async () => {
        const user = userEvent.setup()
        let submitted = null
        const unresolved = {
            ...existing,
            name: 'Ambiguous legacy laptop',
            variants: [
                { name: 'Size', options: ['16-inch', '16'] },
                { name: 'Storage', options: ['1TB', 'inch-1TB'] },
            ],
            inventoryV2: undefined,
            inventory: { '16-inch-1TB': 7, retired: 4 },
        }
        renderForm({ mode: 'edit', product: unresolved, onSubmit: async (payload) => { submitted = payload } })

        await user.type(screen.getByLabelText(/brand/i), ' updated')
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted).not.toHaveProperty('variants')
        expect(submitted).not.toHaveProperty('inventory')
        expect(submitted).not.toHaveProperty('inventoryV2')
    })

    it('preserves needsReview metadata during an unrelated edit', async () => {
        const user = userEvent.setup()
        let submitted = null
        const unresolved = {
            ...existing,
            variants: [{ name: 'Size', options: ['16-inch'] }],
            inventory: { '16-inch': 7, retired: 4 },
            inventoryV2: [{
                variantId: 'Size=16-inch', legacyKey: '16-inch',
                options: { Size: '16-inch' }, quantity: 0, needsReview: true,
            }],
        }
        renderForm({ mode: 'edit', product: unresolved, onSubmit: async (payload) => { submitted = payload } })

        await user.type(screen.getByLabelText(/brand/i), ' updated')
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted).not.toHaveProperty('variants')
        expect(submitted).not.toHaveProperty('inventory')
        expect(submitted).not.toHaveProperty('inventoryV2')
    })

    it('fails closed when variant edits would discard unresolved legacy stock', async () => {
        const user = userEvent.setup()
        let submitted = null
        const unresolved = {
            ...existing,
            variants: [
                { name: 'Size', options: ['16-inch', '16'] },
                { name: 'Storage', options: ['1TB', 'inch-1TB'] },
            ],
            inventoryV2: undefined,
            inventory: { '16-inch-1TB': 7, retired: 4 },
        }
        renderForm({ mode: 'edit', product: unresolved, onSubmit: async (payload) => { submitted = payload } })

        await user.click(screen.getByRole('button', { name: /remove option inch-1TB/i }))
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).toBeNull())
    })

    it('shows legacy inventory details and submits an explicitly acknowledged resolution', async () => {
        const user = userEvent.setup()
        let submitted = null
        const unresolved = {
            ...existing,
            variants: [
                { name: 'Size', options: ['16-inch', '16'] },
                { name: 'Storage', options: ['1TB', 'inch-1TB'] },
            ],
            inventoryV2: undefined,
            inventory: { '16-inch-1TB': 7, retired: 4 },
        }
        renderForm({ mode: 'edit', product: unresolved, onSubmit: async (payload) => { submitted = payload } })

        const review = screen.getByRole('alert')
        expect(review).toHaveTextContent(/16-inch-1TB/)
        expect(review).toHaveTextContent(/retired/)
        expect(review).toHaveTextContent(/needs review/i)

        await user.click(screen.getByRole('button', { name: /resolve legacy inventory/i }))
        await user.clear(screen.getByLabelText('Quantity for 16-inch / 1TB'))
        await user.type(screen.getByLabelText('Quantity for 16-inch / 1TB'), '6')
        await user.click(screen.getByRole('checkbox', { name: /submitted quantities replace unresolved entries.*orphan keys.*removed/i }))
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.inventoryResolution).toBe('resolve')
        expect(submitted.inventoryV2).toContainEqual({
            options: { Size: '16-inch', Storage: '1TB' }, quantity: 6,
        })
        expect(submitted.inventory).not.toHaveProperty('retired')
    })

    it('cancels resolution without replacing unresolved inventory', async () => {
        const user = userEvent.setup()
        let submitted = null
        const unresolved = {
            ...existing,
            variants: [{ name: 'Size', options: ['16-inch'] }],
            inventory: { '16-inch': 7, retired: 4 },
            inventoryV2: [{
                variantId: 'Size=16-inch', legacyKey: '16-inch',
                options: { Size: '16-inch' }, quantity: 0, needsReview: true,
            }],
        }
        renderForm({ mode: 'edit', product: unresolved, onSubmit: async (payload) => { submitted = payload } })

        await user.click(screen.getByRole('button', { name: /resolve legacy inventory/i }))
        await user.clear(screen.getByLabelText('Quantity for 16-inch'))
        await user.type(screen.getByLabelText('Quantity for 16-inch'), '9')
        await user.click(screen.getByRole('button', { name: /cancel resolution/i }))
        expect(screen.getByLabelText('Quantity for 16-inch')).toHaveValue(0)

        await user.type(screen.getByLabelText(/brand/i), ' updated')
        await user.click(screen.getByRole('button', { name: /save changes/i }))
        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted).not.toHaveProperty('inventoryResolution')
        expect(submitted).not.toHaveProperty('inventoryV2')
        expect(submitted).not.toHaveProperty('inventory')
    })

    it('preserves acknowledged resolution values when submission reports failure', async () => {
        const user = userEvent.setup()
        const unresolved = {
            ...existing,
            variants: [{ name: 'Size', options: ['16-inch'] }],
            inventory: { '16-inch': 7, retired: 4 },
            inventoryV2: [{
                variantId: 'Size=16-inch', legacyKey: '16-inch',
                options: { Size: '16-inch' }, quantity: 0, needsReview: true,
            }],
        }
        renderForm({ mode: 'edit', product: unresolved, onSubmit: async () => ({ success: false }) })

        await user.click(screen.getByRole('button', { name: /resolve legacy inventory/i }))
        const quantity = screen.getByLabelText('Quantity for 16-inch')
        await user.clear(quantity)
        await user.type(quantity, '11')
        const acknowledgement = screen.getByRole('checkbox', { name: /submitted quantities replace unresolved entries.*orphan keys.*removed/i })
        await user.click(acknowledgement)
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        expect(quantity).toHaveValue(11)
        expect(acknowledgement).toBeChecked()
        expect(screen.getByRole('button', { name: /cancel resolution/i })).toBeInTheDocument()
    })

    it('keeps the existing images when no file is chosen', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ mode: 'edit', product: existing, onSubmit: async (p) => { submitted = p } })

        await user.type(screen.getByLabelText(/product name/i), ' Renamed')
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        // No files and nothing cleared: the server keeps the URLs it has.
        expect(submitted.imageFiles).toEqual({})
        expect(submitted.clearImages).toEqual([])
        expect(submitted.name).toBe('Existing Laptop Renamed')
    })

    it('names a cleared image slot explicitly, since absent means "leave alone"', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ mode: 'edit', product: existing, onSubmit: async (p) => { submitted = p } })

        await user.click(screen.getByRole('button', { name: /remove image 1/i }))
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.clearImages).toEqual([1])
    })

    it('keeps the image remove button outside the file-input label', () => {
        renderForm({ mode: 'edit', product: existing })
        const remove = screen.getByRole('button', { name: /remove image 1/i })
        expect(remove.closest('label')).toBeNull()
        expect(document.querySelector('label[for="image1"]')).not.toContainElement(remove)
    })

    it('carries the showcase assignments, so the homepage is administrable (FE-004)', async () => {
        const user = userEvent.setup()
        let submitted = null
        renderForm({ mode: 'edit', product: existing, onSubmit: async (p) => { submitted = p } })

        await user.click(screen.getByRole('button', { name: 'hero-video' }))
        await user.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(submitted).not.toBeNull())
        expect(submitted.showcase.map((entry) => entry.slot)).toEqual(['featured', 'hero-video'])
    })

    it('Add and Edit both render this component and declare no form of their own', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')

        for (const file of ['pages/Add.jsx', 'pages/Edit.jsx']) {
            const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')
            expect(source, file).toMatch(/from '\.\.\/components\/ProductForm'/)
            expect(source, file).not.toMatch(/generateVariantCombinations|updateInventoryKeys/)
        }
    })
})

describe('the upload and price rules, stated once', () => {
    it('rejects a wrong type and an oversized file', () => {
        expect(describeImageProblem(new File(['x'], 'doc.pdf', { type: 'application/pdf' })))
            .toMatch(/not a PNG, JPEG or WebP/)
        const huge = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
        expect(describeImageProblem(huge)).toMatch(/the limit is 5 MB/)
        expect(describeImageProblem(new File(['x'], 'fine.png', { type: 'image/png' }))).toBeNull()
    })

    it('rejects every non-positive or non-numeric price', () => {
        expect(describePriceProblem('-10')).toMatch(/greater than zero/i)
        expect(describePriceProblem('0')).toMatch(/greater than zero/i)
        expect(describePriceProblem('lots')).toMatch(/greater than zero/i)
        expect(describePriceProblem('')).toMatch(/greater than zero/i)
        expect(describePriceProblem('199.99')).toBeNull()
    })
})
