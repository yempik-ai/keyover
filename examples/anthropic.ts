import Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC, createKeyPool, POOLED_API_KEY } from "../src/index.js"

const primary = process.env.ANTHROPIC_API_KEY_PRIMARY
const fallback = process.env.ANTHROPIC_API_KEY_FALLBACK
if (!primary || !fallback) {
  throw new Error("Set ANTHROPIC_API_KEY_PRIMARY and ANTHROPIC_API_KEY_FALLBACK")
}

const pool = createKeyPool({
  provider: ANTHROPIC,
  keys: [
    { id: "primary", apiKey: primary },
    { id: "fallback", apiKey: fallback },
  ],
  onEvent: (event) => console.info("key-pool", event),
})
const client = new Anthropic({ apiKey: POOLED_API_KEY, fetch: pool.fetch })
const response = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 128,
  messages: [{ role: "user", content: "Say hello in one sentence." }],
})
console.log(response.content)
