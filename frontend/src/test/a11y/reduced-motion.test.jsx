// A11Y-001 — `prefers-reduced-motion: reduce`, surface by surface.
//
// The audit's measurement was blunt and correct: **zero** occurrences of
// `prefers-reduced-motion` anywhere in the project, on a site whose homepage
// runs a 3D iframe, two counter-rotating marquees, a scroll-reactive
// `requestAnimationFrame` loop, an autoplaying 11.5 MB film and staggered
// entrances on every section.
//
// These are jsdom tests, so they assert the *decisions* — which branch each
// component takes, and what it therefore does or does not request. The visual
// half (the marquee is genuinely still, the film is genuinely not playing) is
// asserted in a real browser in `e2e/reduced-motion.spec.js`.

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Make `matchMedia` answer `true` for the reduced-motion query, or not. */
function setReducedMotion(reduce) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener() { },
        removeListener() { },
        addEventListener() { },
        removeEventListener() { },
        dispatchEvent: () => false,
    }))
}

const withRouter = (ui) => <MemoryRouter>{ui}</MemoryRouter>

describe('the stylesheet carries a reduced-motion block', () => {
    it('declares the global override', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

        expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
        expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
        expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
        expect(css).toMatch(/scroll-behavior:\s*auto\s*!important/)
        // The infinite marquees are paused rather than made instant.
        expect(css).toMatch(/animation-play-state:\s*paused\s*!important/)
    })

    it('routes every framer-motion animation through MotionConfig', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const main = readFileSync(join(process.cwd(), 'src/main.jsx'), 'utf8')
        expect(main).toMatch(/MotionConfig/)
        expect(main).toMatch(/reducedMotion="user"/)
    })
})

describe('Hero', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('renders the Spline iframe for an ordinary-motion visitor', async () => {
        setReducedMotion(false)
        const { default: Hero } = await import('../../components/Hero.jsx')
        render(withRouter(<Hero />))

        expect(screen.getByTitle(/3D robot scene/i)).toBeInTheDocument()
        expect(screen.queryByTestId('hero-static')).toBeNull()
    })

    it('renders a static hero and requests no third-party scene under reduce', async () => {
        setReducedMotion(true)
        const { default: Hero } = await import('../../components/Hero.jsx')
        const { container } = render(withRouter(<Hero />))

        expect(screen.getByTestId('hero-static')).toBeInTheDocument()
        // The point is not that the iframe is hidden — it is that it is never
        // created, so nothing is fetched from my.spline.design at all.
        expect(container.querySelector('iframe')).toBeNull()

        // And it is not a blank section: same headline, same copy, same CTA.
        expect(screen.getByRole('heading', { name: /Next-Gen Tech, Delivered/i })).toBeInTheDocument()
        expect(screen.getByText(/Your gateway to the latest/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /shop now/i })).toBeInTheDocument()
    })
})

describe('ScrollingText', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('animates for an ordinary-motion visitor', async () => {
        setReducedMotion(false)
        const { default: ScrollingText } = await import('../../components/ScrollingText.jsx')
        render(<ScrollingText text="Premium tech" />)
        expect(screen.getByTestId('scrolling-text-track')).toHaveAttribute('data-animating', 'true')
    })

    it('starts no animation loop and no scroll listener under reduce', async () => {
        setReducedMotion(true)
        const added = []
        const realAdd = window.addEventListener.bind(window)
        vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
            added.push(type)
            return realAdd(type, handler, options)
        })
        const raf = vi.spyOn(window, 'requestAnimationFrame')

        const { default: ScrollingText } = await import('../../components/ScrollingText.jsx')
        render(<ScrollingText text="Premium tech" />)

        expect(screen.getByTestId('scrolling-text-track')).toHaveAttribute('data-animating', 'false')
        expect(added.filter((type) => type === 'scroll')).toHaveLength(0)
        expect(raf).not.toHaveBeenCalled()
        expect(screen.getByTestId('scrolling-text-track').style.transform).toBe('translateX(0px)')
    })
})

