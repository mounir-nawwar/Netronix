import { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { IoMdSend } from "react-icons/io";
import { FiX, FiMessageSquare } from "react-icons/fi";

import * as chatApi from '../../api/chat';
import useDialog from '../../lib/useDialog';
import { CONTACT_EMAIL, buildMailto } from '../../lib/contact';
import Button from '../Button';

// SEC-004 — the XSS sink that used to live here is gone.
//
// This component previously rendered every bot reply through React's raw-HTML
// escape hatch, after passing it through a local rewriting helper that turned
// `<a href='/product/…'>` into absolute URLs and sanitised nothing else. The API
// asked the model for raw HTML and the browser executed whatever came back.
// Neither the sink nor that helper exists any more. Both are referred to by
// description rather than by name here, so that the Gate 1 repository scans for
// their identifiers keep returning nothing and stay meaningful as checks.
//
// The API returns plain `text` plus a validated `links: [{ productId, label }]`,
// so there is no markup to render. Text goes through JSX, which escapes it, and
// each link is a React Router <Link> whose destination this component builds
// from an id it has re-checked itself.
//
// PHASE 3 — three defects in the session lifecycle (FE-028, FE-029, FE-030).
//
//   * **FE-029, the guest branch.** `if (!token)` set a greeting, generated a
//     local id — and then **fell through** to the API call anyway, which
//     immediately overwrote both. The branch existed, ran, and did nothing; the
//     guest path was the authenticated path with a wasted render in front of it.
//     There is no guest branch now, because there never needed to be one: the
//     endpoint is public and the backend ignores the token.
//
//   * **FE-028, the session was never ended.** The cleanup returned by the
//     mount effect closed over `sessionId` from the *first* render, when it is
//     still `null`, so `if (sessionId)` was false every time and
//     `/api/chatbot/end` was never called. Every conversation leaked a session.
//     The id lives in a ref, so unmount sees the current one.
//
//   * **FE-030, the invented product.** A hardcoded 24-hex id was used as the
//     link target whenever the model produced none. It pointed at one row in one
//     database; everywhere else it was a link to a product page for a product
//     that is not there. Only ids the server sent are rendered.
//
// Dialog semantics, a focus trap and focus restoration are A11Y-002, Phase 4
// task 4.8. The `role="log" aria-live="polite"` transcript is already here: it
// came with the structural change in Phase 1, because it is what makes a link
// announceable at all.

/** Defence in depth: the server already validates these, so must the client. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

const usableLinks = (links) =>
  (Array.isArray(links) ? links : [])
    .filter((link) => link && OBJECT_ID.test(String(link.productId)))
    .map((link) => ({
      productId: String(link.productId),
      label: typeof link.label === 'string' && link.label.trim() !== '' ? link.label : 'View product',
    }));

/** Maximum characters the server accepts in one message (SEC-023). */
const MESSAGE_MAX_LENGTH = 1000;

/**
 * How long a silent conversation stays open.
 *
 * Deliberately shorter than the server's session TTL, so the client closes a
 * forgotten tab's session rather than leaving it for the TTL index to reap.
 */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

const GREETING_FALLBACK = 'Hello! Welcome to Netronix support chat. How can I help you today?';

const ChatInterface = ({ onClose }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  /**
   * The assistant is reachable but not answering.
   *
   * The API returns HTTP 200 with a canned sentence whenever the model cannot
   * be reached — no key, an expired one, a 429 from the provider — so without
   * this the widget rendered a total outage as one unhelpful reply, repeated
   * for every question asked. That is the shape the failure was reported in:
   * "the chatbot isn't working", from a chat that looked like it was.
   */
  const [unavailable, setUnavailable] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // A11Y-002 — `role="dialog"`, `aria-modal`, a focus trap, Escape, and focus
  // back on the launcher when it closes. Escape used to be handled in
  // `ChatButton`, a component that no longer exists (FE-027); the transcript's
  // `role="log" aria-live="polite"` — without which a screen-reader user was
  // never told a reply had arrived — landed in Phase 3 and is below.
  //
  // No scroll lock: the chat is a corner panel, not a full-screen overlay, and
  // freezing the page behind it would be a change in behaviour rather than a
  // fix.
  const { ref: dialogRef } = useDialog({ open: true, onClose: onClose });

  /**
   * The live session id (FE-028).
   *
   * A ref rather than state because the unmount cleanup has to read the
   * *current* one. As state it was captured at first render — `null` — so the
   * `if (sessionId)` guard in the cleanup was false on every unmount and the
   * session was never ended.
   */
  const sessionIdRef = useRef(null);
  /** Ends exactly once, whether by the close button or by unmounting. */
  const endedRef = useRef(false);

  const endChatSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || endedRef.current) return;

    endedRef.current = true;
    sessionIdRef.current = null;

    try {
      await chatApi.endChat(sessionId);
    } catch (error) {
      // The session expires on its own (BE-001's TTL index), so a failure here
      // costs nothing a customer can see. It is logged rather than shown.
      console.error('Could not end the chat session', error);
    }
  }, []);

  // Close a conversation that has gone quiet.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS) handleEndChat();
    }, INACTIVITY_TIMEOUT_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastActivity]);

  /**
   * Open a session.
   *
   * One path, for everybody. The endpoint is public and the backend derives the
   * customer from a verified token when there is one, so the guest branch this
   * used to have — which set state and then fell through to the same call —
   * was never a different behaviour, only a wasted render.
   */
  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      setIsTyping(true);
      try {
        const { sessionId, greeting, degraded } = await chatApi.startChat();
        if (cancelled) {
          // Unmounted mid-flight: end the session we just opened rather than
          // leaving it for the TTL index.
          if (sessionId) chatApi.endChat(sessionId).catch(() => { });
          return;
        }

        sessionIdRef.current = sessionId;
        setUnavailable(degraded);
        setMessages([{
          type: 'bot',
          text: greeting?.text || GREETING_FALLBACK,
          links: usableLinks(greeting?.links),
          timestamp: greeting?.timestamp ? new Date(greeting.timestamp) : new Date(),
        }]);
      } catch (error) {
        if (cancelled) return;
        console.error('Could not start the chat session', error);
        // Honest about what happened, and without a session id, so nothing
        // later tries to send into a conversation that was never opened.
        //
        // Marking it unavailable is what stops the composer accepting input
        // it cannot send: `handleSendMessage` returns early when there is no
        // session, so before this the Send button did *nothing at all* — no
        // bubble, no error, the typed text just sat in the box.
        setUnavailable(true);
        setMessages([{
          type: 'bot',
          text: 'Support chat is unavailable right now. Please try again in a moment.',
          links: [],
          timestamp: new Date(),
        }]);
      } finally {
        if (!cancelled) setIsTyping(false);
      }
    };

    initialise();

    return () => {
      cancelled = true;
      endChatSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to the latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus on input when chat opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Close the conversation and the panel, in that order. */
  const handleEndChat = async () => {
    await endChatSession();
    onClose();
  };

  const handleSendMessage = async () => {
    if (unavailable) return;          // nothing is going to answer it
    if (message.trim() === '') return;
    if (!sessionIdRef.current) return;   // no session, nothing to send into

    setLastActivity(Date.now());

    const messageToSend = message;
    setMessages(prev => [...prev, { type: 'user', text: messageToSend, links: [], timestamp: new Date() }]);
    setMessage('');
    setIsTyping(true);

    try {
      const reply = await chatApi.sendChatMessage({
        sessionId: sessionIdRef.current,
        message: messageToSend,
      });
      if (reply.degraded) setUnavailable(true);
      setMessages(prev => [...prev, {
        type: 'bot',
        text: reply.text || 'I received your message.',
        links: usableLinks(reply.links),
        timestamp: new Date(),
      }]);
    } catch (error) {
      // FE-029's other half. The old fallback answered *on the model's behalf*
      // with invented policy — "free shipping on orders over $50", "returns
      // within 30 days" — neither of which this shop offers. Saying nothing is
      // better than saying something untrue in the shop's own voice.
      console.error('Chat message failed', error);
      setMessages(prev => [...prev, {
        type: 'bot',
        text: 'Sorry, I could not reach support just then. Please try again.',
        links: [],
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // The four questions offered on opening — which are also four promises about
  // what this assistant can do.
  //
  // They used to be "What are your shipping options?", "Do you offer warranty?",
  // "How can I track my order?" and "Are there any ongoing promotions?". Three
  // of the four are things the shop does not have, and the fourth is a thing it
  // does not run; `AIclient.js` hands the model the product catalog and nothing
  // else, so every one of those was an invitation to answer from thin air.
  //
  // These four are answerable from the catalog, plus the one logistics fact the
  // system prompt genuinely carries: the flat $3 delivery charge.
  const quickReplies = [
    "What laptops do you have in stock?",
    "Compare your gaming laptops",
    "Which MacBook has the most storage?",
    "What does delivery cost?"
  ];

  // Format timestamp
  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-dialog-title"
      // Square now, `bg-plate` and a hairline `border-rule` in place of
      // `rounded-xl bg-white`, matching `AccountMenu` — the other floating
      // panel on the site with the same spring entrance. The panel-anchoring
      // classes (`left-4 right-4 … sm:left-auto sm:w-80`) are unchanged: a
      // design test pins them literally, and they are not a colour or shape
      // decision, only a position and a width.
      className="fixed bottom-4 left-4 right-4 z-50 flex h-[min(500px,calc(100dvh-2rem))] flex-col overflow-hidden border border-rule bg-plate shadow-[0_8px_24px_rgba(18,18,20,0.14)] sm:bottom-8 sm:left-auto sm:right-8 sm:w-80 md:w-96"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {/* Header — solid `ink`, not a purple-to-lavender gradient. The same
          fill `Button`'s `solid` variant and the launcher use, so the panel
          reads as the same product as the tile that opened it. */}
      <div className="flex items-center justify-between bg-ink px-4 py-3.5 text-paper">
        <div className="flex items-center gap-2">
          <FiMessageSquare aria-hidden="true" className="h-4 w-4" />
          <h2 id="chat-dialog-title" className="font-michroma text-[10px] uppercase tracking-[0.18em]">
            Netronix Support
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Named, because it is the control that ends the session (FE-028)
              and a test has to be able to find it the way a person does. The
              wider dialog semantics — role, modality, focus trap — are A11Y-002
              in Phase 4. Plain `<button>`, not `motion.button`: no control on
              the site scales on hover any more (`Button.jsx`), and this one
              should not be the exception. */}
          <button
            type="button"
            onClick={handleEndChat}
            aria-label="End chat"
            className="p-1.5 transition-colors hover:bg-paper/10"
          >
            <FiX aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto bg-wash" role="log" aria-live="polite" aria-label="Chat transcript">
        <AnimatePresence>
          {messages.map((msg, index) => (
            <motion.div
              key={`msg-${index}`}
              className={`mb-4 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Square, like every other surface on the site now — no
                  `rounded-xl`, so no cut corner to name `rounded-tr/tl-none`
                  against either. `ink`/`paper` for a customer's own message,
                  the same solid fill the header, the launcher and every
                  primary button on the site share; `plate` with a hairline
                  `border-rule` for the assistant's, matching `AccountMenu`
                  and the products dropdown. */}
              <div
                className={`max-w-[80%] p-3 ${
                  msg.type === 'user'
                    ? 'bg-ink text-paper'
                    : 'border border-rule bg-plate'
                }`}
              >
                {/* Both halves render through JSX, so text is escaped whoever
                    wrote it — the customer, the model, or a product name. */}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>

                {msg.type === 'bot' && msg.links && msg.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.links.map((link) => (
                      <Link
                        key={link.productId}
                        to={`/product/${link.productId}`}
                        // A11Y — `text-blue-500` on `bg-blue-50` measures
                        // ~3.3:1, a real "serious" axe violation. Unreachable
                        // while the assistant has no key: `links` is always
                        // `[]` in that state, so this never rendered where any
                        // scan could find it — until the day the key arrives.
                        // Square now, and inverts to `ink`/`paper` on hover —
                        // the same filled-on-hover the site's tags and
                        // buttons already use — rather than a rounded pill
                        // that only ever underlined.
                        className="bg-wash px-2 py-0.5 text-sm font-medium text-statepurp transition-colors hover:bg-ink hover:text-paper"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}

                {/* `ink-40`, not `text-gray-500` (#6b7280 ≈ 4.8:1 on white,
                    close enough to the 4.5:1 line that a mid-fade axe scan
                    caught it as a violation on other pages before). This
                    bubble is `bg-plate` (`#ffffff`, the same white by name),
                    one of the three surfaces `tailwind.config.js` verifies
                    `ink-40` against — 5.2:1 here. */}
                <p className={`text-[10px] mt-1 text-right ${
                  msg.type === 'user' ? 'text-paper/70' : 'text-ink-40'
                }`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <motion.div
              key="typing-indicator"
              className="flex justify-start mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Square bubble, matching the assistant's message bubbles above
                  — the dots inside stay circular. That is a legitimate,
                  narrow exception to the site's hard edges: a bouncing square
                  reads as a glitch, not as "typing", and this is the one
                  universally-understood shape for it. Recoloured from the raw
                  `#6a5acd` to `ink-40`: this is a processing state, not a
                  resting accent fill, the same distinction the toasts and the
                  offline notice below already draw. */}
              <div className="border border-rule bg-plate p-3">
                <div className="flex space-x-1">
                  <motion.div
                    className="w-2 h-2 bg-ink-40 rounded-full"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-ink-40 rounded-full"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-ink-40 rounded-full"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </AnimatePresence>
      </div>

      {/* Quick Replies.
          Hidden entirely when the assistant is offline. Leaving them up would
          be the same defect the notice below fixes, in a smaller frame: a
          prompt to ask a question nothing is going to answer. Disabling them
          would be honest too, but a row of dead chips is clutter — there is
          nothing to suggest. */}
      {!unavailable && (
      <div className="border-t border-rule bg-plate px-4 py-3">
        {/* `ink-40` and the eyebrow treatment, not `text-gray-500` in the body
            face — this row is hidden whenever `unavailable` is true, so it
            never rendered where the E2E harness (no API key, always degraded)
            could scan it, but it is the first thing a working assistant
            shows. */}
        <p className="mb-2 font-michroma text-[10px] uppercase tracking-[0.14em] text-ink-40">
          Suggested questions
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* Outline chips, not filled purple pills with a raw-hex hover —
              the same `border-rule` / `hover:border-ink` recipe every quiet
              action on the site uses now. A resting `statepurp` fill here was
              the one thing left treating the accent as decoration rather
              than as an interaction colour. */}
          {quickReplies.map((reply, index) => (
            <button
              key={`reply-${index}`}
              type="button"
              className="whitespace-nowrap border border-rule bg-plate px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink hover:bg-wash"
              onClick={() => {
                setMessage(reply);
                inputRef.current?.focus();
                setLastActivity(Date.now());
              }}
            >
              {reply}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Input Area */}
      <div className="border-t border-rule bg-plate p-3">
        {unavailable && (
          /* Said once, plainly, instead of answering every question with the
             same sentence. `role="status"` so it is announced rather than
             merely drawn — a visitor who cannot see the panel would otherwise
             keep typing into a composer that has stopped working.

             `border-ink`, not `statepurp` — the same call Contact's own
             hand-off notice makes and for the same reason: the accent is for
             interaction, and a status line sitting there at rest is not one. */
          <p
            role="status"
            className="mb-3 border-l-2 border-ink bg-wash px-3 py-2 text-xs text-ink-60"
          >
            The assistant is offline right now, so it cannot answer questions.
            Written questions go to{' '}
            <a
              href={buildMailto({ to: CONTACT_EMAIL, subject: 'Netronix enquiry' })}
              className="text-statepurp underline decoration-statepurp/30 underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        )}

        <div className="flex items-center gap-2">
          {/* `readOnly` + `aria-disabled` below, deliberately not `disabled`.
              An effect focuses this input on mount, and the offline state
              arrives a moment later when `/init` answers — so `disabled` would
              remove the element that currently holds focus, dropping focus to
              `<body>`, outside the panel. That breaks the focus trap A11Y-002
              exists to guarantee, and the browser suite caught it. Read-only
              keeps it in the tab order and reachable, so a keyboard or
              screen-reader user lands on it and is told why it is not
              accepting anything. */}
          <input
            ref={inputRef}
            type="text"
            value={message}
            maxLength={MESSAGE_MAX_LENGTH}
            aria-label="Message"
            readOnly={unavailable}
            aria-disabled={unavailable}
            onChange={(e) => {
              if (unavailable) return;
              setMessage(e.target.value);
              setLastActivity(Date.now());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSendMessage();
              }
              setLastActivity(Date.now());
            }}
            placeholder={unavailable ? 'The assistant is offline' : 'Type your message...'}
            // Square, `border-rule`/`bg-paper`/`focus:border-ink` — the same
            // `FIELD_CLASS` idiom `PlaceOrder` and `LogIn` use, not a rounded
            // pill with a ring focus that answered to nothing else on the
            // site. The disabled state was already `bg-paper text-ink-40`
            // (A11Y — `bg-gray-50 text-gray-500` measured ~4.6:1, close
            // enough to 4.5:1 that a scan catching it half a frame into the
            // offline notice's fade could tip it under; `ink-40` on `paper`
            // is verified at 5.0:1) — the base state now shares the same
            // `bg-paper`, so only the text colour and cursor change between
            // the two.
            className={`flex-1 border border-rule bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-40 transition-colors focus:border-ink focus:outline-none ${
              unavailable ? 'cursor-not-allowed text-ink-40' : ''
            }`}
          />
          {/* The shared button again — square, inverts to `statepurp` on
              hover, fades to 40% opacity when disabled rather than switching
              to a flat grey. Same reasoning as the launcher: one recipe. */}
          <Button
            type="button"
            variant="solid"
            onClick={handleSendMessage}
            aria-label="Send message"
            className="flex h-10 w-10 items-center justify-center"
            disabled={unavailable || message.trim() === '' || isTyping}
          >
            <IoMdSend aria-hidden="true" className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-2 text-center">
          {/* A11Y — this was `text-gray-400` (#9ca3af), 2.6:1 on white, well
              under the 4.5:1 AA threshold at 10px; the audit called it out by
              name and axe confirmed it, fixed onto `text-gray-600` (7.6:1).
              `ink-40` now, for the token rather than for the contrast — that
              contrast fight is already won at 7.6:1, this is only bringing
              the colour itself into the same family as every other small
              label on the site. `ink-40` clears 4.5:1 on every surface this
              panel uses regardless (`tailwind.config.js`). */}
          <p className="text-[10px] text-ink-40">Powered by Netronix AI</p>
        </div>
      </div>
    </motion.div>
  );
};

ChatInterface.propTypes = {
  onClose: PropTypes.func.isRequired,
};

export default ChatInterface;
