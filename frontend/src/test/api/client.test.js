// PHASE 3 — the storefront HTTP layer (FE-006, FE-008, BE-009, SEC-010).

import { describe, it, expect } from 'vitest'

import { ApiError, normalisePage, toApiError } from '../../api/client.js'

describe('normalisePage — one shape, whichever the server sent (BE-009)', () => {
    const items = [{ _id: 'a' }, { _id: 'b' }]

    it('reads the additive envelope', () => {
        expect(normalisePage(
            { success: true, products: items, items, total: 2, page: 1, pages: 1, limit: 100 },
            'products',
        )).toEqual({ items, total: 2, page: 1, pages: 1, limit: 100, metadataValid: true })
    })

    it('reads the legacy named array a deployed client still relies on', () => {
        // Phase 2 kept the array under its old name and added the paging fields
        // beside it. Dropping the named field server-side is a later step, so
        // this path has to keep working.
        expect(normalisePage({ success: true, products: items }, 'products'))
            .toEqual({ items, total: 2, page: 1, pages: 1, limit: 2, metadataValid: false })
    })

    it('normalises both envelopes to exactly the same result', () => {
        const legacy = normalisePage({ success: true, orders: items }, 'orders')
        const additive = normalisePage(
            { success: true, orders: items, items, total: 2, page: 1, pages: 1, limit: 2 },
            'orders',
        )
        // Additive has valid metadata, legacy does not
        expect({ ...legacy, metadataValid: true }).toEqual(additive)
    })

    it('accepts a bare array from an older deployment', () => {
        expect(normalisePage(items, 'products'))
            .toEqual({ items, total: 2, page: 1, pages: 1, limit: 2, metadataValid: false })
    })

    it('derives the page count when the server does not send one', () => {
        expect(normalisePage({ products: items, total: 25, limit: 10 }, 'products').pages).toBe(3)
    })

    it('produces an empty page rather than throwing on nonsense', () => {
        expect(normalisePage(null, 'products').items).toEqual([])
        expect(normalisePage({ success: false }, 'products').items).toEqual([])
    })
})

describe('toApiError — a message a person can read (SEC-010)', () => {
    it('prefers the server\'s own message', () => {
        const error = toApiError({ response: { status: 409, data: { message: 'Not enough stock' } } })
        expect(error).toBeInstanceOf(ApiError)
        expect(error.message).toBe('Not enough stock')
        expect(error.status).toBe(409)
    })

    it('never shows axios\'s internal wording', () => {
        // Fifteen call sites did `toast.error(error.message)`, which put
        // "Request failed with status code 500" in front of a customer.
        const error = toApiError({
            message: 'Request failed with status code 500',
            response: { status: 500, data: {} },
        })
        expect(error.message).not.toMatch(/status code/)
        expect(error.message).toBe('Something went wrong. Please try again.')
    })

    it('names a network failure as one', () => {
        const error = toApiError(new Error('Network Error'))
        expect(error.isNetworkError).toBe(true)
        expect(error.status).toBe(0)
        expect(error.message).toMatch(/could not reach/i)
    })

    it('classifies the statuses callers branch on', () => {
        expect(toApiError({ response: { status: 401, data: {} } }).unauthorized).toBe(true)
        expect(toApiError({ response: { status: 403, data: {} } }).forbidden).toBe(true)
        expect(toApiError({ response: { status: 404, data: {} } }).notFound).toBe(true)
    })

    it('passes an ApiError through unchanged', () => {
        const original = new ApiError('already normalised', { status: 400 })
        expect(toApiError(original)).toBe(original)
    })
})
