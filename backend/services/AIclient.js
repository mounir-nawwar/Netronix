// The catalog-grounded support agent.
import logger from '../lib/logger.js';
//
// SEC-004 — what changed in Phase 1, and why
// ------------------------------------------
// The previous contract between this file and the storefront was **HTML**. The
// system prompt did not merely tolerate markup, it demanded it:
//
//     "you MUST use this EXACT HTML FORMAT: <a href='/product/{id}'>here</a>"
//
// and the reply was passed to `dangerouslySetInnerHTML` untouched. That is a
// live XSS sink fed by a language model, on a public page, with the whole
// admin-editable catalog inside the prompt.
//
// The fix is not a sanitiser. It is removing HTML from the contract:
//
//   * the model is asked for a **marker**, `[[product:<24-hex id>]]`;
//   * `parseModelReply` resolves each marker against the catalog that was
//     actually supplied to the prompt, and drops anything it cannot resolve;
//   * everything that survives is **plain text plus `links: [{productId,
//     label}]`** — no href, no tag, no attribute the model can influence;
//   * angle brackets are removed from every string that leaves this module,
//     including catalog-derived labels, so no model or admin text can become
//     markup even if a future client renders it carelessly.
//
// The route a link points at is built by the *client* from `productId`, so the
// worst a compromised model can do is name a product that exists.
//
// BE-001 / DEVOPS-001 — what changed in Phase 3
// ---------------------------------------------
// This module used to own a `Map` of sessions and a `setInterval` sweeping it.
// It owns neither now. A session is a document in `chatSessionModel` with a TTL
// index, and this module is a pure function of one turn: it is handed the
// bounded history, it returns the reply, and it stores nothing. That is what
// makes the chat survive a restart and a serverless cold start, and it is why
// there is no application timer left to import.

import OpenAI from "openai";
import productModel from "../models/productModel.js";

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

/** The only structure the model is allowed to emit. */
export const PRODUCT_MARKER_PATTERN = /\[\[product:([0-9a-fA-F]{24})\]\]/g

/** Any `[[product:…]]` marker at all, so an unresolvable one can be removed. */
const ANY_PRODUCT_MARKER = /\[\[\s*product\s*:[^\]]*\]\]/g

/** A reply may name at most this many products. */
export const MAX_LINKS_PER_REPLY = 5

/** Replies are bounded so a runaway generation cannot be relayed wholesale. */
export const MAX_REPLY_LENGTH = 2000

/**
 * Reduce a string to inert plain text.
 *
 * Tag-like sequences go first, then any surviving angle bracket, so nothing
 * that leaves this module can be parsed as markup by anything downstream. It is
 * deliberately lossy — "under < 500 dollars" becomes "under 500 dollars" —
 * because the contract is text, and a rare cosmetic loss is a fair price for a
 * property that holds without depending on how a client renders.
 */
export function toInertText(value) {
    if (typeof value !== 'string') return ''
    return value
        .replace(/<[^>]*>/g, ' ')       // complete tags
        .replace(/[<>]/g, '')           // stray or truncated brackets
        .replace(/\u00a0/g, ' ')   // non-breaking spaces collapse to plain ones
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}

/**
 * Index the catalog that was supplied to the prompt, so a marker can only
 * resolve to a product the model was actually shown.
 *
 * @param {{id: string, name: string}[]} products
 * @returns {Map<string, {productId: string, label: string}>}
 */
export function buildCatalogIndex(products = []) {
    const index = new Map()
    for (const product of products) {
        const id = String(product?.id ?? '')
        if (!/^[0-9a-fA-F]{24}$/.test(id)) continue
        const label = toInertText(String(product?.name ?? '')).slice(0, 120)
        index.set(id.toLowerCase(), { productId: id.toLowerCase(), label: label || 'this product' })
    }
    return index
}

/**
 * Turn a raw model reply into the API's structured result.
 *
 * @param {string} raw
 * @param {Map<string, {productId: string, label: string}>} catalogIndex
 * @returns {{ text: string, links: {productId: string, label: string}[] }}
 */
export function parseModelReply(raw, catalogIndex = new Map()) {
    const links = []
    const seen = new Set()

    // Resolve well-formed markers first: each becomes the product's own name in
    // the running text, plus one entry in `links`.
    let text = String(raw ?? '').replace(PRODUCT_MARKER_PATTERN, (_match, id) => {
        const entry = catalogIndex.get(String(id).toLowerCase())
        if (!entry) return ''
        if (!seen.has(entry.productId)) {
            if (links.length >= MAX_LINKS_PER_REPLY) return entry.label
            seen.add(entry.productId)
            links.push({ productId: entry.productId, label: entry.label })
        }
        return entry.label
    })

    // Anything still marker-shaped was malformed, unknown, or an attempt to put
    // something other than an id in the slot. It is removed, never relayed.
    text = text.replace(ANY_PRODUCT_MARKER, '')

    return { text: toInertText(text).slice(0, MAX_REPLY_LENGTH), links }
}

