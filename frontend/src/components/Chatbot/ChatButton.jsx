import React from 'react'
import chatIcon from '../../assets/chatbotIcons/chat_icon.png'


const ChatButton = ({onClick}) => {
  return (
    <button
      onClick={onClick}
      className='w-14 h-14 fixed bottom-8 right-8 rounded-full z-101'
      //className='w-14 h-14 fixed bot bottom-8 right-8 rounded-full bg-statepurp z-51 p-4 bg-opacity-80'
    >
      <img width='56' height='56'
      src={chatIcon} alt="test" />
    </button>
  )
}

export default ChatButton
