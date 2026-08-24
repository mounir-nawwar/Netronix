// The footer credit, and the links that went nowhere.
//
// Two separate problems with one shape: the storefront's public chrome made
// claims it could not keep. It credited "Basically Coders", advertised an
// conflicting support email addresses, offered a newsletter box that
// discarded what you typed, offered "English" and "Lebanon (LBP)" switchers
// that switched nothing, linked five social icons at platform home pages (and
// two more at `#`), and told visitors their message had been sent when nothing
// had been sent anywhere.
//
// Every assertion here is about a promise the interface makes. A link that
// goes to `#` is the cheapest possible lie and the easiest to regress, so the
// scans below are deliberately blunt: no `#` targets, at all, in any of these
// five surfaces.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/openMailto.js', () => ({ default: vi.fn() }))

import openMailto from '../../lib/openMailto.js'
import Footer from '../../components/Footer.jsx'
import Hero from '../../components/Hero.jsx'
import NewsLetterBar from '../../components/NewsLetterBar.jsx'
import Testimonials from '../../components/Testimonials.jsx'
import Contact from '../../pages/Contact.jsx'
import BusinessFeatures from '../../components/BusinessFeatures.jsx'
import {
    MINN_FACEBOOK_URL,
    MINN_INSTAGRAM_URL,
    MINN_URL,
    MINN_X_URL,
} from '../../lib/minn.js'
import { SUPPORT_EMAIL } from '../../lib/contact.js'

const withRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

/** Anchors that resolve to nowhere: `#`, empty, or `javascript:`. */
const deadAnchors = (container) =>
    [...container.querySelectorAll('a')]
        .map((a) => a.getAttribute('href'))
        .filter((href) => href === null || href.trim() === '' || href.trim() === '#' || href.startsWith('javascript:'))

/** Social links pointed at a platform's home page rather than an account. */
const GENERIC_SOCIAL_HOMES = [
    'https://facebook.com',
    'https://facebook.com/',
    'https://www.facebook.com',
    'https://x.com',
    'https://x.com/',
    'https://twitter.com',
    'https://instagram.com',
    'https://instagram.com/',
    'https://www.instagram.com',
    'https://youtube.com',
    'https://youtube.com/',
    'https://www.youtube.com',
]

const hrefs = (container) => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))

/** Every anchor that leaves the site must be safe to open in a new tab. */
function expectSafeExternal(anchor) {
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor.getAttribute('rel')).toMatch(/noopener/)
    expect(anchor.getAttribute('rel')).toMatch(/noreferrer/)
    expect(anchor).toHaveAccessibleName()
}

