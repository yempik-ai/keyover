import OpenAI from "openai"
import { createKeyPool, OPENAI, POOLED_API_KEY } from "../src/index.js"

const primary = process.env.OPENAI_API_KEY_PRIMARY
const fallback = process.env.OPENAI_API_KEY_FALLBACK
if (!primary || !fallback) {
  throw new Error("Set OPENAI_API_KEY_PRIMARY and OPENAI_API_KEY_FALLBACK")
}

const pool = createKeyPool({
  provider: OPENAI,
  keys: [
    { id: "primary", apiKey: primary },
    { id: "fallback", apiKey: fallback },
  ],
  onEvent: (event) => console.info("key-pool", event),
})
const client = new OpenAI({
  apiKey: POOLED_API_KEY,
  organization: null,
  project: null,
  fetch: pool.fetch,
})
const response = await client.responses.create({
  model: "gpt-6-luna",
  input: "Say hello in one sentence.",
  store: false,
})
console.log(response.output_text)
