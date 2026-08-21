// FINAL CORRECTION — the storefront cart keeps the combination that was chosen.
//
// A cart line was a number under a hyphen-joined key. For a catalog that really
// contains `["16-inch","16"] × ["1TB","inch-1TB"]` both `16-inch + 1TB` and
// `16 + inch-1TB` produce the key `16-inch-1TB`, so the two combinations were
// **the same line**: adding the second overwrote the first, and `PlaceOrder` had
// to reconstruct the options from the key and refuse when it could not.
//
// The identity is now kept at the point it is known — when the customer selects
// it — as the canonical id and the option pairs themselves. The legacy map is
// still derived for anything that has not been updated.

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useContext } from 'react'
import { MemoryRouter } from 'react-router-dom'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { ShopContext } from '../../context/shopContext.js'
import Cart from '../../pages/Cart.jsx'
import PlaceOrder from '../../pages/PlaceOrder.jsx'
import { makeProduct, setCatalog, placedOrders } from '../msw/handlers.js'
import { canonicalVariantId } from '../../lib/variant.js'

const PRODUCT_ID = '5eed00000000000000000401'

const A = { Screen: '16-inch', Storage: '1TB' }
const B = { Screen: '16', Storage: 'inch-1TB' }
const COLLISION_KEY = '16-inch-1TB'

const COLLIDING = makeProduct({
    _id: PRODUCT_ID,
    name: 'Colliding Laptop',
    variants: [
        { name: 'Screen', options: ['16-inch', '16'] },
        { name: 'Storage', options: ['1TB', 'inch-1TB'] },
    ],
    // Each combination with its own row: the legacy bag cannot express this,
    // which is the same fact seen from the inventory side.
    inventoryV2: [
        { variantId: canonicalVariantId(A), legacyKey: COLLISION_KEY, options: A, quantity: 9 },
        { variantId: canonicalVariantId(B), legacyKey: COLLISION_KEY, options: B, quantity: 9 },
    ],
})

const PLAIN = makeProduct({
    _id: PRODUCT_ID,
    name: 'Plain Laptop',
    variants: [{ name: 'Storage', options: ['1TB', '2TB'] }],
    inventory: { '1TB': 4, '2TB': 4 },
})

const ADDRESS = {
    firstName: 'Demo', lastName: 'Customer', email: 'demo@netronix.test',
    street: '124 Rue Gouraud', city: 'Beirut', state: 'Beirut Governorate',
    zipcode: '02022', country: 'Lebanon', phone: '+961 71 000 000',
}

const renderContext = () => renderHook(() => useContext(ShopContext), {
    wrapper: ({ children }) => (
        <MemoryRouter><ShopContextProvider>{children}</ShopContextProvider></MemoryRouter>
    ),
})

const ready = async (rendered) => {
    await waitFor(() => expect(rendered.result.current.catalogStatus).toBe('ready'))
    return rendered
}

const lineFor = (context, options) =>
    context.cartLines.find((line) => line.variantId === canonicalVariantId(options))

describe('the two colliding combinations are two cart lines', () => {
    beforeEach(() => setCatalog([COLLIDING]))

    it('can both be added, and neither overwrites the other', async () => {
        const { result } = await ready(renderContext())

        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: A }, 2) })
        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: B }, 3) })

        await waitFor(() => expect(result.current.cartLines).toHaveLength(2))
        expect(lineFor(result.current, A).quantity).toBe(2)
        expect(lineFor(result.current, B).quantity).toBe(3)

        // The option pairs themselves, not a re-encoding of them.
        expect(lineFor(result.current, A).variantOptions).toEqual(A)
        expect(lineFor(result.current, B).variantOptions).toEqual(B)

        // The count is the sum of both, not one of them.
        expect(result.current.getCartCount()).toBe(5)
    })

    it('updates and removes one without touching the other', async () => {
        const { result } = await ready(renderContext())

        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: A }, 2) })
        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: B }, 3) })

        await act(async () => {
            await result.current.updateQuantity(PRODUCT_ID, { variantId: canonicalVariantId(A) }, 7)
        })
        await waitFor(() => expect(lineFor(result.current, A).quantity).toBe(7))
        expect(lineFor(result.current, B).quantity).toBe(3)

        await act(async () => {
            await result.current.updateQuantity(PRODUCT_ID, { variantId: canonicalVariantId(A) }, 0)
        })
        await waitFor(() => expect(result.current.cartLines).toHaveLength(1))
        expect(result.current.cartLines[0].variantId).toBe(canonicalVariantId(B))
    })

    it('survives a reload as a guest', async () => {
        const first = await ready(renderContext())
        await act(async () => { await first.result.current.addToCart(PRODUCT_ID, { variantOptions: A }, 1) })
        await act(async () => { await first.result.current.addToCart(PRODUCT_ID, { variantOptions: B }, 4) })
        await waitFor(() => expect(first.result.current.cartLines).toHaveLength(2))

        first.unmount()

        const second = await ready(renderContext())
        await waitFor(() => expect(second.result.current.cartLines).toHaveLength(2))
        expect(lineFor(second.result.current, A).quantity).toBe(1)
        expect(lineFor(second.result.current, B).quantity).toBe(4)
    })

    it('shows both as separate rows in the cart', async () => {
        const { result } = await ready(renderContext())
        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: A }, 1) })
        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: B }, 1) })

        render(<MemoryRouter><ShopContextProvider><Cart /></ShopContextProvider></MemoryRouter>)

        expect(await screen.findByText('Screen: 16-inch, Storage: 1TB')).toBeInTheDocument()
        expect(screen.getByText('Screen: 16, Storage: inch-1TB')).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Remove item' })).toHaveLength(2)
    })
})

