import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoMdSend } from "react-icons/io";
import { FiX, FiMessageSquare, FiChevronDown, FiUser, FiInfo } from "react-icons/fi";
import axios from 'axios';
import { ShopContext } from '../../context/ShopContext';
import { toast } from 'react-toastify';

// Helper function to process AI responses and convert text links to proper button links
const processAIResponse = (text, frontendUrl) => {
  if (!text) return '';
  
  // First replace undefined/product links (old format)
  let processedText = text.replace(/<a href='undefined\/product\/([^']+)'[^>]*>here<\/a>/g, 
    `<a href='${frontendUrl}/product/$1' class="text-blue-500 font-medium hover:underline bg-blue-50 px-2 py-0.5 rounded-md transition-colors" target="_blank">here</a>`);
  
  // Then replace /product links (new format)
  processedText = processedText.replace(/<a href='\/product\/([^']+)'[^>]*>here<\/a>/g, 
    `<a href='${frontendUrl}/product/$1' class="text-blue-500 font-medium hover:underline bg-blue-50 px-2 py-0.5 rounded-md transition-colors" target="_blank">here</a>`);
  
  // If we still don't have a link and the text mentions a product with "find it here"
  if (!processedText.includes('<a') && processedText.toLowerCase().includes('find it here')) {
    // Hard-coded product ID for Razer Cobra Pro (in a real app you'd look this up)
    const razerId = '65f3c0d2e5c25ad8e9a3ca01';
    
    processedText = processedText.replace(/find it here/i, 
      `find it <a href='${frontendUrl}/product/${razerId}' class="text-blue-500 font-medium hover:underline bg-blue-50 px-2 py-0.5 rounded-md transition-colors" target="_blank">here</a>`);
  }
  
  return processedText;
};

