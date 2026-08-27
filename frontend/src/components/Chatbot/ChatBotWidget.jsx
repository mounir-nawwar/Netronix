import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FiMessageSquare, FiX } from 'react-icons/fi';
import { matchPath, useLocation } from 'react-router-dom';

import ChatInterface from './ChatInterface'
import Button from '../Button'
import { onOpenSupportChat } from '../../lib/supportChat.js'

// FE-027 — one widget, one owner of `isOpen`, one `ChatInterface`.
//
// There used to be two components, each holding its own open/closed state and
// each rendering its own `ChatInterface`:
//
//   * `ChatBotWidget` held `isOpen` and passed three props to `ChatButton`;
//   * `ChatButton` **declared no props at all**, ignored every one of them, and
//     held a second `isChatOpen` of its own.
//
// So the widget's state and its conditional `<ChatInterface>` were unreachable:
// the interface that actually opened was the button's, and the widget's copy
// never rendered. Two sources of truth for one dialog, one of them dead.
//
// `ChatButton.jsx` is gone. Dialog semantics, the focus trap and focus
// restoration landed in Phase 4 (A11Y-002) and live in `ChatInterface`, on the
// shared `useDialog` primitive — which is also what closes the panel on Escape
// now, so the widget no longer needs a key handler of its own.

const ChatBotWidget = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { pathname } = useLocation()
  const contactOwnsChatEntry = Boolean(matchPath({ path: '/contact', end: true }, pathname))

  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((open) => !open), [])

  // FE-014 — Contact's "Live Tech Support" card promised a chat and linked to
  // `#`, while the chat it was promising sat one component away with its open
  // state private to this file. The card asks for it by event now; the button
  // below remains the only other way in.
  useEffect(() => onOpenSupportChat(() => setIsOpen(true)), [])

  return (
    <>
      <AnimatePresence>
        {isOpen && <ChatInterface onClose={close} />}
      </AnimatePresence>

      {!contactOwnsChatEntry && (
        // The shared button, not a sixth hand-typed copy of its own recipe.
        // This was a purple-to-lavender gradient circle with its own
        // `whileHover`/`whileTap` scale spring — the one control on the site
        // that still announced itself as a different product. `Button`'s
        // `solid` variant carries no scale transform anywhere it is used
        // (`components/Button.jsx`'s own comment: colour and border were the
        // part actually duplicated eight times, motion never was), so none is
        // added here either.
        //
        // Still `isOpen ? <FiX> : <FiMessageSquare>` — not hidden while the
        // dialog is open, even though the dialog visually covers it at this
        // exact position. `useDialog`'s focus restoration
        // (`ChatInterface.jsx`) returns focus to *this element*, by reference,
        // when the dialog closes; unmounting it while open would swap in a new
        // DOM node on remount, `document.contains()` the old reference would
        // report false, and a keyboard user closing the chat would lose focus
        // to the document instead of landing back here.
        <Button
          type="button"
          variant="solid"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close support chat' : 'Open support chat'}
          aria-haspopup="dialog"
          className="fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center"
        >
          {isOpen ? <FiX aria-hidden="true" className="w-6 h-6" /> : <FiMessageSquare aria-hidden="true" className="w-6 h-6" />}
        </Button>
      )}
    </>
  )
}

export default ChatBotWidget
