import { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { IoMdSend } from "react-icons/io";
import { FiX, FiMessageSquare } from "react-icons/fi";

import * as chatApi from '../../api/chat';
import useDialog from '../../lib/useDialog';
import { SUPPORT_EMAIL, buildMailto } from '../../lib/contact';

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

  // Quick replies for common questions
  const quickReplies = [
    "What are your shipping options?",
    "Do you offer warranty?",
    "How can I track my order?",
    "Are there any ongoing promotions?"
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
      className="fixed bottom-4 left-4 right-4 h-[min(500px,calc(100dvh-2rem))] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 sm:bottom-8 sm:left-auto sm:right-8 sm:w-80 md:w-96"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-[#6a5acd] to-[#8470ff] px-4 py-3 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiMessageSquare aria-hidden="true" className="w-5 h-5" />
          <h2 id="chat-dialog-title" className="font-michroma text-sm">Netronix Support</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Named, because it is the control that ends the session (FE-028)
              and a test has to be able to find it the way a person does. The
              wider dialog semantics — role, modality, focus trap — are A11Y-002
              in Phase 4. */}
          <motion.button
            type="button"
            onClick={handleEndChat}
            aria-label="End chat"
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <FiX aria-hidden="true" className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50" role="log" aria-live="polite" aria-label="Chat transcript">
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
              <div
                className={`max-w-[80%] rounded-xl p-3 ${
                  msg.type === 'user'
                    ? 'bg-[#6a5acd] text-white rounded-tr-none'
                    : 'bg-white border border-gray-200 shadow-sm rounded-tl-none'
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
                        className="text-blue-500 font-medium text-sm hover:underline bg-blue-50 px-2 py-0.5 rounded-md transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}

                <p className={`text-[10px] mt-1 text-right ${
                  msg.type === 'user' ? 'text-white/70' : 'text-gray-500'
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
              <div className="bg-white border border-gray-200 shadow-sm rounded-xl rounded-tl-none p-3">
                <div className="flex space-x-1">
                  <motion.div
                    className="w-2 h-2 bg-[#6a5acd] rounded-full"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-[#6a5acd] rounded-full"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-[#6a5acd] rounded-full"
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
      <div className="px-4 py-2 border-t border-gray-100 bg-white">
        <p className="text-xs font-michroma text-gray-500 mb-2">Suggested questions:</p>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {quickReplies.map((reply, index) => (
            <button
              key={`reply-${index}`}
              type="button"
              className="px-3 py-1.5 bg-gray-100 text-[#6a5acd] text-xs rounded-full whitespace-nowrap hover:bg-[#f5f3ff] transition-colors"
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
      <div className="p-3 border-t border-gray-200 bg-white">
        {unavailable && (
          /* Said once, plainly, instead of answering every question with the
             same sentence. `role="status"` so it is announced rather than
             merely drawn — a visitor who cannot see the panel would otherwise
             keep typing into a composer that has stopped working. */
          <p
            role="status"
            className="mb-3 border-l-2 border-[#6a5acd] bg-gray-50 px-3 py-2 text-xs text-gray-700"
          >
            The assistant is offline right now, so it cannot answer questions.
            Email{' '}
            <a
              href={buildMailto({ to: SUPPORT_EMAIL, subject: 'Support request' })}
              className="underline decoration-[#6a5acd]/40 underline-offset-2"
            >
              {SUPPORT_EMAIL}
            </a>{' '}
            and a person will reply.
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
            className={`flex-1 border border-gray-200 rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] text-sm ${
              unavailable ? 'cursor-not-allowed bg-gray-50 text-gray-500' : ''
            }`}
          />
          <motion.button
            type="button"
            onClick={handleSendMessage}
            aria-label="Send message"
            className="w-10 h-10 rounded-full bg-[#6a5acd] text-white flex items-center justify-center disabled:cursor-not-allowed disabled:bg-gray-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={unavailable || message.trim() === '' || isTyping}
          >
            <IoMdSend aria-hidden="true" className="w-5 h-5" />
          </motion.button>
        </div>
        <div className="mt-2 text-center">
          {/* A11Y — `text-gray-400` (#9ca3af) on white is 2.6:1, well under
              the 4.5:1 AA threshold, and at 10px. The audit called this one out
              by name; axe confirmed it. `text-gray-600` is 7.6:1 and the line
              still reads as fine print. */}
          <p className="text-[10px] text-gray-600">Powered by Netronix AI</p>
        </div>
      </div>
    </motion.div>
  );
};

ChatInterface.propTypes = {
  onClose: PropTypes.func.isRequired,
};

export default ChatInterface;