describe('LogoMarquee', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('applies the marquee animation classes normally', async () => {
        setReducedMotion(false)
        const { default: LogoMarquee } = await import('../../components/LogoMarquee.jsx')
        const { container } = render(<LogoMarquee />)
        expect(container.querySelector('.animate-marquee-left')).not.toBeNull()
        expect(container.querySelector('.animate-marquee-right')).not.toBeNull()
    })

    it('uses duplicated max-content tracks and leaves safe vertical room for both tapes', async () => {
        setReducedMotion(false)
        const { default: LogoMarquee } = await import('../../components/LogoMarquee.jsx')
        const { container } = render(<LogoMarquee />)
        const rightTrack = container.querySelector('.animate-marquee-right')
        const leftTrack = container.querySelector('.animate-marquee-left')

        for (const track of [rightTrack, leftTrack]) {
            expect(track).toHaveClass('w-max')
            expect(track.children).toHaveLength(18)
            const sources = [...track.querySelectorAll('img')].map((image) => image.getAttribute('src'))
            expect(sources.slice(0, 9)).toEqual(sources.slice(9))
        }

        const section = rightTrack.closest('section')
        expect(section).toHaveClass('mt-0', 'md:-mt-12')
        expect(section).not.toHaveClass('-mt-6', 'md:-mt-24')
        expect(rightTrack.parentElement).toHaveClass('py-4', 'md:py-8')
        expect(leftTrack.parentElement).toHaveClass('-mt-2', 'md:-mt-4', 'py-4', 'md:py-8')
    })

    it('drops the animation classes under reduce, keeping the logos', async () => {
        setReducedMotion(true)
        const { default: LogoMarquee } = await import('../../components/LogoMarquee.jsx')
        const { container } = render(<LogoMarquee />)

        expect(container.querySelector('.animate-marquee-left')).toBeNull()
        expect(container.querySelector('.animate-marquee-right')).toBeNull()
        // Static, not absent.
        expect(container.querySelectorAll('img').length).toBeGreaterThan(8)
    })
})

describe('HeroVideo', () => {
    beforeEach(() => {
        // jsdom has no media element implementation.
        window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
        window.HTMLMediaElement.prototype.pause = vi.fn()
    })
    afterEach(() => { vi.restoreAllMocks() })

    const renderVideo = async () => {
        const { default: ShopContextProvider } = await import('../../context/ShopContext.jsx')
        const { default: HeroVideo } = await import('../../components/HeroVideo.jsx')
        return render(
            <MemoryRouter>
                <ShopContextProvider><HeroVideo /></ShopContextProvider>
            </MemoryRouter>,
        )
    }

    it('never attaches a source under reduce, and shows the poster instead', async () => {
        setReducedMotion(true)
        const { container } = await renderVideo()

        const video = screen.getByTestId('hero-video')
        expect(video).toHaveAttribute('preload', 'metadata')

        // PERF-002 — the poster is itself deferred until the section is near
        // the viewport (it is 71 kB, and the band is far below the fold), so it
        // arrives on the observer callback rather than on the first render.
        await waitFor(() => expect(video.getAttribute('poster')).toMatch(/netronix-product-video-poster\.jpg$/))

        // The sources, though, are never attached under reduce — the observer
        // has fired by now and still nothing was requested.
        expect(video).toHaveAttribute('data-loaded', 'false')
        expect(container.querySelectorAll('source')).toHaveLength(0)
        expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled()

        // A working control, not a dead one.
        expect(screen.getByRole('button', { name: /play the product film/i })).toBeInTheDocument()
    })

    it('carries no autoplay attribute at all — playback is a decision, not markup', async () => {
        setReducedMotion(false)
        await renderVideo()
        const video = screen.getByTestId('hero-video')
        expect(video.hasAttribute('autoplay')).toBe(false)
        // PERF-002 — `loading="lazy"` on a <video> does nothing; it is gone.
        expect(video.hasAttribute('loading')).toBe(false)
    })
})
