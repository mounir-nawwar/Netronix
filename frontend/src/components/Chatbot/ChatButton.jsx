import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageSquare, FiX } from 'react-icons/fi';
import ChatInterface from './ChatInterface';
import { ShopContext } from '../../context/ShopContext';

const ChatButton = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Close chat on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isChatOpen) {
        setIsChatOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isChatOpen]);

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
  };

  return (
    <>
      <AnimatePresence>
        {isChatOpen && <ChatInterface onClose={() => setIsChatOpen(false)} />}
      </AnimatePresence>

      <motion.button
        onClick={toggleChat}
        className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-r from-[#6a5acd] to-[#8470ff] rounded-full shadow-lg flex items-center justify-center text-white z-40"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        {isChatOpen ? (
          <FiX className="w-6 h-6" />
        ) : (
          <FiMessageSquare className="w-6 h-6" />
        )}
      </motion.button>
    </>
  );
};

export default ChatButton;
