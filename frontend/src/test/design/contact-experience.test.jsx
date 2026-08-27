// The Contact page, rebuilt.
//
// Two things are asserted here and they pull in opposite directions on
// purpose. The first is behaviour that was already correct and must survive a
// redesign: the page is the only surface that hands a written message to the
// visitor's own mail client, and it is the one that names MINN as the agency
// behind the storefront. None of that may be lost to a visual rewrite.
//
// The second is composition. The page it replaced was assembled out of the
// house style of a generative tool — a purple hero over a circuit-board SVG,
// five tech glyphs drifting on infinite loops, three equal-weight icon cards
// under matching drop shadows, a careers mascot rotating inside a circle, and
// business hours nobody at Netronix has ever confirmed. The last of those is a
// factual claim the site cannot support; the rest are decoration standing in
// for hierarchy. A test cannot judge taste, but it can hold the specific
// things that were wrong, so they cannot come back one commit at a time.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/openMailto.js', () => ({ default: vi.fn() }))

import openMailto from '../../lib/openMailto.js'
import Contact from '../../pages/Contact.jsx'
import ChatBotWidget from '../../components/Chatbot/ChatBotWidget.jsx'
import { reset } from '../../lib/head.js'
import {
    CONTACT_EMAIL,
    buildContactMailto,
} from '../../lib/contact.js'
import {
    MINN_FACEBOOK_URL,
    MINN_INSTAGRAM_URL,
    MINN_X_URL,
} from '../../lib/minn.js'

const SOURCE = readFileSync(join(process.cwd(), 'src/pages/Contact.jsx'), 'utf8')

const withRouter = () => render(<MemoryRouter><Contact /></MemoryRouter>)

/** Every class attribute on the page, as one string, for palette scans. */
const classText = (container) =>
    [...container.querySelectorAll('*')].map((node) => node.getAttribute('class') ?? '').join(' ')

const hrefs = (container) => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))

