import { createAnthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { ANTHROPIC, createKeyPool } from "../src/index.ts"

const pool = createKeyPool({
  provider: ANTHROPIC,
  keys: {
    primary: process.env.ANTHROPIC_API_KEY,
    spare: process.env.ANTHROPIC_API_KEY_SPARE,
  },
})

const anthropic = createAnthropic(pool.clientOptions)

const { text } = await generateText({ model: anthropic("claude-haiku-5-5"), prompt: "Say hello." })
console.log(text)
