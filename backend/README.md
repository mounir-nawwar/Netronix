# Netronix Chatbot Setup

This document provides instructions for setting up the Netronix AI Chatbot service.

## Prerequisites

- Node.js 18+ installed
- MongoDB database
- OpenAI API key (starting with `sk-proj-`)

## Setup Instructions

1. **Install Dependencies**

```bash
npm install
```

2. **Configure Environment Variables**

Run the setup script to configure your environment variables:

```bash
npm run setup
```

This script will prompt you for your OpenAI API key and create a `.env` file.

Alternatively, you can manually create a `.env` file with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
PORT=4000
JWT_SECRET=your_jwt_secret
```

3. **Start the Server**

```bash
npm start
```

## Using the Chatbot API

The chatbot API has three main endpoints:

- `POST /api/chatbot/init` - Initialize a new chat session
- `POST /api/chatbot/message` - Send a message to the chatbot
- `POST /api/chatbot/end` - End a chat session

All endpoints require authentication with a JWT token.

### Example Usage

```javascript
// Initialize chat
const initResponse = await axios.post(
  'http://localhost:4000/api/chatbot/init',
  {},
  { headers: { token: userToken } }
);

const { sessionId } = initResponse.data;

// Send message
const messageResponse = await axios.post(
  'http://localhost:4000/api/chatbot/message',
  { 
    sessionId, 
    message: 'What laptops do you recommend?' 
  },
  { headers: { token: userToken } }
);

// End session
await axios.post(
  'http://localhost:4000/api/chatbot/end',
  { sessionId },
  { headers: { token: userToken } }
);
```

## Troubleshooting

- **API Key Issues**: Make sure your OpenAI API key is valid and starts with `sk-proj-`.
- **Session Timeout**: Chat sessions automatically close after 5 minutes of inactivity.
- **Database Connection**: Ensure your MongoDB connection is properly configured.

For additional help, please contact the development team. 