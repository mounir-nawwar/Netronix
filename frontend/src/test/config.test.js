// Storefront client configuration (DEVOPS-002, FE-008).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { readClientConfig, ClientConfigError, config, backendUrl } from '../config.js'

describe('readClientConfig: valid configuration', () => {
    it('accepts the required variable on its own', () => {
        expect(readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000' }))
            .toEqual({ backendUrl: 'http://localhost:4000', frontendUrl: undefined })
    })

    it('accepts the optional storefront URL', () => {
        const result = readClientConfig({
            VITE_BACKEND_URL: 'https://api.example.test',
            VITE_FRONTEND_URL: 'https://shop.example.test',
        })
        expect(result.frontendUrl).toBe('https://shop.example.test')
    })

    it('strips trailing slashes so appended paths do not double up', () => {
        expect(readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000/' }).backendUrl)
            .toBe('http://localhost:4000')
        expect(readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000///' }).backendUrl)
            .toBe('http://localhost:4000')
    })

    it('ignores variables outside the schema', () => {
        const result = readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000', VITE_FEATURE_FLAG: 'on' })
        expect(result).not.toHaveProperty('VITE_FEATURE_FLAG')
    })
})

describe('readClientConfig: a missing or invalid variable fails clearly', () => {
    it('names the missing variable instead of producing "undefined/api/..."', () => {
        let error
        try {
            readClientConfig({})
        } catch (caught) {
            error = caught
        }
        expect(error).toBeInstanceOf(ClientConfigError)
        expect(error.problems).toEqual([{ variable: 'VITE_BACKEND_URL', message: 'is required' }])
        expect(error.message).toContain('frontend/.env.example')
    })

    it('treats an empty value as absent', () => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: '' })).toThrow(/is required/)
        expect(() => readClientConfig({ VITE_BACKEND_URL: '   ' })).toThrow(/is required/)
    })

    it('rejects a relative or scheme-less URL', () => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: '/api' })).toThrow(/absolute URL/)
        expect(() => readClientConfig({ VITE_BACKEND_URL: 'localhost:4000' })).toThrow(/http/)
    })

    it('rejects a non-http scheme', () => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: 'ftp://files.example.test' })).toThrow(/http/)
    })
})

describe('no server secret may reach the browser bundle', () => {
    it.each([
        'VITE_JWT_SECRET',
        'VITE_ADMIN_PASSWORD',
        'VITE_GROQ_API_KEY',
        'VITE_MONGODB_URI',
        'VITE_CLOUDINARY_SECRET_KEY',
        'VITE_AWS_ACCESS_KEY_ID',
        'VITE_STRIPE_PRIVATE_KEY',
    ])('refuses to build a configuration containing %s', (variable) => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000', [variable]: 'anything' }))
            .toThrow(/server-only value/)
    })

    it('names the offending variable and never echoes its value', () => {
        let message = ''
        try {
            readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000', VITE_JWT_SECRET: 'hunter2-do-not-print' })
        } catch (error) {
            message = error.message
        }
        expect(message).toContain('VITE_JWT_SECRET')
        expect(message).not.toContain('hunter2-do-not-print')
    })

    it('the live configuration exposes only the backend and storefront URLs', () => {
        expect(Object.keys(config).sort()).toEqual(['backendUrl', 'frontendUrl'])
        expect(backendUrl).toBe('http://localhost:4000')
    })

    it('no source file reads a server-only variable from the client environment', () => {
        // Vite only inlines VITE_-prefixed variables, so the risk is a
        // developer prefixing a secret. This walks the real source tree.
        const root = join(process.cwd(), 'src')
        const offenders = []
        const forbidden = /import\.meta\.env\.VITE_\w*(SECRET|PASSWORD|JWT|MONGO|CLOUDINARY|GROQ|API_KEY|PRIVATE)\w*/i

        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) {
                    if (entry !== 'assets' && entry !== 'node_modules') walk(full)
                } else if (/\.(js|jsx)$/.test(entry) && !full.endsWith('config.test.js')) {
                    const source = readFileSync(full, 'utf8')
                    if (forbidden.test(source)) offenders.push(full)
                }
            }
        }
        walk(root)

        expect(offenders).toEqual([])
    })
})
