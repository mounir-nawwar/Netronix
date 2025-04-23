import dotenv from 'dotenv'
dotenv.config();
import express from 'express'
import cors from 'cors'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js';
import orderRouter from './routes/orderRoute.js';
import chatbotRouter from './routes/chatbotRoute.js'

// Log environment setup status
console.log('\n=== Netronix Server Starting ===');
 
// Check for OpenAI API key
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('\n⚠️ WARNING: OpenAI API key not found!');
  console.error('The chatbot will not function without a valid API key.');
  console.error('Please run: npm run setup\n');
} else {
  const maskedKey = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
  console.log(`✅ OpenAI API key loaded (${maskedKey})`);
  
  // Verify it's a project key
  if (apiKey.startsWith('sk-proj')) {
    console.log('✅ Using project-based API key format');
  } else {
    console.warn('⚠️ API key doesn\'t use project-based format (sk-proj-...)');
  }
}

// App Confing
const app = express()
const port = process.env.PORT || 4000
connectDB()
connectCloudinary()

// Middlewares
app.use(express.json())
app.use(cors({
  origin: ['https://netronixstore.vercel.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'token']
}))

// api endpoints
app.use('/api/user', userRouter)
app.use('/api/product', productRouter)
app.use('/api/cart', cartRouter)
app.use('/api/order', orderRouter)
app.use('/api/chatbot', chatbotRouter)

app.get('/', (req,res)=>{
    res.send('API Working')
})

app.listen(port, ()=> console.log('Server started on Port: '+ port));
