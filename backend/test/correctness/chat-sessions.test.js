// PHASE 3 — durable chat sessions (BE-001, DEVOPS-001).
//
// Roadmap task 3.13, backend plan B-3 (session-persistence half).
//
// The defect these replace: sessions lived in two module-level `Map`s, so a
// restart or a deploy ended every conversation in progress, and on the
// serverless target the *next request* could land on an invocation that had
// never seen the session. One of the two Maps had no expiry at all.
//
// Nothing here contacts OpenAI. `test/setup.js` deletes `OPENAI_API_KEY`, so
// `AIclient.getClient()` returns null and every turn takes the structured
// fallback path — deterministic, offline, and still exercising the whole
// session lifecycle, which is what these tests are about.

import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'

import { useTestDatabase } from '../helpers/db.js'
import { api } from '../helpers/api.js'
import chatSessionModel, {
    SESSION_TTL_MS,
    MAX_RETAINED_MESSAGES,
    PROMPT_HISTORY_TURNS,
} from '../../models/chatSessionModel.js'

useTestDatabase()

const startSession = async () => {
    const response = await api().post('/api/chatbot/init').send({})
    expect(response.status).toBe(200)
    return response.body.sessionId
}

describe('a session is a document, not module memory', () => {
    it('persists the session and its opening turn', async () => {
        const sessionId = await startSession()

        const stored = await chatSessionModel.findOne({ sessionId })
        expect(stored).not.toBeNull()
        expect(stored.userId).toBeNull()
        expect(stored.messages).toHaveLength(1)
        expect(stored.messages[0].role).toBe('assistant')
        expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('continues a session this process never opened — the cold-start case', async () => {
        // Written straight into the collection, so no code path in this process
        // has ever held it. This is precisely what a second serverless
        // invocation sees, and what the module-level Map could not survive.
        const sessionId = 'cold-start-fixture'
        await chatSessionModel.create({
            sessionId,
            messages: [{ role: 'assistant', content: 'Hello from a previous process', at: new Date() }],
            startedAt: new Date(),
            lastActivityAt: new Date(),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        })

        const response = await api()
            .post('/api/chatbot/message')
            .send({ sessionId, message: 'are you still there?' })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)

        const after = await chatSessionModel.findOne({ sessionId })
        expect(after.messages).toHaveLength(3)
        expect(after.messages[1]).toMatchObject({ role: 'user', content: 'are you still there?' })
        expect(after.messages[2].role).toBe('assistant')
    })

    it('refreshes the expiry on every turn', async () => {
        const sessionId = await startSession()
        const opened = await chatSessionModel.findOne({ sessionId })

        // Move the expiry backwards so a refresh is observable without waiting.
        const stale = new Date(Date.now() + 1_000)
        await chatSessionModel.updateOne({ sessionId }, { $set: { expiresAt: stale } })

        await api().post('/api/chatbot/message').send({ sessionId, message: 'still here' })

        const after = await chatSessionModel.findOne({ sessionId })
        expect(after.expiresAt.getTime()).toBeGreaterThan(stale.getTime())
        expect(after.lastActivityAt.getTime()).toBeGreaterThanOrEqual(opened.lastActivityAt.getTime())
    })

    it('atomically retains two overlapping turns and keeps the transcript bounded', async () => {
        const sessionId = await startSession()
        const at = new Date()

        // Leave room for only one turn. Two concurrent appends must both survive,
        // while the oldest two messages are trimmed atomically at the write.
        await chatSessionModel.updateOne(
            { sessionId },
            {
                $set: {
                    messages: Array.from({ length: MAX_RETAINED_MESSAGES - 2 }, (_, i) => ({
                        role: i % 2 === 0 ? 'user' : 'assistant',
                        content: `existing turn ${i}`,
                        at,
                    })),
                },
            },
        )

        // Make the race deterministic: both handlers receive independent copies
        // of the exact same pre-write document before either model call proceeds.
        // A whole-array save therefore loses one turn; an atomic append does not.
        const before = await chatSessionModel.findOne({ sessionId })
        const snapshots = [
            chatSessionModel.hydrate(before.toObject()),
            chatSessionModel.hydrate(before.toObject()),
        ]
        const realFindOne = chatSessionModel.findOne.bind(chatSessionModel)
        let reads = 0
        let releaseReads
        const bothLoaded = new Promise((resolve) => { releaseReads = resolve })
        const findOne = vi.spyOn(chatSessionModel, 'findOne').mockImplementation(async (...args) => {
            const read = reads++
            if (read >= snapshots.length) return realFindOne(...args)
            if (reads === snapshots.length) releaseReads()
            await bothLoaded
            return snapshots[read]
        })

        let responses
        try {
            responses = await Promise.all([
                api().post('/api/chatbot/message').send({ sessionId, message: 'first simultaneous turn' }),
                api().post('/api/chatbot/message').send({ sessionId, message: 'second simultaneous turn' }),
            ])
        } finally {
            findOne.mockRestore()
        }

        expect(responses.every((response) => response.status === 200)).toBe(true)
        const stored = await chatSessionModel.findOne({ sessionId }).lean()
        expect(stored.messages).toHaveLength(MAX_RETAINED_MESSAGES)
        expect(stored.messages.slice(-4).map((entry) => entry.role))
            .toEqual(['user', 'assistant', 'user', 'assistant'])
        expect(stored.messages.filter((entry) => entry.role === 'user').map((entry) => entry.content))
            .toEqual(expect.arrayContaining(['first simultaneous turn', 'second simultaneous turn']))
    })

    it('ends the session by deleting it, and says so only once', async () => {
        const sessionId = await startSession()

        const first = await api().post('/api/chatbot/end').send({ sessionId })
        expect(first.status).toBe(200)
        expect(await chatSessionModel.findOne({ sessionId })).toBeNull()

        // A second close is a 404, not a silent success: the client sends this
        // once, from one owner, and a repeat means something is wrong.
        const second = await api().post('/api/chatbot/end').send({ sessionId })
        expect(second.status).toBe(404)
    })
})

describe('expiry is the database\'s job (DEVOPS-001)', () => {
    it('declares a TTL index on expiresAt', async () => {
        await chatSessionModel.init()
        const indexes = await chatSessionModel.collection.indexes()

        const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined)
        expect(ttl, 'no TTL index on chatSessions').toBeDefined()
        expect(ttl.key).toEqual({ expiresAt: 1 })
        // `0` means "when the date in the field passes", rather than a lifetime
        // baked into the index where it cannot be changed without a rebuild.
        expect(ttl.expireAfterSeconds).toBe(0)
    })

    it('refuses a stale session deterministically, whatever the TTL monitor has done', async () => {
        // MongoDB's TTL monitor is a sweep that runs about once a minute, so an
        // expired document stays readable for up to a minute past its time.
        // Correct behaviour must not depend on when that sweep last ran.
        const sessionId = 'expired-fixture'
        await chatSessionModel.create({
            sessionId,
            messages: [],
            startedAt: new Date(Date.now() - 3_600_000),
            lastActivityAt: new Date(Date.now() - 3_600_000),
            expiresAt: new Date(Date.now() - 1_000),
        })
        expect(await chatSessionModel.findOne({ sessionId })).not.toBeNull()

        const response = await api().post('/api/chatbot/message').send({ sessionId, message: 'hello?' })
        expect(response.status).toBe(404)
        expect(response.body.success).toBe(false)
    })

    it('refuses a session id that was never issued', async () => {
        const response = await api()
            .post('/api/chatbot/message')
            .send({ sessionId: 'never-issued', message: 'hello?' })
        expect(response.status).toBe(404)
    })
})

