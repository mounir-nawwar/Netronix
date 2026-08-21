import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAdminSession } from '../../lib/useAdminSession.js'

const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

const adminResponse = (id) => ({
    data: { success: true, admin: { id, role: 'admin', name: id } },
})

describe('admin session verification ordering', () => {
    it('ignores a verification success that arrives after logout', async () => {
        localStorage.setItem('token', 'old-token')
        const pending = deferred()
        const client = {
            get: vi.fn(() => pending.promise),
            post: vi.fn().mockResolvedValue({ data: { success: true } }),
        }
        const { result } = renderHook(() => useAdminSession(client))
        await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1))

        await act(async () => { await result.current.logout() })
        await act(async () => { pending.resolve(adminResponse('old-admin')); await pending.promise })

        expect(result.current.token).toBe('')
        expect(result.current.session).toEqual({ status: 'signed-out', admin: null })
        expect(localStorage.getItem('token')).toBeNull()
    })

    it('ignores stale success and auth failure after a newer verification', async () => {
        localStorage.setItem('token', 'old-token')
        const oldRequest = deferred()
        const newRequest = deferred()
        const client = {
            get: vi.fn()
                .mockReturnValueOnce(oldRequest.promise)
                .mockReturnValueOnce(newRequest.promise),
            post: vi.fn().mockResolvedValue({ data: { success: true } }),
        }
        const { result } = renderHook(() => useAdminSession(client))
        await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1))

        act(() => { result.current.setToken('new-token') })
        await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2))
        await act(async () => { newRequest.resolve(adminResponse('new-admin')); await newRequest.promise })
        await waitFor(() => expect(result.current.session.admin?.id).toBe('new-admin'))

        await act(async () => {
            oldRequest.reject({ response: { status: 401 } })
            await oldRequest.promise.catch(() => {})
        })

        expect(result.current.token).toBe('new-token')
        expect(result.current.session).toEqual({
            status: 'signed-in',
            admin: { id: 'new-admin', role: 'admin', name: 'new-admin' },
        })
        expect(localStorage.getItem('token')).toBe('new-token')
    })
})
