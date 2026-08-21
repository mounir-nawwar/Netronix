// CHARACTERISATION — the chatbot widget as it behaves today.
//
// Manifest flow: 7 (chat output is sanitised, SEC-004).
// Target-state assertions: src/test/target-state/frontend.target.test.jsx.
//
// FLIPPED IN PHASE 1, task 1.3 (with backend task 1.3 / B-3).
//
// Phase 0 recorded the vulnerability: a reply containing `<img onerror>` became
// a real element, an anchor became a live link, and the render path was React's
// raw-HTML escape hatch. All three are now asserted the other way round.
// The tests below are the same scenarios, re-pointed at the fixed behaviour, so
// the diff of this file *is* the behavioural change.
//
// These tests run entirely in jsdom against MSW. No OpenAI request is made.
// jsdom does not load image resources, so an injected `onerror` would never
// fire here anyway — which is why the assertions are about whether the element
// reaches the DOM at all, not about whether script ran.

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ShopContextProvider from '../../context/ShopContext.jsx'
import ChatInterface from '../../components/Chatbot/ChatInterface.jsx'
import { setChatGreeting, requestLog } from '../msw/handlers.js'

const renderChat = () =>
    render(
        <MemoryRouter>
            <ShopContextProvider>
                <ChatInterface onClose={() => { }} />
            </ShopContextProvider>
        </MemoryRouter>,
    )

const readSource = (relative) => readFileSync(join(process.cwd(), 'src', relative), 'utf8')

/**
 * The name of React's raw-HTML prop, assembled at runtime.
 *
 * Gate 1 requires `grep -R "<the prop name>" frontend/src` to return nothing,
 * and that scan does not exempt test files. Spelling it out here would make the
 * grep report a match forever and quietly destroy its value as a check, so the
 * token is built from parts instead.
 */
const HTML_SINK_PROP = ['dangerously', 'Set', 'Inner', 'HTML'].join('')

describe('flow 7 — chatbot replies are inert text (SEC-004 — fixed)', () => {
    // A note on what these assert, because it is easy to test the wrong thing.
    //
    // The correct fix renders the payload as *visible text*, so the string
    // "onerror" is legitimately present in `container.innerHTML` — as the
    // serialisation of a text node, not as an attribute. Asserting on the
    // serialised string would therefore fail against a working fix. What
    // matters, and what these assert, is the DOM: no element was created, no
    // event-handler attribute exists, and the payload is reachable as text.
    it('a reply containing <img onerror> renders as text, not as an element', async () => {
        setChatGreeting('Hello <img src="x" onerror="window.__netronixXss = true"> there')
        renderChat()

        const transcript = await screen.findByRole('log')
        await within(transcript).findByText(/Hello/)

        expect(transcript.querySelector('img')).toBeNull()
        expect(transcript.querySelector('[onerror]')).toBeNull()
        expect(transcript.querySelectorAll('*')).not.toHaveLength(0) // the bubble itself renders
        expect(within(transcript).getByText(/onerror/)).toBeInTheDocument() // …as text
        expect(window.__netronixXss).toBeUndefined()
    })

    it.each([
        ['<script>window.__netronixXss = true</script>', 'script'],
        ['<svg onload="window.__netronixXss = true"></svg>', 'svg'],
        ['<iframe src="https://evil.test"></iframe>', 'iframe'],
    ])('a reply containing %s creates no element', async (payload, tag) => {
        setChatGreeting(`Before ${payload} after`)
        renderChat()

        // Scoped to the transcript: the chat header draws react-icons SVGs of
        // its own, so a document-wide `querySelector('svg')` would find those
        // and report a false positive.
        const transcript = await screen.findByRole('log')
        await within(transcript).findByText(/Before/)

        expect(transcript.querySelector(tag)).toBeNull()
        expect(transcript.querySelector('[onload]')).toBeNull()
        expect(window.__netronixXss).toBeUndefined()
    })

    it('an anchor in a reply is not rendered as a live link', async () => {
        setChatGreeting("You can find it <a href='javascript:alert(1)'>here</a>")
        renderChat()

        const transcript = await screen.findByRole('log')
        await within(transcript).findByText(/You can find it/)

        // The transcript contains no anchor at all: the API no longer sends
        // hrefs, so there is nothing for the client to trust.
        expect(within(transcript).queryByRole('link')).toBeNull()
        expect(transcript.querySelector('a')).toBeNull()
    })

    it('the render path is plain JSX — no HTML sink exists in the component', () => {
        const source = readSource('components/Chatbot/ChatInterface.jsx')

        expect(source).not.toContain(HTML_SINK_PROP)
        expect(source).not.toMatch(/processAIResponse/)
        // The invented fallback product id is gone with the sink.
        expect(source).not.toMatch(/65f3c0d2e5c25ad8e9a3ca01/)
        // …and the replacement is a router link built from an id.
        expect(source).toMatch(/to=\{`\/product\/\$\{link\.productId\}`\}/)
    })

    it('no file under frontend/src uses the raw-HTML prop at all (Gate 1 grep)', async () => {
        const { readdirSync, statSync } = await import('node:fs')

        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) { walk(full); continue }
                if (!/\.(jsx?|tsx?)$/.test(entry)) continue
                if (readFileSync(full, 'utf8').includes(HTML_SINK_PROP)) offenders.push(full)
            }
        }
        walk(join(process.cwd(), 'src'))

        expect(offenders).toEqual([])
    })

    it('user messages are still rendered as text — the fix did not regress the half that was right', async () => {
        setChatGreeting('plain greeting')
        renderChat()
        await screen.findByText('plain greeting')

        const source = readSource('components/Chatbot/ChatInterface.jsx')
        expect(source).toMatch(/<p className="text-sm whitespace-pre-wrap break-words">\{msg\.text\}<\/p>/)
    })
})

