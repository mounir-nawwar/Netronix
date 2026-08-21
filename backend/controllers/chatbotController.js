import { v4 as uuidv4 } from 'uuid';

import chatSessionModel, {
    SESSION_TTL_MS,
    MAX_RETAINED_MESSAGES,
    PROMPT_HISTORY_TURNS,
} from '../models/chatSessionModel.js';
import { processChatMessage } from '../services/AIclient.js';
import { NotFoundError } from '../errors/AppError.js';
import { asyncHandler } from '../errors/AppError.js';

// BE-001 / DEVOPS-001 — sessions are documents, not module memory.
//
// This file used to hold `const activeSessions = new Map()` at module scope,
// and `AIclient` held a second one beside it. Neither survived a restart, and on
// the serverless target neither survived the *next request*: a follow-up message
// could land on an invocation that had never seen the session. `activeSessions`
// also had no expiry at all, so every abandoned tab leaked its transcript for
// the life of the process.
//
// A session is now one document with a TTL index. The trade is one database
// round trip per turn — against an OpenAI call that already dominates the
// latency of the same request — for a conversation that survives a deploy.

/**
 * The reply shape every chatbot endpoint returns (SEC-004).
 *
 * `text` is plain text with no markup of any kind, and `links` is a validated
 * list of `{ productId, label }` pairs that the client turns into internal
 * routes itself. The API never sends a URL, an href, or a tag, so there is
 * nothing for a client to render as HTML even by mistake.
 *
 * `message` repeats `text` because both storefront builds read `data.message`.
 */
const structuredReply = (aiResponse, fallbackText) => {
    const text = aiResponse?.text ?? aiResponse?.message ?? fallbackText;
    return {
        text: typeof text === 'string' ? text : fallbackText,
        links: Array.isArray(aiResponse?.links) ? aiResponse.links : [],
    };
};

const GREETING_FALLBACK = 'Hello! Welcome to Netronix customer support. How can I help you today?';
const REPLY_FALLBACK = "I'm sorry, I couldn't process your request at this time.";

/** A fresh expiry, measured from now. Refreshed on every turn. */
const nextExpiry = () => new Date(Date.now() + SESSION_TTL_MS);

/**
 * Load a live session, or throw.
 *
 * The expiry is checked here as well as by the index. MongoDB's TTL monitor runs
 * roughly once a minute, so an expired document stays *readable* for up to a
 * minute after its time; refusing it in code makes the behaviour deterministic
 * rather than dependent on when the monitor last ran, and leaves the index doing
 * the one job it is good at — reclaiming the space.
 */
async function loadLiveSession(sessionId, notFoundMessage) {
    const session = await chatSessionModel.findOne({ sessionId });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
        throw new NotFoundError(notFoundMessage);
    }
    return session;
}

// Initialize a new chat session
const initializeChat = asyncHandler(async (req, res) => {
    // A chat session may be anonymous. When a verified token is present,
    // `authUser` is not on this route, so the id comes from the optional
    // `req.auth` set by any upstream middleware — never from the request body,
    // which a caller controls.
    const userId = req.auth?.userId ?? null;
    const sessionId = uuidv4();

    const aiResponse = await processChatMessage('Hello', { history: [] });
    const { text, links } = structuredReply(aiResponse, GREETING_FALLBACK);
    const timestamp = new Date();

    await chatSessionModel.create({
        sessionId,
        userId,
        messages: [{ role: 'assistant', content: text, at: timestamp }],
        startedAt: timestamp,
        lastActivityAt: timestamp,
        expiresAt: nextExpiry(),
    });

    return res.status(200).json({
        success: true,
        sessionId,
        greeting: { text, links, timestamp },
    });
});

// Handle incoming messages and generate responses
const handleMessage = asyncHandler(async (req, res) => {
    const { sessionId, message } = req.validated.body;

    const session = await loadLiveSession(sessionId, 'Chat session not found or expired');

    // Only the newest turns are replayed into the prompt. The rest stay on the
    // document so the transcript is whole; what is bounded is the prompt.
    const history = session.messages.slice(-PROMPT_HISTORY_TURNS);

    const aiResponse = await processChatMessage(message, { history });
    const { text, links } = structuredReply(aiResponse, REPLY_FALLBACK);
    const timestamp = new Date();

    // Commit the complete turn in one database operation after the external
    // model call. This deliberately holds no MongoDB transaction open while the
    // model runs and never calls the model again on a write retry. `$push` makes
    // concurrent turns append rather than replace one another; `$each` keeps a
    // turn's user/assistant pair adjacent, and commit order defines turn order.
    // `$slice` applies the transcript bound in the same atomic write, including
    // when multiple requests cross the limit together.
    //
    // The *parsed* reply is what is stored, so a hostile turn cannot be replayed
    // into a later prompt — or served to a later reader — in its original form.
    const persisted = await chatSessionModel.updateOne(
        { sessionId, expiresAt: { $gt: timestamp } },
        {
            $push: {
                messages: {
                    $each: [
                        { role: 'user', content: String(message), at: timestamp },
                        { role: 'assistant', content: text, at: timestamp },
                    ],
                    $slice: -MAX_RETAINED_MESSAGES,
                },
            },
            $set: {
                lastActivityAt: timestamp,
                expiresAt: nextExpiry(),
            },
        },
        { runValidators: true },
    );
    if (persisted.matchedCount !== 1) {
        throw new NotFoundError('Chat session not found or expired');
    }

    return res.status(200).json({
        success: true,
        message: text,
        text,
        links,
    });
});

// End chat session
const endChatSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.validated.body;

    const deleted = await chatSessionModel.findOneAndDelete({ sessionId });
    if (!deleted) throw new NotFoundError('Chat session not found or already ended');

    return res.status(200).json({
        success: true,
        message: 'Chat session ended successfully',
    });
});

export { initializeChat, handleMessage, endChatSession };
