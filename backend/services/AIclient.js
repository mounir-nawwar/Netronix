import OpenAI from "openai";
import productModel from "../models/productModel.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend URL for product links
const FRONTEND_URL = process.env.FRONTEND_URL;

// Initialize OpenAI with API key
const initializeOpenAI = () => {
  // Try to read API key from .env file directly
  let apiKey = process.env.OPENAI_API_KEY;
  
  // If not in process.env, try to read from .env file
  if (!apiKey) {
    try {
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/OPENAI_API_KEY=(.+)/);
        if (match && match[1]) {
          apiKey = match[1].trim();
          // Set it in process.env for future use
          process.env.OPENAI_API_KEY = apiKey;
        }
      }
    } catch (error) {
      console.error("Error reading .env file:", error);
    }
  }
  
  // Check if API key is now available
  if (!apiKey) {
    console.error("⚠️ OpenAI API key not found! Please set OPENAI_API_KEY in your environment variables.");
    console.log("Using fallback responses since no API key is available");
    return null;
  }
  
  // Validate the API key format
  // Check for both standard format (sk-...) and project API keys (sk-proj-...)
  if (!apiKey.startsWith('sk-')) {
    console.error("⚠️ Invalid OpenAI API key format. Key should start with 'sk-'");
    return null;
  }
  
  // Create the OpenAI client with proper configuration
  try {
    const client = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: false, // Only used server-side
    });
    
    console.log(`✅ OpenAI client initialized with key starting with ${apiKey.substring(0, 7)}...`);
    return client;
  } catch (error) {
    console.error("⚠️ Failed to initialize OpenAI client:", error);
    return null;
  }
};

const openai = initializeOpenAI();

// Update to fetch products from the actual MongoDB database
async function fetchDBProducts() {
  try {
    const products = await productModel.find({});
    
    // Format products for the AI to understand
    return products.map(product => ({
      id: product._id.toString(),
      name: product.name,
      price: `$${product.price}`,
      description: product.description,
      brand: product.brand,
      tags: product.tags.join(', '),
      url: `/product/${product._id.toString()}`
    }));
  } catch (error) {
    console.error("Error fetching products for AI:", error);
    // Return empty array in case of error to prevent breaking the AI flow
    return [];
  }
}

// Map to store chat sessions with timestamps for auto-closing
const chatSessions = new Map();

// Function to create or retrieve a chat session
const getChatSession = (sessionId) => {
  if (!chatSessions.has(sessionId)) {
    chatSessions.set(sessionId, {
      messages: [],
      lastActivity: Date.now(),
      systemMessage: {
        role: "system", 
        content:
          "You are a professional customer service agent for Netronix, a premium tech and computer e-commerce store. " +
          "You are helpful, friendly and knowledgeable. Only recommend products from the provided list and never invent products. " +
          "When recommending a specific product, you MUST use this EXACT HTML FORMAT: \"You can find it <a href='/product/{productId}' target='_blank'>here</a>\" where productId is the exact id field from the product data. " +
          "IMPORTANT: Always include the HTML tag with 'href' attribute exactly as shown. DO NOT just say 'find it here' as plain text. " +
          "Always use this exact compact link format with the word 'here' as the clickable text. NEVER show the URL in your response. DO NOT use markdown format like [here](url). " +
          "The delivery all over lebanon which is the target market is 3$"
      }
    });
  }
  
  // Update the last activity timestamp
  const session = chatSessions.get(sessionId);
  session.lastActivity = Date.now();
  
  return session;
};

// Function to process chat messages
async function processChatMessage(sessionId, message) {
  try {
    // If OpenAI client is not initialized, return an error
    if (!openai) {
      return {
        success: false,
        message: "Our AI service is temporarily unavailable. Please try again later."
      };
    }
    
    // Get or create session
    const session = getChatSession(sessionId);
    
    // Fetch product data
    const availableProducts = await fetchDBProducts();
    const toolsMessage = {
      role: "system",
      content: `Available products information:\n${JSON.stringify(availableProducts, null, 2)}\n\nCRITICAL INSTRUCTION: When recommending products, you MUST use this EXACT HTML FORMAT: "You can find it <a href='/product/productId' target='_blank'>here</a>". Include the full HTML tag with href attribute. DO NOT use markdown format. DO NOT just say "find it here" as plain text.`
    };
    
    // Add user message to session history
    session.messages.push({ role: "user", content: message });
    
    // Prepare messages for OpenAI, including system message, tools and chat history
    const apiMessages = [
      session.systemMessage,
      toolsMessage,
      ...session.messages.slice(-10) // Keep the last 10 messages for context
    ];
    
    console.log("Sending request to OpenAI...");
    
    // Get response from OpenAI
    const completion = await openai.chat.completions.create({
      messages: apiMessages,
      model: "gpt-4o-mini",
      max_tokens: 200
    });
    
    console.log("Received response from OpenAI");
    
    // Extract the assistant's response
    const responseContent = completion.choices[0].message.content;
    
    // Process response to ensure product links are properly formatted
    const processedResponse = processResponseLinks(responseContent, availableProducts);
    
    // Add assistant response to session history
    session.messages.push({ role: "assistant", content: processedResponse });
    
    return {
      success: true,
      message: processedResponse
    };
  } catch (error) {
    console.error("Error processing chat message:", error);
    console.error(error.stack);
    
    // Handle specific OpenAI errors
    if (error.status === 401) {
      return {
        success: false,
        message: "Authentication error with our AI service. Please contact support."
      };
    } else if (error.status === 429) {
      return {
        success: false,
        message: "Our AI service is currently experiencing high demand. Please try again in a moment."
      };
    }
    
    // For any other error, also return error
    return {
      success: false,
      message: "Sorry, I encountered an error processing your request. Please try again later."
    };
  }
}

// Function to close inactive sessions
function cleanupInactiveSessions() {
  const now = Date.now();
  const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
  
  for (const [sessionId, session] of chatSessions.entries()) {
    if (now - session.lastActivity > INACTIVE_TIMEOUT) {
      chatSessions.delete(sessionId);
      console.log(`Closed inactive chat session: ${sessionId}`);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupInactiveSessions, 60 * 1000);

// Function to manually close a session
function closeSession(sessionId) {
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    return true;
  }
  return false;
}

// Helper function to ensure product links are properly formatted
function processResponseLinks(text, products) {
  // If the response already contains HTML links, return as is
  if (text.includes('<a href=')) {
    return text;
  }
  
  // Check if the response mentions products but doesn't have HTML links
  for (const product of products) {
    if (text.toLowerCase().includes(product.name.toLowerCase()) && 
        text.toLowerCase().includes('find it here')) {
      // Replace plain text "find it here" with HTML link
      return text.replace(
        /find it here/i,
        `find it <a href='/product/${product.id}' target='_blank'>here</a>`
      );
    }
  }
  
  return text;
}

export { processChatMessage, closeSession };