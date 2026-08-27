// The support agent (FE-006, SEC-004).
//
// The contract is plain `text` plus a validated `links: [{ productId, label }]`.
// There is no HTML in it and no URL: the client builds every route itself from
// an id it re-checks. Nothing here ever returns markup.

import { post } from './client'

/**
 * `degraded` says the assistant did not answer.
 *
 * The API returns HTTP 200 with a canned sentence when the model is
 * unreachable — no key, an expired one, a 429 from the provider, a network
 * error. Without this flag the widget rendered that sentence as an ordinary
 * reply, so a chat that was completely non-functional looked like a chat that
 * simply had one unhelpful answer for every question. It is read defensively:
 * a deployment that predates the field returns `undefined`, which is falsey,
 * and the widget behaves exactly as it did before.
 */
export async function startChat() {
    const data = await post('/api/chatbot/init', {})
    return {
        sessionId: data?.sessionId ?? null,
        greeting: data?.greeting ?? null,
        degraded: data?.degraded === true,
    }
}

export async function sendChatMessage({ sessionId, message }) {
    const data = await post('/api/chatbot/message', { sessionId, message })
    // `message` is read as a fallback because an older deployment may not send
    // `text` yet; either way it is plain text, never markup.
    const raw = data?.text ?? data?.message
    return {
        text: typeof raw === 'string' ? raw : '',
        links: Array.isArray(data?.links) ? data.links : [],
        degraded: data?.degraded === true,
    }
}

export function endChat(sessionId) {
    return post('/api/chatbot/end', { sessionId })
}
