import React from 'react'
import { IoMdSend } from "react-icons/io";

const ChatInterface = ({onClose}) => {
  return (
    <div className='w-30 h-30 fixed bottom-8 right-8 bg-white p-4 z-101'>
      <div className='flex justify-between'>
        <p>Customer Support</p>
        <button onClick={onClose}>X</button>
        
      </div>
      <hr className='border border-black'/>
      <div>
        <p>message1</p>
        <p>message2</p>
        <p>message3</p>
        <p>message4</p>
      </div>
      <hr className='border border-black'/>
      <div className='flex'>
        <input className='border-2 border-black p-1 m-2 rounded-xl' type="text" />
        <button className='rounded-full'><IoMdSend className='statepurp text-2xl'/></button>
      </div>
    </div>
  )
}

export default ChatInterface