// ---------------------------------------------------------------------------
describe('Footer', () => {
    it('has no placeholder anchors anywhere', () => {
        const { container } = withRouter(<Footer />)
        expect(deadAnchors(container)).toEqual([])
    })

    it('credits MINN, linked out to minnagency.com, and drops Basically Coders', () => {
        const { container } = withRouter(<Footer />)

        expect(container.textContent).not.toMatch(/Basically Coders/i)

        const credit = screen.getByRole('link', { name: /built by MINN/i })
        expect(credit).toHaveAttribute('href', MINN_URL)
        expectSafeExternal(credit)
        expect(container.textContent).toMatch(/Built by/i)
    })

    it('renders the MINN wordmark with useful alt text, subordinate to the Netronix logo', () => {
        const { container } = withRouter(<Footer />)

        const wordmark = screen.getByAltText(/MINN/i)
        expect(wordmark.getAttribute('src')).toMatch(/(?:minn-wordmark|data:image\/svg\+xml)/)

        // The Netronix brand logo is still the primary mark in the footer.
        expect(container.querySelector('img[alt="Netronix"]')).not.toBeNull()
    })

    it('points the three social icons at MINN accounts and drops YouTube', () => {
        const { container } = withRouter(<Footer />)
        const all = hrefs(container)

        for (const home of GENERIC_SOCIAL_HOMES) expect(all).not.toContain(home)
        expect(all.some((href) => href?.includes('youtube'))).toBe(false)

        for (const url of [MINN_FACEBOOK_URL, MINN_X_URL, MINN_INSTAGRAM_URL]) {
            const anchor = container.querySelector(`a[href="${url}"]`)
            expect(anchor, `no footer link to ${url}`).not.toBeNull()
            expectSafeExternal(anchor)
        }
    })

    it('advertises the MX-backed support address and a diallable number', () => {
        const { container } = withRouter(<Footer />)

        expect(container.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`)).not.toBeNull()
        expect(container.textContent).not.toMatch(/netronix\.com/)

        const phone = container.querySelector('a[href^="tel:"]')
        expect(phone).toHaveAttribute('href', 'tel:+96181995653')
    })

    it('does not offer a FAQ that does not exist', () => {
        const { container } = withRouter(<Footer />)
        expect(container.textContent).not.toMatch(/FAQ/i)
    })

    it('replaces the inert newsletter box with a real shop/contact call to action', () => {
        const { container } = withRouter(<Footer />)

        expect(screen.queryByRole('textbox')).toBeNull()
        expect(container.querySelector('input[type="email"]')).toBeNull()
        expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull()
        expect(container.textContent).not.toMatch(/newsletter/i)

        expect(screen.getByRole('link', { name: /shop all products/i })).toHaveAttribute('href', '/products')

        const contactLinks = screen.getAllByRole('link', { name: /contact us/i })
        expect(contactLinks.length).toBeGreaterThan(0)
        for (const link of contactLinks) expect(link).toHaveAttribute('href', '/contact')
    })

    it('states language and currency instead of pretending to switch them', () => {
        const { container } = withRouter(<Footer />)

        expect(screen.queryByRole('button', { name: /english/i })).toBeNull()
        expect(screen.queryByRole('button', { name: /LBP/i })).toBeNull()
        expect(container.textContent).not.toMatch(/LBP/)
        expect(container.textContent).toMatch(/English/)
        expect(container.textContent).toMatch(/USD/)
    })

    it('shows the current year rather than a year someone typed once', () => {
        const { container } = withRouter(<Footer />)
        expect(container.textContent).toContain(`© ${new Date().getFullYear()} Netronix`)
    })
})

// ---------------------------------------------------------------------------
describe('NewsLetterBar', () => {
    it('defaults its social icons to the MINN accounts', () => {
        const { container } = withRouter(<NewsLetterBar />)

        expect(deadAnchors(container)).toEqual([])
        for (const url of [MINN_FACEBOOK_URL, MINN_X_URL, MINN_INSTAGRAM_URL]) {
            const anchor = container.querySelector(`a[href="${url}"]`)
            expect(anchor, `no floating-bar link to ${url}`).not.toBeNull()
            expectSafeExternal(anchor)
        }
    })

    it('visibly identifies MINN, gives its heading a real destination, and stays out of mobile content', () => {
        const { container } = withRouter(<NewsLetterBar />)

        const action = screen.getByRole('link', { name: /MINN website/i })
        expect(action).toHaveAttribute('href', MINN_URL)
        expectSafeExternal(action)
        expect(container.firstElementChild).toHaveClass('hidden', 'md:grid')
    })

    it('still honours an explicit onClick handler', async () => {
        const onClick = vi.fn()
        withRouter(<NewsLetterBar heading="Newsletter" onClick={onClick} />)

        await userEvent.click(screen.getByRole('button', { name: /newsletter/i }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('still honours explicit socialLinks', () => {
        const { container } = withRouter(
            <NewsLetterBar socialLinks={[{ platform: 'facebook', url: 'https://example.com/fb' }]} />,
        )
        expect(container.querySelector('a[href="https://example.com/fb"]')).not.toBeNull()
    })
})

// ---------------------------------------------------------------------------
describe('Hero', () => {
    beforeEach(() => {
        // The static hero renders its copy on first paint; the iframe hero
        // waits on a load event jsdom never fires.
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener() { },
            removeListener() { },
            addEventListener() { },
            removeEventListener() { },
            dispatchEvent: () => false,
        }))
    })

    afterEach(() => { vi.restoreAllMocks() })

    it('sends Shop Now to the catalogue', () => {
        const { container } = withRouter(<Hero />)

        expect(screen.getByRole('link', { name: /shop now/i })).toHaveAttribute('href', '/products')
        expect(deadAnchors(container)).toEqual([])
    })
})

// ---------------------------------------------------------------------------
describe('Testimonials', () => {
    it('no longer offers a review archive that does not exist', () => {
        const { container } = withRouter(<Testimonials />)

        expect(deadAnchors(container)).toEqual([])
        expect(container.textContent).not.toMatch(/Read All/i)
        expect(container.textContent).not.toMatch(/2,482/)
    })

    it('does not publish unverified testimonial claims on the homepage', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const home = readFileSync(join(process.cwd(), 'src/pages/Home.jsx'), 'utf8')

        expect(home).not.toMatch(/import Testimonials/)
        expect(home).not.toMatch(/<Testimonials\s*\/>/)
    })
})

describe('footer feature claims', () => {
    it('does not advertise fake free-shipping or referral offers', () => {
        const { container } = render(<BusinessFeatures />)

        expect(container.textContent).not.toMatch(/price it into the products/i)
        expect(container.textContent).not.toMatch(/free shipping/i)
        expect(container.textContent).not.toMatch(/15%/)
        expect(container.textContent).not.toMatch(/refer a friend/i)
    })
})

// ---------------------------------------------------------------------------
describe('Contact', () => {
    afterEach(() => { vi.clearAllMocks() })

    it('has no placeholder anchors and no inert buttons', () => {
        const { container } = withRouter(<Contact />)

        expect(deadAnchors(container)).toEqual([])
        expect(screen.queryByRole('button', { name: /view open positions/i })).toBeNull()
    })

    it('links the three MINN accounts with visible MINN context and drops the GitHub icon', () => {
        const { container } = withRouter(<Contact />)

        expect(screen.getByRole('heading', { name: /Connect With MINN/i })).toBeInTheDocument()
        expect(screen.getByText(/agency behind this storefront/i)).toBeInTheDocument()

        for (const url of [MINN_FACEBOOK_URL, MINN_X_URL, MINN_INSTAGRAM_URL]) {
            const anchor = container.querySelector(`a[href="${url}"]`)
            expect(anchor, `no contact link to ${url}`).not.toBeNull()
            expectSafeExternal(anchor)
        }

        expect(hrefs(container).some((href) => href?.includes('github'))).toBe(false)
        expect(screen.queryByRole('link', { name: /github/i })).toBeNull()
    })

    it('makes the printed phone number and email addresses actionable', () => {
        const { container } = withRouter(<Contact />)

        expect(container.querySelector('a[href="tel:+96181995653"]')).not.toBeNull()
        expect(container.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`)).not.toBeNull()
    })

    it('opens a prefilled email instead of claiming the message was sent', async () => {
        withRouter(<Contact />)

        await userEvent.type(screen.getByLabelText(/full name/i), 'Rania Aoun')
        await userEvent.type(screen.getByLabelText(/email address/i), 'rania@example.com')
        await userEvent.selectOptions(screen.getByLabelText(/subject/i), 'Technical Support')
        await userEvent.type(screen.getByLabelText(/^message$/i), 'My laptop will not boot.')

        // The form says what it is going to do before it does it.
        expect(screen.getByTestId('contact-form-disclosure').textContent).toMatch(/email app/i)

        await userEvent.click(screen.getByRole('button', { name: /email/i }))

        await waitFor(() => expect(openMailto).toHaveBeenCalledTimes(1))
        const href = openMailto.mock.calls[0][0]
        expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true)
        expect(href).toContain(`subject=${encodeURIComponent('Technical Support — Rania Aoun')}`)
        expect(href).toContain(encodeURIComponent('rania@example.com'))
        expect(href).toContain(encodeURIComponent('My laptop will not boot.'))

        expect(screen.queryByText(/message sent/i)).toBeNull()
        expect(screen.getByRole('status').textContent).toMatch(/email app/i)
        expect(screen.getByRole('status').textContent).not.toMatch(/\bsent\b/i)
    })

    it('keeps truthful customer-support destinations', () => {
        const { container } = withRouter(<Contact />)

        // Resources: relabelled to what actually exists — the catalogue.
        expect(screen.getByRole('link', { name: /browse products/i })).toHaveAttribute('href', '/products')

        // Live support: opens the chat widget that is already on the page.
        expect(screen.getByRole('button', { name: /start chat/i })).toBeEnabled()

        // Repair booking: a prefilled email, since there is no booking system.
        const repair = screen.getByRole('link', { name: /book a repair/i })
        expect(repair.getAttribute('href')).toContain(`mailto:${SUPPORT_EMAIL}`)
        expect(repair.getAttribute('href')).toMatch(/subject=/)

        expect(container.textContent).not.toMatch(/knowledge base/i)
    })

    it('does not advertise careers or claim unsolicited CVs are read', () => {
        const { container } = withRouter(<Contact />)

        expect(screen.queryByRole('link', { name: /careers/i })).toBeNull()
        expect(container.textContent).not.toMatch(/working here|openings board|CV is still read/i)
    })
})

// ---------------------------------------------------------------------------
describe('the chat card actually opens the chat', () => {
    it('dispatches the event ChatBotWidget listens for', async () => {
        const { onOpenSupportChat } = await import('../../lib/supportChat.js')
        const handler = vi.fn()
        const off = onOpenSupportChat(handler)

        withRouter(<Contact />)
        await userEvent.click(screen.getByRole('button', { name: /start chat/i }))

        expect(handler).toHaveBeenCalledTimes(1)
        off()
    })
})

// ---------------------------------------------------------------------------
describe('the MINN URLs live in one module', () => {
    it('is what every surface imports', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')

        for (const file of [
            'src/components/Footer.jsx',
            'src/components/NewsLetterBar.jsx',
            'src/pages/Contact.jsx',
        ]) {
            const source = readFileSync(join(process.cwd(), file), 'utf8')
            expect(source, `${file} hard-codes a MINN URL`).not.toMatch(/minnagency\.com|instagram\.com\/minnagency|x\.com\/MINN_agency|facebook\.com\/61592823123599/)
            expect(source, `${file} does not import the shared MINN links`).toMatch(/from '\.\.\/lib\/minn\.js'/)
        }
    })
})