describe('flow 7 — validated product links still work (SEC-004 — feature preserved)', () => {
    it('renders a recommended product as an internal router link', async () => {
        setChatGreeting('I recommend the MacBook Pro.', [
            { productId: '680897a3a9a5ffb06b2e52c8', label: 'MacBook Pro 16" M4 Pro' },
        ])
        renderChat()

        const link = await screen.findByRole('link', { name: 'MacBook Pro 16" M4 Pro' })
        expect(link).toHaveAttribute('href', '/product/680897a3a9a5ffb06b2e52c8')
    })

    it('ignores a link whose productId is not a real ObjectId', async () => {
        setChatGreeting('Try this.', [
            { productId: 'javascript:alert(1)', label: 'Malicious' },
            { productId: '../../etc/passwd', label: 'Traversal' },
        ])
        renderChat()

        await screen.findByText('Try this.')
        const transcript = screen.getByRole('log')
        expect(within(transcript).queryByRole('link')).toBeNull()
    })

    it('falls back to a safe label when the API sends an empty one', async () => {
        setChatGreeting('Here.', [{ productId: '680897a3a9a5ffb06b2e52c8', label: '' }])
        renderChat()

        expect(await screen.findByRole('link', { name: 'View product' })).toBeInTheDocument()
    })

    it('caps the message input at the length the server accepts (SEC-023)', async () => {
        setChatGreeting('plain greeting')
        renderChat()
        await screen.findByText('plain greeting')

        expect(screen.getByLabelText('Message')).toHaveAttribute('maxlength', '1000')
    })
})

describe('chat session lifecycle (FE-028, FE-029 — FIXED)', () => {
    // FLIPPED in Phase 3, roadmap task 3.12.
    //
    // Phase 0 recorded two defects here:
    //
    //   * FE-029 — `initializeChat` had a `if (!token)` branch that set a local
    //     greeting and a locally generated session id, and then **fell through**
    //     into the API call anyway, which immediately overwrote both. The branch
    //     ran and did nothing. There is no guest branch now, because there never
    //     needed to be one: the endpoint is public and the backend derives the
    //     customer from a verified token when there is one.
    //
    //   * FE-028 — the cleanup returned by the mount effect closed over
    //     `sessionId` from the *first* render, when it is still `null`, so
    //     `if (sessionId)` was false on every unmount and `/api/chatbot/end` was
    //     never called. Every conversation leaked a session, in a store that had
    //     no expiry for them at all (BE-001).

    it('opens exactly one session, by one path, for a visitor with no token', async () => {
        renderChat()
        await waitFor(() => expect(requestLog).toContain('POST /api/chatbot/init'))

        // One request, not a dead local branch followed by the real one.
        expect(requestLog.filter((entry) => entry === 'POST /api/chatbot/init')).toHaveLength(1)
    })

    it('renders the greeting the API returns', async () => {
        setChatGreeting('Welcome to Netronix.')
        renderChat()
        expect(await screen.findByText('Welcome to Netronix.')).toBeInTheDocument()
    })

    it('ends the session on unmount, with the id the server actually issued', async () => {
        const { unmount } = renderChat()
        await waitFor(() => expect(requestLog).toContain('POST /api/chatbot/init'))
        // Wait for the greeting, so the session id has reached the ref.
        await screen.findByRole('log')

        unmount()

        await waitFor(() => expect(requestLog).toContain('POST /api/chatbot/end'))
    })

    it('ends the session exactly once when the close button is used', async () => {
        let closed = false
        render(
            <MemoryRouter>
                <ShopContextProvider>
                    <ChatInterface onClose={() => { closed = true }} />
                </ShopContextProvider>
            </MemoryRouter>,
        )
        await screen.findByRole('log')
        await waitFor(() => expect(requestLog).toContain('POST /api/chatbot/init'))

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: /end chat/i }))

        await waitFor(() => expect(closed).toBe(true))
        await waitFor(() =>
            expect(requestLog.filter((entry) => entry === 'POST /api/chatbot/end')).toHaveLength(1))
    })

    it('reads the session id from a ref, not from state captured at first render', () => {
        const source = readSource('components/Chatbot/ChatInterface.jsx')
        expect(source).toMatch(/sessionIdRef/)
        // The stale-closure shape: `sessionId` held in state and read by the
        // cleanup returned from a `[]`-dependency effect.
        expect(source).not.toMatch(/const \[sessionId, setSessionId\]/)
    })

    it('is mounted by exactly one owner, with no second widget holding its own state (FE-027)', async () => {
        const { readdirSync, statSync } = await import('node:fs')

        // `ChatButton.jsx` declared no props, ignored the three it was passed,
        // and held a second `isChatOpen` with a second `<ChatInterface>`. The
        // widget's own state and interface were therefore unreachable: two
        // sources of truth for one dialog, one of them dead.
        const chatbotDir = join(process.cwd(), 'src/components/Chatbot')
        const files = readdirSync(chatbotDir).filter((entry) =>
            statSync(join(chatbotDir, entry)).isFile() && entry.endsWith('.jsx'))
        expect(files.sort()).toEqual(['ChatBotWidget.jsx', 'ChatInterface.jsx'])

        const mounts = []
        const walk = (dir) => {
            for (const entry of readdirSync(dir)) {
                if (entry === 'test') continue
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) { walk(full); continue }
                if (!/\.jsx$/.test(entry)) continue
                if (/<ChatInterface\b/.test(readFileSync(full, 'utf8'))) mounts.push(entry)
            }
        }
        walk(join(process.cwd(), 'src'))
        expect(mounts).toEqual(['ChatBotWidget.jsx'])
    })
})