afterEach(() => {
    reset()
    vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
describe('what the page still has to do', () => {
    it('titles the route through Seo', async () => {
        withRouter()
        await waitFor(() => expect(document.title).toMatch(/^Contact\b/))
    })

    it('states, before submission, that the browser will open a mail app', () => {
        withRouter()

        const disclosure = screen.getByTestId('contact-form-disclosure')
        expect(disclosure.textContent).toMatch(/email app/i)
        expect(disclosure.textContent).toMatch(/press send/i)

        // The submit control points at that sentence, so the promise is read
        // out with the button rather than only being on screen near it.
        const submit = screen.getByRole('button', { name: /open email draft/i })
        expect(submit).toHaveAttribute('aria-describedby', disclosure.id)
        expect(disclosure.id).not.toBe('')
    })

    it('previews the exact draft it is going to open, and then opens it', async () => {
        withRouter()

        await userEvent.type(screen.getByLabelText(/full name/i), 'Rania Aoun')
        await userEvent.type(screen.getByLabelText(/email address/i), 'rania@example.com')
        await userEvent.selectOptions(screen.getByLabelText(/subject/i), 'Technical Support')
        await userEvent.type(screen.getByLabelText(/^message$/i), 'My laptop will not boot.')

        // The configure surface shows the addressee and subject line the mail
        // client will receive — not a paraphrase of them.
        const summary = screen.getByTestId('draft-summary')
        expect(summary.textContent).toContain(CONTACT_EMAIL)
        expect(summary.textContent).toContain('Technical Support — Rania Aoun')

        await userEvent.click(screen.getByRole('button', { name: /open email draft/i }))

        await waitFor(() => expect(openMailto).toHaveBeenCalledTimes(1))
        expect(openMailto).toHaveBeenCalledWith(buildContactMailto({
            name: 'Rania Aoun',
            email: 'rania@example.com',
            subject: 'Technical Support',
            message: 'My laptop will not boot.',
        }))
    })

    it('reports the hand-off without claiming anything was sent', async () => {
        withRouter()

        await userEvent.type(screen.getByLabelText(/full name/i), 'Rania Aoun')
        await userEvent.type(screen.getByLabelText(/email address/i), 'rania@example.com')
        await userEvent.selectOptions(screen.getByLabelText(/subject/i), 'Sales Inquiry')
        await userEvent.type(screen.getByLabelText(/^message$/i), 'Do you stock docks?')
        await userEvent.click(screen.getByRole('button', { name: /open email draft/i }))

        const status = await screen.findByRole('status')
        expect(status.textContent).toMatch(/email app/i)
        expect(status.textContent).not.toMatch(/\bsent\b/i)
        expect(status).toHaveAttribute('aria-live', 'polite')
    })

    it('routes sales and support to the one address a person reads', () => {
        const { container } = withRouter()

        // Both rows reach the same inbox with different `?subject=` lines. Two
        // rows for one mailbox is the point: it is how a single inbox stays
        // sortable, and both were previously `netronix.tech` addresses that
        // nobody opens.
        const mailtos = [...container.querySelectorAll('a[href^="mailto:"]')]
            .map((anchor) => anchor.getAttribute('href'))

        expect(mailtos.length).toBeGreaterThanOrEqual(2)
        for (const href of mailtos) {
            expect(href, 'a Contact route points somewhere unread').toContain(CONTACT_EMAIL)
        }
        expect(new Set(mailtos).size, 'the routes are indistinguishable in the inbox')
            .toBeGreaterThanOrEqual(2)
    })

    it('publishes no telephone number, because none rings anywhere', () => {
        const { container } = withRouter()
        expect(container.querySelector('a[href^="tel:"]')).toBeNull()
        expect(container.textContent).not.toMatch(/\+961/)
    })

    it('keeps the catalogue link, the support chat and the repair email', async () => {
        const { onOpenSupportChat } = await import('../../lib/supportChat.js')
        const opened = vi.fn()
        const off = onOpenSupportChat(opened)

        withRouter()

        expect(screen.getByRole('link', { name: /browse products/i })).toHaveAttribute('href', '/products')

        await userEvent.click(screen.getByRole('button', { name: /start chat/i }))
        expect(opened).toHaveBeenCalledTimes(1)
        off()

        const repair = screen.getByRole('link', { name: /book a repair/i })
        expect(repair.getAttribute('href')).toContain(`mailto:${CONTACT_EMAIL}`)
        expect(repair.getAttribute('href')).toMatch(/subject=/)
    })

    it.each(['/contact', '/contact/'])(
      'uses the page action as the chat entry point on %s instead of covering the form with a second launcher',
      async (path) => {
        render(
            <MemoryRouter initialEntries={[path]}>
                <Contact />
                <ChatBotWidget />
            </MemoryRouter>,
        )

        expect(screen.queryByRole('button', { name: /open support chat/i })).toBeNull()
        const startChat = screen.getByRole('button', { name: /start chat/i })
        await userEvent.click(startChat)
        const dialog = screen.getByRole('dialog')
        const endChat = within(dialog).getByRole('button', { name: /end chat/i })
        expect(screen.queryByRole('button', { name: /close support chat/i })).toBeNull()
        expect(dialog.className).toContain('left-4')
        expect(dialog.className).toContain('right-4')
        expect(dialog.className).toContain('sm:left-auto')
        expect(dialog.className).toContain('sm:w-80')
        await userEvent.click(endChat)
        await waitFor(() => expect(startChat).toHaveFocus())
      },
    )

    it('does not advertise careers or promise that unsolicited CVs are read', () => {
        const { container } = withRouter()

        expect(container.textContent).not.toMatch(/working here|careers|openings board|CV is still read/i)
    })

    it('names MINN in visible copy beside MINN’s own accounts', () => {
        const { container } = withRouter()

        expect(screen.getByRole('heading', { name: /Connect With MINN/i })).toBeInTheDocument()
        expect(screen.getByText(/agency behind this storefront/i)).toBeInTheDocument()

        for (const url of [MINN_FACEBOOK_URL, MINN_X_URL, MINN_INSTAGRAM_URL]) {
            const anchor = container.querySelector(`a[href="${url}"]`)
            expect(anchor, `no link to ${url}`).not.toBeNull()
            expect(anchor).toHaveAttribute('target', '_blank')
            expect(anchor.getAttribute('rel')).toMatch(/noopener/)
            expect(anchor.getAttribute('rel')).toMatch(/noreferrer/)
            expect(anchor).toHaveAccessibleName(/MINN/)
        }

        // The URLs stay in the module the footer reads them from.
        expect(SOURCE).toMatch(/from '\.\.\/lib\/minn\.js'/)
        expect(SOURCE).not.toMatch(/minnagency\.com|instagram\.com\/minnagency|x\.com\/MINN_agency/)
    })

    it('leads nowhere dead', () => {
        const { container } = withRouter()

        for (const href of hrefs(container)) {
            expect(href, 'anchor with no destination').not.toBeNull()
            expect(href.trim(), 'placeholder anchor').not.toBe('')
            expect(href.trim(), 'placeholder anchor').not.toBe('#')
            expect(href.startsWith('javascript:'), 'javascript: anchor').toBe(false)
        }
    })
})

// ---------------------------------------------------------------------------
describe('what the page must not claim', () => {
    it('publishes no opening hours, because none are verified', () => {
        const { container } = withRouter()

        expect(container.textContent).not.toMatch(/business hours/i)
        expect(container.textContent).not.toMatch(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)
        expect(container.textContent).not.toMatch(/\b\d{1,2}\s?(am|pm)\b/i)
    })

    it('drops the "team of experts" copy and the perfect-solution promise', () => {
        const { container } = withRouter()

        expect(container.textContent).not.toMatch(/team of (experts|specialists|professionals)/i)
        expect(container.textContent).not.toMatch(/perfect (tech )?solution/i)
        expect(container.textContent).not.toMatch(/fastest way/i)
        expect(container.textContent).not.toMatch(/support replies by email/i)
        expect(container.textContent).not.toMatch(/get in touch/i)
    })
})

// ---------------------------------------------------------------------------
describe('composition', () => {
    it('has one h1 and one form', () => {
        const { container } = withRouter()

        expect(container.querySelectorAll('h1')).toHaveLength(1)
        expect(container.querySelectorAll('form')).toHaveLength(1)
    })

    it('opens on a left-aligned editorial header, not a centred hero', () => {
        const { container } = withRouter()

        const header = screen.getByTestId('contact-header')
        expect(header.compareDocumentPosition(screen.getByTestId('configure-surface')))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(within(header).getByRole('heading', { level: 1 })).toBeInTheDocument()
        expect(classText(container)).not.toMatch(/\btext-center\b/)
    })

    it('paints the quiet palette and keeps the accent for interaction only', () => {
        const { container } = withRouter()
        const classes = classText(container)

        // The three hex literals this used to pin — #f5f5f7 behind, #86868b on
        // the field borders, #6e6e73 on placeholders — are named tokens now
        // (`paper`, `rule`, `ink-40` in `tailwind.config.js`), shared with the
        // catalog, the cart and the checkout. That is a token migration, not a
        // relaxation: the same three roles are still asserted, and asserting the
        // token name is stronger than asserting a hex, because a hex can be
        // typed by hand in one file and drift from every other surface.
        expect(classes).toMatch(/\bbg-paper\b/)

        // No purple surface *at rest*, and no decorative purple borders: the
        // accent belongs to the states where the page is answering a pointer or
        // a keyboard. The original rule banned `bg-[#6a5acd]` outright, because
        // what it was written against was a full purple hero band. A hover on
        // one submit button is not that, and every primary button on the site —
        // the cart's, the checkout's, the catalog's — now inverts to the accent
        // on hover; holding Contact alone to black-on-black would make it the
        // odd one out for a rule aimed at something else.
        //
        // Source scanning includes the conditional hand-off panel, which is
        // absent from the initial DOM.
        expect(SOURCE).not.toContain('bg-[#6a5acd]')
        expect(SOURCE).not.toMatch(/(?<!(?:hover|focus|focus-visible|active):)bg-statepurp/)
        expect(SOURCE).not.toMatch(/(?<!focus:)border-statepurp/)
        expect(SOURCE).toMatch(/focus[-:][\w:[\]#-]*statepurp/)

        // Controls need a visible boundary, and placeholder text stays readable
        // rather than dropping to the lighter secondary grey.
        expect(SOURCE).not.toContain('border-black/15')
        expect(SOURCE).toContain('border-rule')
        expect(SOURCE).not.toContain('placeholder:text-rule')
        expect(SOURCE).toContain('placeholder:text-ink-40')
    })

    it('carries the form as the dominant surface, above the support routes', () => {
        const { container } = withRouter()

        const configure = screen.getByTestId('configure-surface')
        expect(within(configure).getByRole('button', { name: /open email draft/i })).toBeInTheDocument()
        expect(container.querySelector('form').closest('[data-testid="configure-surface"]')).toBe(configure)

        expect(configure.compareDocumentPosition(screen.getByTestId('support-routes')))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('lists the support routes as divided rows, not equal icon cards', () => {
        withRouter()
        const routes = screen.getByTestId('support-routes')

        expect(within(routes).getAllByTestId('support-route').length).toBeGreaterThanOrEqual(3)
        expect(routes.getAttribute('class')).toMatch(/divide-y/)
        expect(SOURCE).not.toMatch(/md:grid-cols-3/)
    })

    it('gives every action a 44px target', () => {
        withRouter()

        const actions = [
            screen.getByRole('button', { name: /open email draft/i }),
            ...screen.getAllByTestId('support-route-action'),
        ]
        for (const action of actions) {
            expect(action.getAttribute('class'), action.textContent).toMatch(/min-h-\[44px\]/)
        }
    })
})

// ---------------------------------------------------------------------------
describe('the decoration that was standing in for hierarchy', () => {
    it('runs no motion at all, so there is nothing for reduced-motion to undo', () => {
        expect(SOURCE).not.toMatch(/framer-motion/)
        expect(SOURCE).not.toMatch(/\bmotion\./)
        expect(SOURCE).not.toMatch(/repeat:\s*Infinity/)
        expect(SOURCE).not.toMatch(/whileHover|whileTap|whileInView/)
        expect(SOURCE).not.toMatch(/animate-(pulse|bounce|spin|ping)/)
    })

    it('draws no gradients, circuit boards or drifting tech glyphs', () => {
        const { container } = withRouter()

        expect(SOURCE).not.toMatch(/gradient/i)
        expect(SOURCE).not.toMatch(/circuit/i)
        expect(SOURCE).not.toMatch(/<pattern\b/)
        expect(SOURCE).not.toMatch(/FiCpu|FiHardDrive|FiServer|FiMonitor|FiCode/)
        expect(container.querySelectorAll('pattern')).toHaveLength(0)
        expect(container.querySelectorAll('svg[class*="absolute"]')).toHaveLength(0)
    })

    it('drops the icon bubbles, the repeated shadow cards and the hover lifts', () => {
        const classes = classText(withRouter().container)

        expect(classes).not.toMatch(/rounded-full/)
        expect(classes).not.toMatch(/rounded-(2xl|3xl)/)
        expect(classes).not.toMatch(/shadow-(md|lg|xl|2xl)/)
        expect(SOURCE).not.toMatch(/hover:shadow|hover:-translate-y|hover:scale/)
    })

    it('drops the careers mascot', () => {
        const { container } = withRouter()

        expect(SOURCE).not.toMatch(/FiUsers/)
        expect(container.querySelectorAll('img')).toHaveLength(0)
    })
})
