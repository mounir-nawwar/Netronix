import React from 'react'
import { useState } from 'react'
import ChatButton from './ChatButton'
import ChatInterface from './ChatInterface'

const ChatBotWidget = () => {
  const [isOpen,setIsOpen] = useState(false)
  return (
    <>
      {isOpen ? 
        <ChatInterface onClose={()=> setIsOpen(false)}/>
        : <ChatButton onClick={() => setIsOpen(!isOpen)} />
      }
    </>
  )
}

export default ChatBotWidget
