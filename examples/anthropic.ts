import Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC, createKeyPool } from "../src/index.ts"

const pool = createKeyPool({
  provider: ANTHROPIC,
  keys: {
    primary: process.env.ANTHROPIC_API_KEY,
    spare: process.env.ANTHROPIC_API_KEY_SPARE,
  },
})

const anthropic = new Anthropic(pool.clientOptions)

const message = await anthropic.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 128,
  messages: [{ role: "user", content: "Say hello." }],
})
console.log(message.content)
