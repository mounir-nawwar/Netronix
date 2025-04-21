import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import ChatButton from './ChatButton'
import ChatInterface from './ChatInterface'

const ChatBotWidget = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)

  // Show welcome hint after a delay if user hasn't interacted
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasInteracted) {
        setHasInteracted(true)
      }
    }, 8000)

    return () => clearTimeout(timer)
  }, [hasInteracted])

  const handleToggleChat = () => {
    setIsOpen(prev => !prev)
    setHasInteracted(true)
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && <ChatInterface onClose={handleToggleChat} />}
      </AnimatePresence>
      <ChatButton onClick={handleToggleChat} isOpen={isOpen} hasInteracted={hasInteracted} />
    </>
  )
}

export default ChatBotWidget
