import React from 'react'
import { useState } from 'react'
import ChatButton from './ChatButton'
import ChatInterface from './ChatInterface'

const ChatBotWidget = () => {
  const [isOpen,setIsOpen] = useState(false)
  return (
    <>
      <ChatButton onClick={() => setIsOpen(!isOpen)}  />
      <ChatInterface/>
    </>
  )
}

export default ChatBotWidget