const ChatInterface = ({ onClose }) => {
  const { backendUrl, frontendUrl, token } = useContext(ShopContext);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Auto-close chat after 5 minutes of inactivity
  useEffect(() => {
    const inactivityTimer = setTimeout(() => {
      const inactiveTime = Date.now() - lastActivity;
      if (inactiveTime > 5 * 60 * 1000) { // 5 minutes
        handleEndChat();
      }
    }, 5 * 60 * 1000); // Check after 5 minutes
    
    return () => clearTimeout(inactivityTimer);
  }, [lastActivity]);
  
  // Initialize chat session
  useEffect(() => {
    initializeChat();
    
    // Cleanup function to end chat session when component unmounts
    return () => {
      if (sessionId) {
        endChatSession();
      }
    };
  }, []);
  
  // Auto-scroll to the latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus on input when chat opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  // Initialize chat session with backend
  const initializeChat = async () => {
    try {
      setIsTyping(true);
      
      // Simple welcome message for anonymous users
      if (!token) {
        setMessages([
          { 
            type: 'bot', 
            text: "Hello! Welcome to Netronix support chat. How can I help you today?", 
            timestamp: new Date() 
          }
        ]);
        setIsTyping(false);
        
        // Generate a temporary local session ID
        setSessionId('guest-' + Math.random().toString(36).substring(2, 15));
      }
      
      // For logged-in users, use the backend API
      const response = await axios.post(
        `${backendUrl}/api/chatbot/init`, 
        {}, 
        { headers: { token } }
      );
      
      if (response.data.success) {
        setSessionId(response.data.sessionId);
        
        // Add the initial welcome message
        const greeting = response.data.greeting;
        setMessages([
          { 
            type: 'bot', 
            text: greeting.text || "Hello! Welcome to Netronix support chat. How can I help you today?", 
            timestamp: new Date(greeting.timestamp) 
          }
        ]);
      } else {
        toast.error(response.data.message || 'Failed to connect to customer support');
      }
      
      setIsTyping(false);
    } catch (error) {
      console.error("Error initializing chat:", error);
      setIsTyping(false);
      
      // For any error, fall back to local chat mode
      setMessages([
        { 
          type: 'bot', 
          text: "Hello! Welcome to Netronix support chat. How can I help you today?", 
          timestamp: new Date() 
        }
      ]);
      
      // Generate a temporary local session ID
      setSessionId('guest-' + Math.random().toString(36).substring(2, 15));
    }
  };
  
  // Send message to the backend
  const sendMessageToBackend = async (messageText) => {
    try {
      setLastActivity(Date.now());
      
      if (!sessionId) {
        toast.error('Chat session not initialized');
        return null;
      }
      
      // For guest users or if no token available, provide simple responses
      
      
      const response = await axios.post(
        `${backendUrl}/api/chatbot/message`, 
        { 
          sessionId, 
          message: messageText 
        }, 
        { headers: { token } }
      );
      
      // Extract the message text from the response
      let botText = "";
      if (response.data.success && response.data.message) {
        // Handle both string and object formats
        botText = typeof response.data.message === 'string' 
          ? response.data.message 
          : (response.data.message.text || "I received your message.");
      }
      
      return {
        success: true,
        message: botText
      };
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Fall back to guest message handling for any errors
      return handleGuestMessage(messageText);
    }
  };
  
  // Simple guest message handler for users without authentication
  const handleGuestMessage = (messageText) => {
    // Very simple response logic for guest users
    const lowercaseMessage = messageText.toLowerCase();
    let response = "";
    
    if (lowercaseMessage.includes("hello") || lowercaseMessage.includes("hi")) {
      response = "Hello there! How can I help you with our tech products today?";
    }
    else if (lowercaseMessage.includes("price") || lowercaseMessage.includes("cost")) {
      response = "Our products are available at different price points. You can check specific prices on our product pages.";
    }
    else if (lowercaseMessage.includes("laptop") || lowercaseMessage.includes("computer")) {
      response = "We offer a wide range of laptops including gaming, professional, and ultrabook models. Would you like to know more about a specific category?";
    }
    else if (lowercaseMessage.includes("shipping") || lowercaseMessage.includes("delivery")) {
      response = "We offer free shipping on orders over $50, and express shipping options are available at checkout.";
    }
    else if (lowercaseMessage.includes("return") || lowercaseMessage.includes("refund")) {
      response = "Our return policy allows returns within 30 days of purchase with original packaging. Please check our Returns page for more details.";
    }
    else if (lowercaseMessage.includes("thank")) {
      response = "You're welcome! Is there anything else I can help with?";
    }
    else if (lowercaseMessage.includes("bye") || lowercaseMessage.includes("goodbye")) {
      response = "Thank you for chatting with us! Feel free to return if you have more questions.";
    }
    else {
      response = "Thank you for your message. For more detailed information, consider creating an account to access our full customer support.";
    }
    
    return {
      success: true,
      message: response
    };
  };
  
  // End the chat session
  const endChatSession = async () => {
    try {
      if (!sessionId) return;
      
      // Only use the API for authenticated users
      if (token && !sessionId.startsWith('guest-')) {
        await axios.post(
          `${backendUrl}/api/chatbot/end`, 
          { sessionId }, 
          { headers: { token } }
        );
      }
      
      // No need to do anything special for guest sessions
    } catch (error) {
      console.error("Error ending chat session:", error);
    }
  };
  
  // Handle ending chat (close button)
  const handleEndChat = async () => {
    await endChatSession();
    onClose();
  };

  // Send a message
  const handleSendMessage = async () => {
    if (message.trim() === '') return;
    setLastActivity(Date.now());
    
    // Add user message to UI
    const userMessage = { type: 'user', text: message, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    
    // Save the message before clearing the input
    const messageToSend = message;
    setMessage('');
    
    // Show typing indicator
    setIsTyping(true);
    
    // Send message to backend
    const response = await sendMessageToBackend(messageToSend);
    
    // Hide typing indicator
    setIsTyping(false);
    
    if (response && response.success) {
      // Add bot response to messages
      const botMessage = { 
        type: 'bot', 
        text: typeof response.message === 'string' ? response.message : 'Sorry, I encountered an error.', 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, botMessage]);
    } else {
      // Add error message
      const errorMessage = { 
        type: 'bot', 
        text: 'Sorry, I encountered an error. Please try again.', 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMessage]);
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
      className="fixed bottom-8 right-8 w-80 md:w-96 h-[500px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden z-50"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-[#6a5acd] to-[#8470ff] px-4 py-3 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiMessageSquare className="w-5 h-5" />
          <h2 className="font-michroma text-sm">Netronix Support</h2>
        </div>
        <div className="flex items-center gap-2">
          <motion.button 
            onClick={handleEndChat}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <FiX className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
      
      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
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
                {msg.type === 'user' ? (
                  <p className="text-sm">{msg.text}</p>
                ) : (
                  <div 
                    className="text-sm"
                    dangerouslySetInnerHTML={{ 
                      __html: processAIResponse(msg.text, frontendUrl) 
                    }}
                  />
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
      
      {/* Quick Replies */}
      <div className="px-4 py-2 border-t border-gray-100 bg-white">
        <p className="text-xs font-michroma text-gray-500 mb-2">Suggested questions:</p>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {quickReplies.map((reply, index) => (
            <button
              key={`reply-${index}`}
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
      
      {/* Input Area */}
      <div className="p-3 border-t border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setLastActivity(Date.now());
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSendMessage();
              }
              setLastActivity(Date.now());
            }}
            placeholder="Type your message..."
            className="flex-1 border border-gray-200 rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] text-sm"
          />
          <motion.button
            onClick={handleSendMessage}
            className="w-10 h-10 rounded-full bg-[#6a5acd] text-white flex items-center justify-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={message.trim() === '' || isTyping}
          >
            <IoMdSend className="w-5 h-5" />
          </motion.button>
        </div>
        <div className="mt-2 text-center">
          <p className="text-[10px] text-gray-400">Powered by Netronix AI</p>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatInterface;