// ---------------------------------------------------------------------------
// Model client — Groq, through the OpenAI-compatible SDK
// ---------------------------------------------------------------------------
//
// This used to call OpenAI directly, on a paid key, and the chatbot's real
// production failure was a 429 — a billing/quota state on that account, not a
// bug this code could fix. Groq's chat-completions endpoint is
// OpenAI-compatible (same request/response shape, same `openai` npm client,
// only a different `baseURL`), and its free tier is a real free tier — rate
// limits, not a trial that expires — so the swap is a `baseURL`, a key and a
// model name, not a rewrite. Everything downstream of `getClient()` — the
// prompt, the marker-parsing contract, the error handling — is unchanged.

/**
 * `llama-3.3-70b-versatile` — the model this constant named when the Groq
 * migration shipped — was gone within a day: `client.models.list()` against a
 * real key returned 404 `model_not_found`, not a deprecation warning. Providers
 * really do rotate free-tier model names faster than this file gets edited,
 * which is the whole reason `GROQ_MODEL` exists as an override.
 *
 * `qwen/qwen3.8-27b` was picked from the account's actual live model list
 * (`console.groq.com/docs/models` or `client.models.list()`), not from
 * memory, and verified against this file's real `SYSTEM_PROMPT` and catalog
 * shape before being set here — it followed the `[[product:<id>]]` marker
 * contract correctly and refused to invent the warranty/tracking policy the
 * prompt tells it does not exist, across three separate prompts, all with
 * `finish_reason: "stop"`.
 *
 * That last part is not incidental. `openai/gpt-oss-20b` and
 * `openai/gpt-oss-120b` — also live on this account — are reasoning models:
 * they spend their token budget on a hidden `reasoning` field first and only
 * write `content` once that finishes. Every 200-token probe against them
 * came back with an **empty `content`** and `finish_reason: "length"` — the
 * budget ran out inside the hidden reasoning before a customer-facing word
 * was ever written, which is a silent empty reply, not an error `getClient`
 * can catch. `qwen/qwen3.8-27b` writes `content` directly.
 *
 * Also deliberately not `groq/compound` / `groq/compound-mini`: those are
 * Groq's own agentic systems with server-side tool use and live web search
 * built in, which is a materially different security posture than "a pure
 * text completion with no tool access" — the property the chatbot's whole
 * threat model rests on (SEC-004 and the chatbot security test suite).
 */
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'

/**
 * Build the Groq client, or null when no key is configured.
 *
 * Two things carried over from the OpenAI version of this function, and both
 * still matter here. The key is not read out of `.env` from disk by hand —
 * `server.js` owns configuration — and, more importantly, **no part of the
 * key is ever printed**. A key is either configured or it is not; that is all
 * a log line needs to say.
 */
const initializeGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    logger.warn({ event: 'groq.disabled' }, 'GROQ_API_KEY is not set — the chatbot returns its offline reply');
    return null;
  }

  if (!apiKey.startsWith('gsk_')) {
    logger.warn({ event: 'groq.key_format' }, 'GROQ_API_KEY does not have the expected format — the chatbot returns its offline reply');
    return null;
  }

  try {
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      dangerouslyAllowBrowser: false, // Only used server-side
    });
    logger.info({ event: 'groq.ready' }, 'Groq client initialised');
    return client;
  } catch (error) {
    logger.error({ event: 'groq.init_failed', name: error?.name }, 'failed to initialise the Groq client');
    return null;
  }
};

let groqClient
/** Lazily built so importing this module needs no configuration (B-0). */
function getClient() {
    if (groqClient === undefined) groqClient = initializeGroqClient()
    return groqClient
}

