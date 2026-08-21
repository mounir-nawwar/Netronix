// Admin console client configuration (DEVOPS-002).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { readClientConfig, ClientConfigError, config, backendUrl, currency } from '../config.js'

describe('readClientConfig: valid configuration', () => {
    it('accepts the required variable', () => {
        expect(readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000' }))
            .toEqual({ backendUrl: 'http://localhost:4000' })
    })

    it('strips trailing slashes so appended paths do not double up', () => {
        expect(readClientConfig({ VITE_BACKEND_URL: 'https://api.example.test/' }).backendUrl)
            .toBe('https://api.example.test')
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
        expect(error.message).toContain('admin/.env.example')
    })

    it('treats an empty value as absent', () => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: '  ' })).toThrow(/is required/)
    })

    it('rejects a relative or scheme-less URL', () => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: '/api' })).toThrow(/absolute URL/)
        expect(() => readClientConfig({ VITE_BACKEND_URL: 'localhost:4000' })).toThrow(/http/)
    })
})

describe('no server secret may reach the console bundle', () => {
    it.each([
        'VITE_JWT_SECRET',
        'VITE_ADMIN_PASSWORD',
        'VITE_ADMIN_EMAIL',
        'VITE_MONGODB_URI',
        'VITE_CLOUDINARY_SECRET_KEY',
        'VITE_OPENAI_API_KEY',
    ])('refuses to build a configuration containing %s', (variable) => {
        expect(() => readClientConfig({ VITE_BACKEND_URL: 'http://localhost:4000', [variable]: 'anything' }))
            .toThrow(/server-only value/)
    })

    it('rejects the admin credentials in particular — the console must never hold them', () => {
        let message = ''
        try {
            readClientConfig({
                VITE_BACKEND_URL: 'http://localhost:4000',
                VITE_ADMIN_PASSWORD: 'do-not-print-this',
            })
        } catch (error) {
            message = error.message
        }
        expect(message).toContain('VITE_ADMIN_PASSWORD')
        expect(message).not.toContain('do-not-print-this')
    })

    it('the live configuration exposes only the backend URL', () => {
        expect(Object.keys(config)).toEqual(['backendUrl'])
        expect(backendUrl).toBe('http://localhost:4000')
        expect(currency).toBe('$')
    })

    it('no source file reads a server-only variable from the client environment', () => {
        const root = join(process.cwd(), 'src')
        const offenders = []
        const forbidden = /import\.meta\.env\.VITE_\w*(SECRET|PASSWORD|JWT|MONGO|CLOUDINARY|OPENAI|API_KEY|PRIVATE|ADMIN_EMAIL)\w*/i

        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) {
                    if (entry !== 'assets' && entry !== 'node_modules') walk(full)
                } else if (/\.(js|jsx)$/.test(entry) && !full.endsWith('config.test.js')) {
                    if (forbidden.test(readFileSync(full, 'utf8'))) offenders.push(full)
                }
            }
        }
        walk(root)

        expect(offenders).toEqual([])
    })
})
