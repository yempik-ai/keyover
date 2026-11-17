import { describe, expect, it } from "vitest"
import { CONTRACTS, type Contract, type ProviderId } from "../spec/contracts.ts"
import {
  ANTHROPIC,
  CEREBRAS,
  createKeyPool,
  DEEPSEEK,
  FIREWORKS,
  GEMINI,
  GROQ,
  type KeyEvent,
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

const EVERY_REASON = ["credit", "spend_limit", "provider_limit", "auth"] as const

/**
 * What a pool does with the contract's answer: the reason it rejected the
 * first key for, or null when the answer went back to the caller untouched.
 * It goes through the pool, so the statuses a profile is never asked about are
 * tested for what they are: answers that pass.
 */
async function verdict(contract: Contract) {
  const sent: string[] = []
  const events: KeyEvent[] = []
  const pool = createKeyPool({
    provider: PROFILES[contract.provider],
    keys: { first: "k-first", second: "k-second" },
    failoverOn: EVERY_REASON,
    onEvent: (event) => events.push(event),
    fetch: async (input, init) => {
      const headers = new Request(input, init).headers
      const key = headers.get("authorization") ?? headers.get("x-api-key") ?? headers.get("x-goog-api-key")
      sent.push(key!.replace("Bearer ", ""))
      return sent.length === 1
        ? Response.json(contract.body, { status: contract.status, headers: { ...contract.headers } })
        : Response.json({ ok: true })
    },
  })
  const response = await pool.fetch("https://provider.test/v1/x", { method: "POST", body: "{}" })
  const rejected = events.find((event) => event.type === "key_rejected")
  return { status: response.status, sent, reason: rejected?.type === "key_rejected" ? rejected.reason : null }
}

describe("the evidence ledger", () => {
  it.each(CONTRACTS.map((contract) => [contract.provider, contract.status, contract.title, contract] as const))(
    "%s %i %s",
    async (_provider, _status, _title, contract) => {
      const { status, sent, reason } = await verdict(contract)

      expect(reason).toBe(contract.expect)
      if (contract.expect === null) {
        // Untouched, and the second key never saw the request.
        expect([status, sent]).toEqual([contract.status, ["k-first"]])
      } else {
        expect([status, sent]).toEqual([200, ["k-first", "k-second"]])
      }
    },
  )

  it("holds, for every profile, a rejection it moves for and an answer it leaves alone", () => {
    for (const provider of Object.keys(PROFILES) as ProviderId[]) {
      const mine = CONTRACTS.filter((contract) => contract.provider === provider)
      expect(mine.some((contract) => contract.expect !== null), `${provider} moves`).toBe(true)
      expect(mine.some((contract) => contract.expect === null), `${provider} passes`).toBe(true)
    }
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