/** Test seam: forget the memoised client so a later env change is picked up. */
export function resetGroqClient() {
    groqClient = undefined
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The catalog, reduced to the fields the model needs.
 *
 * Every string is passed through `toInertText` on the way in. Product names and
 * descriptions are admin-controlled free text, and before Phase 1 they were
 * injected into the prompt verbatim — a description could steer the model's
 * output for every visitor who opened the chat. Stripping markup at this
 * boundary means catalog text cannot re-introduce the sink from the other side.
 *
 * Trimming the prompt further (BE-013) is Phase 3; the description is still
 * sent, only bounded.
 */
async function fetchDBProducts() {
  try {
    const products = await productModel.find({}, 'name price description brand tags').lean();

    return products.map(product => ({
      id: product._id.toString(),
      name: toInertText(product.name).slice(0, 120),
      price: `$${product.price}`,
      description: toInertText(product.description).slice(0, 400),
      brand: toInertText(product.brand ?? '').slice(0, 60),
      tags: toInertText((product.tags ?? []).join(', ')).slice(0, 120),
    }));
  } catch (error) {
    logger.error({ event: 'chat.catalog_failed', name: error?.name }, 'could not load the catalog for the chatbot');
    // Return an empty array on error so the chat degrades rather than breaking.
    return [];
  }
}

// ---------------------------------------------------------------------------
// One turn
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT =
  "You are a professional customer service agent for Netronix, a premium tech and computer e-commerce store. " +
  "You are helpful, friendly and knowledgeable. Only recommend products from the provided list and never invent products. " +
  "Reply in PLAIN TEXT only. Never write HTML, never write markdown, never write a URL. " +
  "To refer to a specific product, write the marker [[product:PRODUCT_ID]] using the exact id field from the product " +
  "data — for example [[product:0123456789abcdef01234567]]. The application turns that marker into a link for the " +
  "customer, so do not describe or format the link yourself. " +
  "Refer to at most three products in one reply. " +
  "Delivery anywhere in Lebanon, which is the target market, is $3. " +
  // The model is handed the catalog and nothing else, so the catalog is the
  // only thing it can answer from. Without this it answered questions about
  // returns, warranties and tracking the way any assistant does — plausibly,
  // and entirely out of its own head. None of the three exists: there is no
  // returns process, no warranty programme and no tracking anywhere in this
  // API, the models or the admin console, and an invented policy is worse than
  // a refusal because the customer cannot tell it apart from a real one.
  "Netronix has no returns process, no warranty programme, and no order tracking or courier " +
  "integration of any kind. If you are asked about any of them, say plainly that the shop does not " +
  "offer it and suggest writing to contact@minnagency.com. Never invent a policy, a delivery date, " +
  "a tracking number or a discount code.";

/** The reply used whenever the model cannot be reached. Always structured. */
const fallback = (message) => ({ success: false, message, text: message, links: [] })

/** Only the two roles a stored transcript holds, and only strings. */
const asPromptMessages = (history) =>
  (Array.isArray(history) ? history : [])
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string')
    .map((entry) => ({ role: entry.role, content: entry.content }))

/**
 * Process one chat turn.
 *
 * Stateless by construction: the caller owns the session and hands over the
 * history it wants replayed. There is nothing here for a restart to lose.
 *
 * @param {string} message  the customer's turn
 * @param {{history?: {role: string, content: string}[]}} context
 * @returns {Promise<{success: boolean, message: string, text: string,
 *                    links: {productId: string, label: string}[]}>}
 */
async function processChatMessage(message, { history = [] } = {}) {
  try {
    const openai = getClient()
    if (!openai) {
      return fallback("Our AI service is temporarily unavailable. Please try again later.");
    }

    const availableProducts = await fetchDBProducts();
    const catalogIndex = buildCatalogIndex(availableProducts);

    const toolsMessage = {
      role: "system",
      content:
        `Available products:\n${JSON.stringify(availableProducts)}\n\n` +
        "Reminder: plain text only. Reference a product with [[product:<its id>]] and nothing else. " +
        "Never emit HTML, markdown or a URL."
    };

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      toolsMessage,
      ...asPromptMessages(history),
      { role: "user", content: String(message ?? '') },
    ];

    const completion = await openai.chat.completions.create({
      messages: apiMessages,
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      max_tokens: 200
    });

    const rawContent = completion.choices[0].message.content

    // A reasoning model's failure mode, found while switching this file onto
    // Groq (see `DEFAULT_MODEL`'s own comment). `openai/gpt-oss-20b` spent its
    // whole 200-token budget on a hidden `reasoning` field and left `content`
    // empty; a sibling of the model this file actually uses, `qwen/qwen3.6-27b`,
    // put the reasoning trace **inside** `content` itself as `<think>…</think>`
    // and ran out of budget before ever reaching an answer. `toInertText`
    // strips the tag — it was built for HTML injection, SEC-004 — but the plain
    // text *inside* the tag is not markup, so it would have passed straight
    // through and been shown to a customer as though it were the reply.
    //
    // `DEFAULT_MODEL` does neither of these things, verified by hand against
    // this exact prompt (`scripts/checkGroqModel.js`). This guard is not a
    // claim that every reasoning model formats its thinking this one way; it is
    // a check for the two concrete shapes that have actually been observed, so
    // that a future `GROQ_MODEL` override landing on a reasoning model fails
    // honestly instead of leaking its internal monologue.
    const looksLikeLeakedReasoning = !rawContent?.trim() || /^\s*<think\b/i.test(rawContent)
    if (looksLikeLeakedReasoning) {
      logger.warn(
        { event: 'chat.reasoning_leak', model: process.env.GROQ_MODEL || DEFAULT_MODEL },
        'model reply looked like unfinished reasoning output rather than an answer',
      )
      return fallback("Our AI service is temporarily unavailable. Please try again later.");
    }

    const { text, links } = parseModelReply(rawContent, catalogIndex);

    return { success: true, message: text, text, links };
  } catch (error) {
    logger.error({ event: 'chat.failed', name: error?.name }, 'chat message could not be processed');

    if (error.status === 401) {
      return fallback("Authentication error with our AI service. Please contact support.");
    }
    if (error.status === 429) {
      return fallback("Our AI service is currently experiencing high demand. Please try again in a moment.");
    }
    return fallback("Sorry, I encountered an error processing your request. Please try again later.");
  }
}

export { processChatMessage };
