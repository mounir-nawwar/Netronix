import { act, render, waitFor } from '@testing-library/react'
import { useContext } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import ShopContextProvider from '../../context/ShopContext.jsx'
import { ShopContext } from '../../context/shopContext.js'
import { BACKEND_URL, makeProduct, setCatalog, setServerCart } from '../msw/handlers.js'
import { server } from '../msw/server.js'

const PRODUCT = '5eed00000000000000000301'
const accessory = makeProduct({ _id: PRODUCT, variants: [], inventory: { '': 10 } })

function renderProvider() {
    let captured
    function Probe() {
        captured = useContext(ShopContext)
        return null
    }
    render(<MemoryRouter><ShopContextProvider><Probe /></ShopContextProvider></MemoryRouter>)
    return () => captured
}

describe('optimistic cart reconciliation', () => {
    it('a late failed line cannot erase a later successful different line', async () => {
        const OTHER = '5eed00000000000000000302'
        setCatalog([accessory, { ...accessory, _id: OTHER, name: 'Other accessory' }])
        localStorage.setItem('token', 'a-token')
        let releaseFailure
        server.use(http.post(`${BACKEND_URL}/api/cart/add`, async ({ request }) => {
            const body = await request.json()
            if (body.itemId === PRODUCT) {
                await new Promise((resolve) => { releaseFailure = resolve })
                return HttpResponse.json({ success: false, message: 'late failure' }, { status: 503 })
            }
            return HttpResponse.json({ success: true })
        }))

        const context = renderProvider()
        await waitFor(() => expect(context()?.products).toHaveLength(2))
        await waitFor(() => expect(context()?.token).toBe('a-token'))

        const failed = context().addToCart(PRODUCT, { variantOptions: {} }, 1)
        const succeeded = context().addToCart(OTHER, { variantOptions: {} }, 1)
        await succeeded
        releaseFailure()
        await failed

        await waitFor(() => expect(context().cartItems[OTHER]).toEqual({ '': 1 }))
        expect(context().cartItems[PRODUCT]).toBeUndefined()
    })

    it.each([
        ['first fails', [false, true], 1],
        ['second fails', [true, false], 1],
        ['both fail', [false, false], 0],
    ])('same-line adds reconcile with the server when %s', async (unused, outcomes, expected) => {
        setCatalog([accessory])
        localStorage.setItem('token', 'a-token')
        let releaseFirst
        let calls = 0
        server.use(http.post(`${BACKEND_URL}/api/cart/add`, async () => {
            const call = calls++
            if (call === 0) {
                await new Promise((resolve) => { releaseFirst = resolve })
            }
            return outcomes[call]
                ? HttpResponse.json({ success: true })
                : HttpResponse.json({ success: false, message: 'failed add' }, { status: 503 })
        }))

        const context = renderProvider()
        await waitFor(() => expect(context()?.products).toHaveLength(1))
        await waitFor(() => expect(context()?.token).toBe('a-token'))

        let first
        let second
        act(() => {
            first = context().addToCart(PRODUCT, { variantOptions: {} }, 1)
            second = context().addToCart(PRODUCT, { variantOptions: {} }, 1)
        })
        await waitFor(() => expect(calls).toBe(1))
        expect(context().cartItems[PRODUCT]).toEqual({ '': 2 })
        releaseFirst()
        await Promise.all([first, second])

        await waitFor(() => {
            if (expected === 0) expect(context().cartItems[PRODUCT]).toBeUndefined()
            else expect(context().cartItems[PRODUCT]).toEqual({ '': expected })
        })
    })

    it.each([
        ['first fails', [false, true], 3],
        ['second fails', [true, false], 2],
        ['both fail', [false, false], 1],
    ])('same-line absolute updates reconcile without overwriting later values when %s', async (unused, outcomes, expected) => {
        setCatalog([accessory])
        setServerCart({ [PRODUCT]: { '': 1 } })
        localStorage.setItem('token', 'a-token')
        let releaseFirst
        let calls = 0
        server.use(http.post(`${BACKEND_URL}/api/cart/update`, async () => {
            const call = calls++
            if (call === 0) {
                await new Promise((resolve) => { releaseFirst = resolve })
            }
            return outcomes[call]
                ? HttpResponse.json({ success: true })
                : HttpResponse.json({ success: false, message: 'failed update' }, { status: 503 })
        }))

        const context = renderProvider()
        await waitFor(() => expect(context()?.cartItems[PRODUCT]).toEqual({ '': 1 }))

        let first
        let second
        act(() => {
            first = context().updateQuantity(PRODUCT, '', 2)
            second = context().updateQuantity(PRODUCT, '', 3)
        })
        await waitFor(() => expect(calls).toBe(1))
        expect(context().cartItems[PRODUCT]).toEqual({ '': 3 })
        releaseFirst()
        await Promise.all([first, second])

        await waitFor(() => expect(context().cartItems[PRODUCT]).toEqual({ '': expected }))
    })

    it('does not restore a previous customer cart when a request settles after logout', async () => {
        setCatalog([accessory])
        localStorage.setItem('token', 'a-token')
        let releaseAdd
        server.use(http.post(`${BACKEND_URL}/api/cart/add`, async () => {
            await new Promise((resolve) => { releaseAdd = resolve })
            return HttpResponse.json({ success: true })
        }))

        const context = renderProvider()
        await waitFor(() => expect(context()?.products).toHaveLength(1))
        await waitFor(() => expect(context()?.token).toBe('a-token'))

        const pending = context().addToCart(PRODUCT, { variantOptions: {} }, 1)
        await waitFor(() => expect(releaseAdd).toBeTypeOf('function'))
        await context().logout()
        await waitFor(() => expect(context().cartItems).toEqual({}))

        releaseAdd()
        await pending
        await waitFor(() => expect(context().cartItems).toEqual({}))
        expect(localStorage.getItem('guestCart')).toBeNull()
        expect(localStorage.getItem('guestCartLines')).toBeNull()
    })
})