describe('retained history is bounded', () => {
    it('keeps at most MAX_RETAINED_MESSAGES on the document', async () => {
        const sessionId = 'bounded-fixture'
        const at = new Date()
        await chatSessionModel.create({
            sessionId,
            messages: Array.from({ length: MAX_RETAINED_MESSAGES + 20 }, (_, i) => ({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `turn ${i}`,
                at,
            })),
            startedAt: at,
            lastActivityAt: at,
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        })

        const stored = await chatSessionModel.findOne({ sessionId })
        expect(stored.messages).toHaveLength(MAX_RETAINED_MESSAGES)
        // The newest are the ones kept.
        expect(stored.messages.at(-1).content).toBe(`turn ${MAX_RETAINED_MESSAGES + 19}`)
    })

    it('replays only the newest turns into the prompt', () => {
        // The bound the controller applies, stated where it can be asserted:
        // the transcript is longer than the context, on purpose.
        expect(PROMPT_HISTORY_TURNS).toBeLessThan(MAX_RETAINED_MESSAGES)
        expect(PROMPT_HISTORY_TURNS).toBe(10)
    })

    it('stores the parsed reply, never the raw model output', async () => {
        const sessionId = await startSession()
        await api().post('/api/chatbot/message').send({ sessionId, message: '<img src=x onerror=alert(1)>' })

        const stored = await chatSessionModel.findOne({ sessionId })
        for (const message of stored.messages) {
            // The user's own turn is stored as sent — it is their text, and the
            // client escapes it — but nothing the *model* produced may carry
            // markup, because that is what gets replayed into the next prompt.
            if (message.role === 'assistant') expect(message.content).not.toMatch(/[<>]/)
        }
    })
})

describe('the session collection is the only place session state lives', () => {
    it('uses a collection with a stable name', async () => {
        await startSession()
        const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name)
        expect(names).toContain('chatsessions')
    })

    it('enforces one document per session id', async () => {
        await chatSessionModel.init()
        const sessionId = await startSession()

        await expect(chatSessionModel.create({
            sessionId,
            messages: [],
            startedAt: new Date(),
            lastActivityAt: new Date(),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        })).rejects.toThrow()
    })
})
