import mongoose from "mongoose";

/**
 * A chat session, in the database (BE-001, DEVOPS-001).
 *
 * The defect
 * ----------
 * Sessions lived in **two module-level `Map`s** — `chatbotController`'s
 * `activeSessions` and `AIclient`'s `chatSessions` — and a `setInterval` swept
 * the second one every sixty seconds. Three things follow from that, and all
 * three were real:
 *
 *   * a restart or a deploy ended every conversation in progress, mid-sentence;
 *   * the deployment target is serverless, so a *second* invocation of the same
 *     function had a different `Map` — every follow-up message could land on a
 *     process that had never heard of the session, which is very likely why the
 *     client carried canned fallback replies;
 *   * `activeSessions` had **no expiry at all**. A session was removed only when
 *     the customer clicked the close button; every abandoned tab leaked its
 *     transcript for the lifetime of the process.
 *
 * The representation
 * ------------------
 * One document per session, with the transcript on it, and a TTL index doing the
 * expiry. No new infrastructure, correct across restarts and cold starts, and
 * the sweep — along with the reason `app.js` had to be importable without
 * starting a timer — simply stops existing.
 *
 * ## Why `expiresAt` with `expireAfterSeconds: 0`
 *
 * The alternative is a TTL on `lastActivityAt` with the lifetime baked into the
 * index. That makes the lifetime a property of the *index*, changeable only by
 * dropping and rebuilding it, and it makes "when does this session die?"
 * invisible in the document. An explicit `expiresAt` is refreshed by the code
 * that knows a turn just happened, and reads as what it is.
 *
 * ## Why the code checks expiry as well
 *
 * MongoDB's TTL monitor runs about once a minute, so an expired document is
 * *reachable* for up to a minute after its time. Deleting on a schedule and
 * behaving correctly are different problems: the reader refuses anything past
 * `expiresAt` itself, so behaviour is deterministic and the index is only
 * reclaiming space.
 */

/** How long a session survives its last message. */
export const SESSION_TTL_MS = 30 * 60 * 1000

/**
 * The most turns retained on a session document.
 *
 * The prompt sends the last `PROMPT_HISTORY_TURNS` of these; the rest is kept so
 * a transcript is not silently truncated mid-conversation. Bounded because the
 * chat is unauthenticated: the rate limiter caps 10 messages a minute per IP,
 * and this caps what any one session can accumulate over its lifetime.
 */
export const MAX_RETAINED_MESSAGES = 40

/** How many stored messages are replayed into the model's context. */
export const PROMPT_HISTORY_TURNS = 10

const chatMessageSchema = new mongoose.Schema({
    role: { type: String, required: true, enum: ['user', 'assistant'] },
    // Already reduced to inert text by `AIclient.toInertText` before it is
    // stored, so a hostile turn cannot be replayed into a later prompt — or into
    // a later client — in its original form (SEC-004).
    content: { type: String, required: true, maxlength: 4000 },
    at: { type: Date, required: true, default: () => new Date() },
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    // Null for an anonymous visitor. Never read from a request body.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
    messages: { type: [chatMessageSchema], default: [] },
    startedAt: { type: Date, required: true, default: () => new Date() },
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });

/** The expiry itself. `expireAfterSeconds: 0` means "when `expiresAt` passes". */
chatSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

/** Keep only the newest messages, so one session cannot grow without bound. */
chatSessionSchema.pre('validate', function boundTranscript() {
    if (Array.isArray(this.messages) && this.messages.length > MAX_RETAINED_MESSAGES) {
        this.messages = this.messages.slice(-MAX_RETAINED_MESSAGES)
    }
})

const chatSessionModel = mongoose.models.chatSession || mongoose.model('chatSession', chatSessionSchema)

export default chatSessionModel
