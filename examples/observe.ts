import { createKeyPool, OPENAI } from "../src/index.ts"

const pool = createKeyPool({
  provider: OPENAI,
  keys: {
    primary: process.env.OPENAI_API_KEY,
    spare: process.env.OPENAI_API_KEY_SPARE,
  },
  onEvent(event) {
    // Page someone on the first rejection: that organization needs a top-up.
    if (event.type === "key_rejected" && event.consecutive === 1) console.error("ai key rejected", event)
    if (event.type === "all_keys_rejected") console.error("every ai key rejected", event)
  },
})

console.log(pool.status())
