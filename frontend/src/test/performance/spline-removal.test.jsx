// PERF-001 / PERF-006 / PERF-008 / FE-026 — the unused Spline runtime.
//
// The finding is not "the hero should go". The hero is an <iframe> to
// my.spline.design and it stays one. What shipped alongside it was a React
// component import that no line of JSX ever referenced, an injected
// unpkg.com viewer script with no <spline-viewer> element to consume it, and a
// tracked 636 kB `scene.splinecode` that nothing loaded. Vite bundled the
// entire @splinetool runtime for the import — physics (1,988 kB raw),
// opentype, navmesh, howler, gaussian-splat-compression — none of which ever
// executed.
//
// These are source and manifest assertions rather than render assertions
// because the defect is a build-output one: a component test cannot see a
// chunk. The hero's own rendering is covered below and in the reduced-motion
// suite.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relative) => readFileSync(join(root, relative), 'utf8')

/**
 * Comments are stripped before matching. These checks are about what the code
 * *does*; a comment explaining why the Spline runtime was removed naturally
 * contains the word, and a check that fails on its own explanation is a check
 * that discourages writing one.
 */
const stripComments = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every authored source file, excluding tests and the e2e harness. */
function sourceFiles(dir = join(root, 'src'), found = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'test' || entry.name === 'assets') continue
            sourceFiles(path, found)
        } else if (/\.(js|jsx)$/.test(entry.name)) {
            found.push(path)
        }
    }
    return found
}

describe('PERF-001 — the unused Spline runtime is gone', () => {
    it('declares no @splinetool dependency', () => {
        const pkg = JSON.parse(read('package.json'))
        const declared = { ...pkg.dependencies, ...pkg.devDependencies }
        for (const name of Object.keys(declared)) {
            expect(name.startsWith('@splinetool'), `${name} is still declared`).toBe(false)
        }
    })

    it('imports no @splinetool package anywhere in src/', () => {
        for (const file of sourceFiles()) {
            expect(stripComments(readFileSync(file, 'utf8')), file).not.toMatch(/@splinetool/)
        }
    })

    it('injects no third-party viewer script', () => {
        for (const file of sourceFiles()) {
            const source = stripComments(readFileSync(file, 'utf8'))
            expect(source, file).not.toMatch(/unpkg\.com/)
            expect(source, file).not.toMatch(/spline-viewer/)
        }
    })

    it('no longer tracks the unreferenced scene.splinecode', () => {
        expect(existsSync(join(root, 'src/assets/scene.splinecode'))).toBe(false)
    })

    it('keeps the hero iframe — the experience itself is preserved', () => {
        const hero = read('src/components/Hero.jsx')
        expect(hero).toMatch(/my\.spline\.design/)
        expect(hero).toMatch(/<iframe/)
    })
})

describe('PERF-006 — duplicate libraries are gone', () => {
    const pkg = JSON.parse(read('package.json'))
    const declared = { ...pkg.dependencies, ...pkg.devDependencies }

    // `motion` and `framer-motion` are the same library published under two
    // names; `react-hot-toast` and `react-toastify` are two toast libraries.
    // Only one of each pair was ever imported.
    it.each(['motion', 'react-hot-toast'])('does not declare %s', (name) => {
        expect(declared[name]).toBeUndefined()
    })

    it.each(['framer-motion', 'react-toastify'])('keeps the one that is used: %s', (name) => {
        expect(declared[name]).toBeDefined()
    })

    it.each(['motion', 'react-hot-toast'])('imports %s nowhere in src/', (name) => {
        for (const file of sourceFiles()) {
            const source = stripComments(readFileSync(file, 'utf8'))
            expect(source, `${file} imports ${name}`).not.toMatch(
                new RegExp(`from\\s+['"]${name}['"]`),
            )
        }
    })
})

describe('the hero still renders — ordinary motion', () => {
    it('mounts the Spline iframe, titled, with the React prop spelling', async () => {
        const { render, screen } = await import('@testing-library/react')
        const { MemoryRouter } = await import('react-router-dom')
        const { default: Hero } = await import('../../components/Hero.jsx')

        render(<MemoryRouter><Hero /></MemoryRouter>)

        const frame = screen.getByTitle(/3D robot scene/i)
        expect(frame.tagName).toBe('IFRAME')
        expect(frame.getAttribute('src')).toMatch(/my\.spline\.design/)
        // `frameborder` (lowercase) is not a React prop; React passed it
        // straight through and ESLint flagged it as react/no-unknown-property.
        expect(frame.getAttribute('frameborder')).toBe('0')
    })
})
