import OpenAI from "openai"
import { createKeyPool, OPENAI } from "../src/index.ts"

const pool = createKeyPool({
  provider: OPENAI,
  keys: {
    primary: process.env.OPENAI_API_KEY,
    spare: process.env.OPENAI_API_KEY_SPARE,
  },
})

const openai = new OpenAI(pool.clientOptions)

const response = await openai.responses.create({ model: "gpt-6-luna", input: "Say hello." })
console.log(response.output_text)
