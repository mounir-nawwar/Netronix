import express from 'express';
import { initializeChat, handleMessage, endChatSession } from '../controllers/chatbotController.js';

const chatbotRouter = express.Router();

// Public routes - no authentication required
chatbotRouter.post('/init', initializeChat);
chatbotRouter.post('/message', handleMessage);
chatbotRouter.post('/end', endChatSession);

export default chatbotRouter;

