import { describe, expect, it } from "vitest"
import { CONTRACTS, type ProviderId } from "../spec/contracts.ts"
import {
  ANTHROPIC,
  CEREBRAS,
  createKeyPool,
  DEEPSEEK,
  FIREWORKS,
  GEMINI,
  GROQ,
  MISTRAL,
  OPENAI,
  OPENROUTER,
  type ProviderProfile,
  TOGETHER,
} from "./index.ts"

const PROFILES: Record<ProviderId, ProviderProfile> = {
  openai: OPENAI,
  anthropic: ANTHROPIC,
  gemini: GEMINI,
  openrouter: OPENROUTER,
  groq: GROQ,
  deepseek: DEEPSEEK,
  mistral: MISTRAL,
  together: TOGETHER,
  fireworks: FIREWORKS,
  cerebras: CEREBRAS,
}

/** The statuses the pool asks a profile about; any other response passes unread. */
const ASKED = new Set([400, 401, 402, 403, 429])

describe("the evidence ledger", () => {
  it.each(CONTRACTS.map((contract) => [contract.provider, contract.status, contract.title, contract] as const))(
    "%s %i %s",
    (_provider, _status, _title, contract) => {
      const profile = PROFILES[contract.provider]
      const reason = ASKED.has(contract.status)
        ? profile.classify(contract.status, contract.body, new Headers(contract.headers))
        : null
      expect(reason).toBe(contract.expect)
    },
  )

  it("covers every profile with a rejection it moves for and, where one is documented, an answer it leaves alone", () => {
    for (const provider of Object.keys(PROFILES) as ProviderId[]) {
      const mine = CONTRACTS.filter((contract) => contract.provider === provider)
      expect(mine.some((contract) => contract.expect !== null), provider).toBe(true)
    }
    // The ledger cannot pass by classifying nothing.
    expect(CONTRACTS.filter((contract) => contract.expect === null).length).toBeGreaterThan(10)
  })
})

describe("a limit the provider assigned", () => {
  const TIER_CAP = () =>
    Response.json(
      { error: { type: "insufficient_quota", code: "organization_usage_limit_exceeded" } },
      { status: 429 },
    )

  function pool(failoverOn?: Parameters<typeof createKeyPool>[0]["failoverOn"]) {
    const sent: string[] = []
    const keys = createKeyPool({
      provider: OPENAI,
      keys: { primary: "k-primary", spare: "k-spare" },
      ...(failoverOn ? { failoverOn } : {}),
      fetch: async (input, init) => {
        const key = new Request(input, init).headers.get("authorization")!
        sent.push(key)
        return key.endsWith("k-primary") ? TIER_CAP() : Response.json({ ok: 1 })
      },
    })
    return { keys, sent, call: () => keys.fetch("https://api.openai.com/v1/responses", { method: "POST", body: "{}" }) }
  }

  it("returns to the caller untouched by default: the pool does not route around the provider's cap", async () => {
    const p = pool()

    const response = await p.call()

    expect(response.status).toBe(429)
    expect(response.headers.get("x-should-retry")).toBeNull()
    expect(p.sent).toEqual(["Bearer k-primary"])
    expect(p.keys.status()[0]).toMatchObject({ state: "serving", consecutiveRejections: 0 })
  })

  it("moves the request when failoverOn includes provider_limit", async () => {
    const p = pool(["credit", "spend_limit", "auth", "provider_limit"])

    expect((await p.call()).status).toBe(200)
    expect(p.sent).toEqual(["Bearer k-primary", "Bearer k-spare"])
    expect(p.keys.status()[0]).toMatchObject({ state: "cooling", lastReason: "provider_limit" })
  })
})

describe("authorize", () => {
  it("puts the Gemini key in the header the request already uses", () => {
    const native = new Headers({ "x-goog-api-key": "placeholder" })
    GEMINI.authorize(native, "g-key")
    expect([native.get("x-goog-api-key"), native.get("authorization")]).toEqual(["g-key", null])

    const compatible = new Headers({ authorization: "Bearer placeholder" })
    GEMINI.authorize(compatible, "g-key")
    expect([compatible.get("authorization"), compatible.get("x-goog-api-key")]).toEqual(["Bearer g-key", null])
  })
})
