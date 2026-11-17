import Anthropic from "@anthropic-ai/sdk"
import { createAnthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import OpenAI from "openai"
import { describe, expect, it } from "vitest"
import { ANTHROPIC, createKeyPool, type KeyEvent, OPENAI, POOLED_API_KEY } from "./index.ts"
import { fakeProvider } from "./testing.ts"

const orgs = {
  primary: { apiKey: "sk-fake-primary", credit: 2 },
  spare: { apiKey: "sk-fake-spare" },
} as const

const keys = { primary: orgs.primary.apiKey, spare: orgs.spare.apiKey } as const

function openai() {
  const provider = fakeProvider({ flavor: "openai", orgs })
  const events: KeyEvent[] = []
  const pool = createKeyPool({
    provider: OPENAI,
    keys,
    fetch: provider.fetch,
    onEvent: (event) => events.push(event),
  })
  const client = new OpenAI({ apiKey: POOLED_API_KEY, fetch: pool.fetch, maxRetries: 0 })
  const ask = async () =>
    (await client.responses.create({ model: "m", input: "hi", store: false })).output_text
  return { provider, pool, events, client, ask }
}

describe("fakeProvider, through the real SDKs", () => {
  it("charges the first organization until its credit ends, then the pool moves to the spare", async () => {
    const { provider, ask, events } = openai()

    expect([await ask(), await ask(), await ask()]).toEqual([
      "Served by primary.",
      "Served by primary.",
      "Served by spare.",
    ])
    expect(provider.calls.map((call) => call.outcome)).toEqual([
      "served",
      "served",
      "out_of_credit",
      "served",
    ])
    expect(provider.state("primary")).toMatchObject({ credit: 0, served: 2 })
    expect(events.map((event) => event.type)).toEqual(["key_rejected", "failover"])
  })

  it("answers a revoked key as the provider does, and the pool treats it as an auth rejection", async () => {
    const { provider, ask, events } = openai()
    provider.revoke("primary")

    expect(await ask()).toBe("Served by spare.")
    expect(events[0]).toMatchObject({ type: "key_rejected", reason: "auth", status: 401 })
  })

  it("returns a rate limit to the SDK untouched: the pool does not move the request", async () => {
    const { provider, client, events } = openai()
    provider.rateLimit("primary")

    await expect(
      client.responses.create({ model: "m", input: "hi", store: false }),
    ).rejects.toBeInstanceOf(OpenAI.RateLimitError)
    expect(provider.calls.map((call) => call.org)).toEqual(["primary"])
    expect(events).toEqual([])
  })

  it("serves chat completions in their own shape", async () => {
    const { client } = openai()
    const completion = await client.chat.completions.create({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    })
    expect(completion.choices[0]?.message.content).toBe("Served by primary.")
  })

  it("serves again from the first organization after a top-up", async () => {
    const provider = fakeProvider({ flavor: "openai", orgs })
    let clock = 0
    const pool = createKeyPool({
      provider: OPENAI,
      keys,
      fetch: provider.fetch,
      now: () => clock,
      cooldownMs: { initial: 1_000, max: 1_000 },
    })
    const client = new OpenAI({ apiKey: POOLED_API_KEY, fetch: pool.fetch, maxRetries: 0 })
    const ask = async () =>
      (await client.responses.create({ model: "m", input: "hi", store: false })).output_text
    provider.drain("primary")

    expect(await ask()).toBe("Served by spare.")
    provider.topUp("primary", 5)
    clock += 1_000
    expect(await ask()).toBe("Served by primary.")
  })

  it("speaks Anthropic: the SDK and the AI SDK both fail over on a low credit balance", async () => {
    const provider = fakeProvider({ flavor: "anthropic", orgs })
    const pool = createKeyPool({ provider: ANTHROPIC, keys, fetch: provider.fetch })
    provider.drain("primary")

    const client = new Anthropic({ apiKey: POOLED_API_KEY, fetch: pool.fetch, maxRetries: 0 })
    const message = await client.messages.create({
      model: "m",
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    })
    expect(message.content[0]).toMatchObject({ type: "text", text: "Served by spare." })

    const anthropic = createAnthropic({ apiKey: POOLED_API_KEY, fetch: pool.fetch })
    const { text } = await generateText({ model: anthropic("m"), prompt: "hi" })
    expect(text).toBe("Served by spare.")
  })

  it("answers an unknown key with the provider's authentication error", async () => {
    const provider = fakeProvider({ flavor: "anthropic", orgs })
    const client = new Anthropic({ apiKey: "not-a-key", fetch: provider.fetch, maxRetries: 0 })

    await expect(
      client.messages.create({ model: "m", max_tokens: 1, messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(Anthropic.AuthenticationError)
    expect(provider.calls[0]).toMatchObject({ org: null, outcome: "unknown_key", status: 401 })
  })
})
