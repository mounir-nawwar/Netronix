import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = path.join(__dirname, '.env');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n=== Netronix Chatbot Environment Setup ===\n');
console.log('This script will help you set up your environment variables for the Netronix chatbot.');
console.log('You will need your OpenAI API key (starting with sk-proj-...).\n');

// Check if .env file already exists
if (fs.existsSync(envFile)) {
  console.log('An .env file already exists. Do you want to overwrite it? (y/n)');
  rl.question('', (answer) => {
    if (answer.toLowerCase() === 'y') {
      getApiKey();
    } else {
      console.log('\nSetup cancelled. Your existing .env file was not modified.');
      rl.close();
    }
  });
} else {
  getApiKey();
}

function getApiKey() {
  rl.question('\nPlease enter your OpenAI API key (sk-proj-...): ', (apiKey) => {
    if (!apiKey.startsWith('sk-')) {
      console.log('\n⚠️ Warning: Your API key does not start with "sk-". Are you sure this is correct?');
      rl.question('Continue anyway? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y') {
          createEnvFile(apiKey);
        } else {
          getApiKey();
        }
      });
    } else {
      createEnvFile(apiKey);
    }
  });
}

function createEnvFile(apiKey) {
  const envContent = `# OpenAI API key
OPENAI_API_KEY=${apiKey}

# Port
PORT=4000

# JWT Secret (for authentication)
JWT_SECRET=netronix_secret_key_replace_in_production
`;

  fs.writeFileSync(envFile, envContent);
  console.log('\n✅ .env file created successfully!');
  console.log('The chatbot is now configured to use your OpenAI API key.');
  console.log('\n🚀 You can start the server with: npm start');
  rl.close();
} 