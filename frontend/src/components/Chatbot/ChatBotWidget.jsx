import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMessageSquare, FiX } from 'react-icons/fi';

import ChatInterface from './ChatInterface'

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

  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((open) => !open), [])

  return (
    <>
      <AnimatePresence>
        {isOpen && <ChatInterface onClose={close} />}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close support chat' : 'Open support chat'}
        aria-haspopup="dialog"
        className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-r from-[#6a5acd] to-[#8470ff] rounded-full shadow-lg flex items-center justify-center text-white z-40"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        {isOpen ? <FiX aria-hidden="true" className="w-6 h-6" /> : <FiMessageSquare aria-hidden="true" className="w-6 h-6" />}
      </motion.button>
    </>
  )
}

export default ChatBotWidget
