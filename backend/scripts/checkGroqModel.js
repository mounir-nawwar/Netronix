// A five-second answer to "why did the chatbot go offline again?"
//
// `services/AIclient.js`'s first Groq model, `llama-3.3-70b-versatile`, was
// retired within a day of being set — `GET /models` against a real key
// returned 404 `model_not_found`, not a deprecation notice, and the failure
// the customer sees is indistinguishable from "no key configured at all": the
// same honest, generic "assistant is offline" state. There is no dashboard
// that tells you *why* it is offline. This script is that dashboard, run by
// hand.
//
// It calls `processChatMessage` — the real function every chat turn goes
// through, with the real catalog and the real `SYSTEM_PROMPT` — rather than
// re-implementing a second, parallel call to Groq that could drift from what
// the application actually does. The only thing it adds is printing what the
// application deliberately does not: `services/AIclient.js` logs only
// `error?.name` on a failure (SEC-016 — no secret, no request detail, ever
// reaches a log line), which is right for production and useless for
// debugging by hand. This script is the tool for the second case.
//
// Usage:
//   npm run check-groq                    # test the configured/default model
//   npm run check-groq -- --list          # list every model this key can reach
//   npm run check-groq -- --model=<id>    # test a specific model without editing .env
//
// Read-only. `processChatMessage` only ever reads the catalog; nothing here
// writes to the database.

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import OpenAI from 'openai'
import { processChatMessage } from '../services/AIclient.js'

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=')
        return [key, value ?? true]
    }),
)

function fail(message) {
    console.error(`✗ ${message}`)
    process.exit(1)
}

if (!process.env.GROQ_API_KEY) {
    fail('GROQ_API_KEY is not set. Add it to backend/.env — get a free one at console.groq.com/keys.')
}

if (args.model) process.env.GROQ_MODEL = args.model

if (args.list) {
    const client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
    const { data } = await client.models.list()
    console.log(`${data.length} models reachable with this key:\n`)
    for (const model of data.sort((a, b) => a.id.localeCompare(b.id))) {
        console.log(`  ${model.id}${model.active ? '' : '  (inactive)'}`)
    }
    console.log(
        '\nNot every model listed here is a fit. `groq/compound` and `groq/compound-mini` are Groq\'s\n' +
        'own agents with server-side tool use and live web search — a different security posture\n' +
        'than "pure text completion, no tool access", which is what the chatbot\'s threat model\n' +
        'assumes. Reasoning models (anything that separates a `reasoning` field from `content`,\n' +
        'e.g. the `openai/gpt-oss-*` family at time of writing) can burn the whole token budget on\n' +
        'hidden reasoning and return empty `content` — this script\'s default check below is what\n' +
        'catches that before a customer does.',
    )
    process.exit(0)
}

console.log(`Testing model: ${process.env.GROQ_MODEL || '(DEFAULT_MODEL in services/AIclient.js)'}\n`)

// A DB connection only because `processChatMessage` reads the real catalog —
// the same one a real chat turn would. `MONGODB_URI` must already point
// somewhere by the time this runs; this script does not choose a target the
// way `scripts/seed.js` does, because it never writes anything.
if (!process.env.MONGODB_URI) fail('MONGODB_URI is not set.')
await mongoose.connect(process.env.MONGODB_URI)

const questions = [
    'What laptops do you have in stock?',
    'Do you offer a warranty?',
]

for (const question of questions) {
    const reply = await processChatMessage(question, { history: [] })
    console.log(`Q: ${question}`)
    if (reply.success === false) {
        console.log(`✗ FAILED: ${reply.message}`)
    } else if (!reply.text?.trim()) {
        console.log('✗ EMPTY reply with success:true — likely a reasoning model that spent its')
        console.log('  token budget on hidden reasoning before writing any customer-facing text.')
    } else {
        console.log(`✓ ${reply.text}`)
        if (reply.links.length > 0) console.log(`  links: ${reply.links.map((l) => l.productId).join(', ')}`)
    }
    console.log()
}

await mongoose.disconnect()
