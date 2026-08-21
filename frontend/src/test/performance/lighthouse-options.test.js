import { describe, expect, it } from 'vitest'

import {
    assertApiHealthy, assertLighthousePageHealthy, guestCartFixture, normaliseLighthouseOptions,
} from '../../../scripts/lighthouse-options.mjs'

describe('Lighthouse gate options', () => {
    it('requires the documented five runs and always includes mobile', () => {
        expect(normaliseLighthouseOptions({})).toEqual({
            runs: 5,
            formFactors: ['mobile', 'desktop'],
        })
        expect(normaliseLighthouseOptions({ LH_RUNS: '3' })).toEqual({
            runs: 5,
            formFactors: ['mobile', 'desktop'],
        })
        expect(() => normaliseLighthouseOptions({ LH_FORM_FACTORS: 'desktop' }))
            .toThrow(/mobile/i)
    })

    it('rejects unknown or empty form-factor selections instead of passing an empty gate', () => {
        expect(() => normaliseLighthouseOptions({ LH_FORM_FACTORS: '' })).toThrow(/form factor/i)
        expect(() => normaliseLighthouseOptions({ LH_FORM_FACTORS: 'moblie' })).toThrow(/unknown/i)
    })

    it('fails before scoring when the seeded API is unavailable or CORS is wrong', async () => {
        const unavailable = async () => { throw new Error('connection refused') }
        await expect(assertApiHealthy('http://api.test', 'http://shop.test', unavailable))
            .rejects.toThrow(/seeded API.*unavailable/i)

        const missingCors = async () => new Response('{}', { status: 200 })
        await expect(assertApiHealthy('http://api.test', 'http://shop.test', missingCors))
            .rejects.toThrow(/CORS/i)
    })

    it('rejects a Lighthouse report that scored an API error state', () => {
        const lhr = {
            audits: {
                'errors-in-console': {
                    details: {
                        items: [{ description: 'GET http://api.test/api/product/list net::ERR_CONNECTION_REFUSED' }],
                    },
                },
            },
        }
        expect(() => assertLighthousePageHealthy(lhr, 'http://api.test')).toThrow(/API error state/i)
    })

    it('builds a non-empty legacy guest cart from a seeded in-stock product', () => {
        expect(guestCartFixture({
            _id: 'product-1',
            inventory: [
                { legacyKey: '16 GB-Black', quantity: 0 },
                { legacyKey: '32 GB-Black', quantity: 4 },
            ],
        })).toEqual({ 'product-1': { '32 GB-Black': 1 } })
        expect(() => guestCartFixture({
            _id: 'sold-out',
            inventory: [{ legacyKey: 'default', quantity: 0 }],
        })).toThrow(/in-stock/i)
    })
})
