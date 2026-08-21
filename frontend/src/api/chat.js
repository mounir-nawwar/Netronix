// The support agent (FE-006, SEC-004).
//
// The contract is plain `text` plus a validated `links: [{ productId, label }]`.
// There is no HTML in it and no URL: the client builds every route itself from
// an id it re-checks. Nothing here ever returns markup.

import { post } from './client'

export async function startChat() {
    const data = await post('/api/chatbot/init', {})
    return { sessionId: data?.sessionId ?? null, greeting: data?.greeting ?? null }
}

export async function sendChatMessage({ sessionId, message }) {
    const data = await post('/api/chatbot/message', { sessionId, message })
    // `message` is read as a fallback because an older deployment may not send
    // `text` yet; either way it is plain text, never markup.
    const raw = data?.text ?? data?.message
    return {
        text: typeof raw === 'string' ? raw : '',
        links: Array.isArray(data?.links) ? data.links : [],
    }
}

export function endChat(sessionId) {
    return post('/api/chatbot/end', { sessionId })
}
