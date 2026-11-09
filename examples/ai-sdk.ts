import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { ANTHROPIC, createKeyPool, OPENAI, POOLED_API_KEY } from "../src/index.js"

const openaiPrimary = process.env.OPENAI_API_KEY_PRIMARY
const openaiFallback = process.env.OPENAI_API_KEY_FALLBACK
const anthropicPrimary = process.env.ANTHROPIC_API_KEY_PRIMARY
const anthropicFallback = process.env.ANTHROPIC_API_KEY_FALLBACK
if (!openaiPrimary || !openaiFallback || !anthropicPrimary || !anthropicFallback) {
  throw new Error("Set OPENAI_API_KEY_PRIMARY/FALLBACK and ANTHROPIC_API_KEY_PRIMARY/FALLBACK")
}

const openaiPool = createKeyPool({
  provider: OPENAI,
  keys: [
    { id: "openai-primary", apiKey: openaiPrimary },
    { id: "openai-fallback", apiKey: openaiFallback },
  ],
  onEvent: (event) => console.info("key-pool", event),
})
const anthropicPool = createKeyPool({
  provider: ANTHROPIC,
  keys: [
    { id: "anthropic-primary", apiKey: anthropicPrimary },
    { id: "anthropic-fallback", apiKey: anthropicFallback },
  ],
  onEvent: (event) => console.info("key-pool", event),
})
const openai = createOpenAI({ apiKey: POOLED_API_KEY, fetch: openaiPool.fetch })
const anthropic = createAnthropic({ apiKey: POOLED_API_KEY, fetch: anthropicPool.fetch })

const prompt = "Say hello in one sentence."
console.log((await generateText({
  model: openai.responses("gpt-6-luna"),
  prompt,
  providerOptions: { openai: { store: false } },
})).text)
console.log((await generateText({ model: anthropic("claude-haiku-5-5"), prompt })).text)
