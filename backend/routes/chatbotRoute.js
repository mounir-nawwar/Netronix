import express from 'express';
import { initializeChat, handleMessage, endChatSession } from '../controllers/chatbotController.js';
import { chatbotLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { initChatSchema, chatMessageSchema, endChatSchema } from '../validators/chatbot.js';

const chatbotRouter = express.Router();

// Public routes - no authentication required.
//
// Unauthenticated *and* billed per request: every turn ships the catalog to a
// paid model. The limiter (SEC-005) and the 1,000-character message cap
// (SEC-023) are what bound the cost of that.
chatbotRouter.use(chatbotLimiter);

chatbotRouter.post('/init', validate(initChatSchema), initializeChat);
chatbotRouter.post('/message', validate(chatMessageSchema), handleMessage);
chatbotRouter.post('/end', validate(endChatSchema), endChatSession);

export default chatbotRouter;