describe('checkout submits what was selected', () => {
    it('sends each combination\'s own options, with no reconstruction', async () => {
        setCatalog([COLLIDING])
        const { result } = await ready(renderContext())
        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: A }, 1) })
        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: B }, 2) })

        const user = userEvent.setup()
        render(<MemoryRouter><ShopContextProvider><PlaceOrder /></ShopContextProvider></MemoryRouter>)
        await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument())

        await user.type(screen.getByPlaceholderText('First name'), ADDRESS.firstName)
        await user.type(screen.getByPlaceholderText('Last name'), ADDRESS.lastName)
        await user.type(screen.getByPlaceholderText('Email Address'), ADDRESS.email)
        await user.type(screen.getByPlaceholderText('Street'), ADDRESS.street)
        await user.type(screen.getByPlaceholderText('City'), ADDRESS.city)
        await user.type(screen.getByPlaceholderText('State/Province'), ADDRESS.state)
        await user.type(screen.getByPlaceholderText('Zip/Postal Code'), ADDRESS.zipcode)
        await user.type(screen.getByPlaceholderText('Country'), ADDRESS.country)
        await user.type(screen.getByPlaceholderText('Phone Number'), ADDRESS.phone)
        await user.click(screen.getByRole('button', { name: /place order/i }))

        await waitFor(() => expect(placedOrders).toHaveLength(1))
        const items = placedOrders[0].body.items
        expect(items).toHaveLength(2)

        const sent = items.map((item) => item.variantOptions)
        expect(sent).toContainEqual(A)
        expect(sent).toContainEqual(B)
    })
})

describe('legacy guest carts', () => {
    it('an unambiguous one is read and its options recovered', async () => {
        setCatalog([PLAIN])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { '2TB': 3 } }))

        const { result } = await ready(renderContext())

        await waitFor(() => expect(result.current.cartLines).toHaveLength(1))
        const [line] = result.current.cartLines
        expect(line.quantity).toBe(3)
        expect(line.variantKey).toBe('2TB')
        // A key naming exactly one combination has a unique answer, and
        // recovering a unique answer is not guessing.
        expect(line.variantOptions).toEqual({ Storage: '2TB' })
        expect(line.unresolvable).toBeFalsy()
    })

    it('an ambiguous one is carried, marked, and never given an identity', async () => {
        setCatalog([COLLIDING])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { [COLLISION_KEY]: 2 } }))

        const { result } = await ready(renderContext())

        await waitFor(() => expect(result.current.cartLines).toHaveLength(1))
        const [line] = result.current.cartLines
        expect(line.variantKey).toBe(COLLISION_KEY)
        expect(line.variantId).toBeNull()
        expect(line.variantOptions).toBeNull()
        expect(line.unresolvable).toBe('AMBIGUOUS_VARIANT')
    })

    it('the ambiguous one still blocks checkout and can be removed', async () => {
        setCatalog([COLLIDING])
        localStorage.setItem('guestCart', JSON.stringify({ [PRODUCT_ID]: { [COLLISION_KEY]: 2 } }))

        render(<MemoryRouter><ShopContextProvider><Cart /></ShopContextProvider></MemoryRouter>)

        expect(await screen.findByText(/cannot be identified/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove item' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /proceed to checkout/i })).toBeDisabled()
    })
})

describe('the legacy projection the rest of the app still reads', () => {
    it('mirrors an unambiguous cart exactly', async () => {
        setCatalog([PLAIN])
        const { result } = await ready(renderContext())

        await act(async () => { await result.current.addToCart(PRODUCT_ID, { variantOptions: { Storage: '1TB' } }, 2) })
        await waitFor(() => expect(result.current.cartLines).toHaveLength(1))

        expect(result.current.cartItems).toEqual({ [PRODUCT_ID]: { '1TB': 2 } })
    })

    it('still accepts the old string call signature', async () => {
        setCatalog([PLAIN])
        const { result } = await ready(renderContext())

        await act(async () => { await result.current.addToCart(PRODUCT_ID, '1TB', 1) })

        await waitFor(() => expect(result.current.cartLines).toHaveLength(1))
        expect(result.current.cartLines[0].variantOptions).toEqual({ Storage: '1TB' })
        expect(result.current.cartItems).toEqual({ [PRODUCT_ID]: { '1TB': 1 } })
    })
})
