import userModel from '../models/userModel.js';
import { v4 as uuidv4 } from 'uuid';
import { processChatMessage, closeSession } from '../services/AIclient.js';

// Store active chat sessions in memory
// In production, this should be moved to Redis or another persistence layer
const activeSessions = new Map();

// Initialize a new chat session
const initializeChat = async (req, res) => {
  try {
    // Check if user is authenticated (optional)
    const userId = req.body.userId || null;
    let user = null;
    
    if (userId) {
      user = await userModel.findById(userId);
    }
    
    // Generate a unique session ID
    const sessionId = uuidv4();
    
    // Create a new session with initial data
    const session = {
      id: sessionId,
      userId: userId,
      startTime: new Date(),
      lastActivity: new Date(),
      messages: [],
      isActive: true,
      isAuthenticated: !!user
    };
    
    // Store the session
    activeSessions.set(sessionId, session);
    
    // Get initial greeting using AI service
    const aiResponse = await processChatMessage(sessionId, "Hello");
    
    // Format the greeting
    const greeting = {
      id: uuidv4(),
      text: aiResponse.message || "Hello! Welcome to Netronix customer support. How can I help you today?",
      sender: "bot",
      timestamp: new Date()
    };
    
    session.messages.push(greeting);
    
    // Return session data to client
    return res.status(200).json({
      success: true,
      sessionId,
      greeting: {
        text: greeting.text,
        timestamp: greeting.timestamp
      }
    });
  } catch (error) {
    console.error('Error initializing chat:', error);
    return res.status(500).json({ success: false, message: 'Failed to initialize chat session' });
  }
};

// Handle incoming messages and generate responses
const handleMessage = async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    // Validate session
    if (!sessionId || !activeSessions.has(sessionId)) {
      return res.status(404).json({ success: false, message: 'Chat session not found or expired' });
    }
    
    // Get session
    const session = activeSessions.get(sessionId);
    
    // Update last activity time
    session.lastActivity = new Date();
    
    // Add user message to history
    const userMessage = {
      id: uuidv4(),
      text: message,
      sender: "user",
      timestamp: new Date()
    };
    
    session.messages.push(userMessage);
    
    // Process the message using the AI service
    const aiResponse = await processChatMessage(sessionId, message);
    
    // Add bot response to history
    const botMessage = {
      id: uuidv4(),
      text: aiResponse.message || "I'm sorry, I couldn't process your request at this time.",
      sender: "bot",
      timestamp: new Date(),
      quickReplies: [] // AI service doesn't provide quick replies currently
    };
    
    session.messages.push(botMessage);
    
    // Update session in storage
    activeSessions.set(sessionId, session);
    
    // Return response to client - send the text directly
    return res.status(200).json({
      success: true,
      message: botMessage.text
    });
  } catch (error) {
    console.error('Error handling message:', error);
    return res.status(500).json({ success: false, message: 'Failed to process message' });
  }
};

// End chat session
const endChatSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // Validate session
    if (!sessionId || !activeSessions.has(sessionId)) {
      return res.status(404).json({ success: false, message: 'Chat session not found or already ended' });
    }
    
    // Get session and mark as inactive
    const session = activeSessions.get(sessionId);
    session.isActive = false;
    session.endTime = new Date();
    
    // Remove session from active sessions
    activeSessions.delete(sessionId);
    
    // Close the session in AI service
    closeSession(sessionId);
    
    return res.status(200).json({
      success: true,
      message: 'Chat session ended successfully'
    });
  } catch (error) {
    console.error('Error ending chat session:', error);
    return res.status(500).json({ success: false, message: 'Failed to end chat session' });
  }
};

export { initializeChat, handleMessage, endChatSession };
