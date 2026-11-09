import { describe, expect, it } from "vitest"
import {
  ANTHROPIC,
  createKeyPool,
  type KeyEvent,
  OPENAI,
  POOLED_API_KEY,
  type ProviderProfile,
} from "./index.js"

const URL_ = "https://api.example.test/v1/responses"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const OUT_OF_CREDIT = () =>
  json(429, {
    error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "no credit" },
  })

interface Sent {
  readonly key: string | null
  readonly body: string
}

/** A provider stand-in: each key answers from its own script; the last entry repeats. */
function provider(script: Record<string, (() => Response)[]>) {
  const sent: Sent[] = []
  const fetch = async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init)
    const key =
      request.headers.get("authorization")?.replace("Bearer ", "") ??
      request.headers.get("x-api-key")
    sent.push({ key, body: await request.text() })
    const answers = script[key ?? ""] ?? [() => json(401, { error: { message: "unknown key" } })]
    const next = answers.length > 1 ? answers.shift() : answers[0]
    return next!()
  }
  return { fetch: fetch as typeof globalThis.fetch, sent }
}

function pool(script: Record<string, (() => Response)[]>, profile: ProviderProfile = OPENAI) {
  const upstream = provider(script)
  const events: KeyEvent[] = []
  let clock = 1_000
  const keys = createKeyPool({
    provider: profile,
    keys: [
      { id: "primary", apiKey: "k-primary" },
      { id: "fallback", apiKey: "k-fallback" },
    ],
    fetch: upstream.fetch,
    now: () => clock,
    cooldownMs: { initial: 1_000, max: 4_000 },
    onEvent: (event) => events.push(event),
  })
  const call = (body: unknown = { input: "hi" }) =>
    keys.fetch(URL_, {
      method: "POST",
      headers: { authorization: `Bearer ${POOLED_API_KEY}`, "openai-organization": "org-a" },
      body: JSON.stringify(body),
    })
  return { keys, call, sent: upstream.sent, events, advance: (ms: number) => (clock += ms) }
}

describe("createKeyPool", () => {
  it("resends a billing rejection on the next key and keeps serving there while the first cools", async () => {
    const p = pool({ "k-primary": [OUT_OF_CREDIT], "k-fallback": [() => json(200, { ok: 1 })] })

    const first = await p.call()
    expect(first.status).toBe(200)
    expect(p.sent.map((s) => s.key)).toEqual(["k-primary", "k-fallback"])
    // The same request body reached both keys.
    expect(new Set(p.sent.map((s) => s.body)).size).toBe(1)

    await p.call()
    expect(p.sent.map((s) => s.key)).toEqual(["k-primary", "k-fallback", "k-fallback"])
    expect(p.events.map((e) => e.type)).toEqual(["key_rejected", "failover"])
    expect(p.keys.status()[0]).toMatchObject({
      id: "primary",
      state: "cooling",
      lastReason: "billing",
    })
  })

  it("probes the first key after its cooldown and gives it its priority back once it serves", async () => {
    const p = pool({
      "k-primary": [OUT_OF_CREDIT, () => json(200, { topped: "up" })],
      "k-fallback": [() => json(200, { ok: 1 })],
    })
    await p.call()
    p.advance(1_000)

    const probed = await p.call()
    expect(await probed.json()).toEqual({ topped: "up" })
    expect(p.events.at(-1)).toEqual({ type: "key_restored", key: "primary" })
    expect(p.keys.status().every((s) => s.state === "serving")).toBe(true)
  })

  it("doubles the cooldown of a key that keeps rejecting, up to the cap", async () => {
    const p = pool({ "k-primary": [OUT_OF_CREDIT], "k-fallback": [() => json(200, {})] })
    for (let i = 0; i < 4; i++) {
      await p.call()
      p.advance(4_000)
    }
    const cooldowns = p.events.flatMap((e) => (e.type === "key_rejected" ? [e.cooldownMs] : []))
    expect(cooldowns).toEqual([1_000, 2_000, 4_000, 4_000])
  })

  it("lets a single request probe a recovering key while concurrent ones stay on the serving key", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const upstream = provider({ "k-fallback": [() => json(200, {})] })
    const sent: string[] = []
    let primaryCalls = 0
    const keys = createKeyPool({
      provider: OPENAI,
      keys: [
        { id: "primary", apiKey: "k-primary" },
        { id: "fallback", apiKey: "k-fallback" },
      ],
      cooldownMs: { initial: 0, max: 0 },
      fetch: async (input, init) => {
        const key = new Headers(init?.headers).get("authorization")!.replace("Bearer ", "")
        sent.push(key)
        if (key !== "k-primary") return upstream.fetch(input, init)
        primaryCalls += 1
        if (primaryCalls === 1) return OUT_OF_CREDIT()
        await gate
        return json(200, {})
      },
    })
    const call = () => keys.fetch(URL_, { method: "POST", body: "{}" })
    await call() // primary rejects once and cools for 0 ms

    // Started together: the first takes the probe, the other two go to the serving key.
    const probe = call()
    await Promise.all([call(), call()])
    release()
    await probe
    expect(primaryCalls).toBe(2)
    expect(sent.slice(2)).toEqual(["k-primary", "k-fallback", "k-fallback"])
  })

  it("tries every key once when all reject, and answers with the last rejection marked final", async () => {
    const p = pool({ "k-primary": [OUT_OF_CREDIT], "k-fallback": [OUT_OF_CREDIT] })

    const response = await p.call()
    expect(response.status).toBe(429)
    expect(response.headers.get("x-should-retry")).toBe("false")
    expect(await response.json()).toMatchObject({ error: { code: "credit_balance_exhausted" } })
    expect(p.events.at(-1)).toEqual({
      type: "all_keys_rejected",
      keys: ["primary", "fallback"],
      reason: "billing",
    })

    // Both cooling: still tried, soonest retry first — the provider decides, never the pool.
    await p.call()
    expect(p.sent.map((s) => s.key)).toEqual(["k-primary", "k-fallback", "k-primary", "k-fallback"])
  })

  it.each([
    [
      "a rate limit",
      () => json(429, { error: { type: "rate_limit_error", code: "rate_limit_exceeded" } }),
    ],
    ["the ramp limit", () => json(429, { error: { type: "rate_limit_error", code: "slow_down" } })],
    ["a server error", () => json(500, { error: { type: "server_error" } })],
    [
      "a bad request",
      () => json(400, { error: { type: "invalid_request_error", code: "invalid_value" } }),
    ],
  ])("returns %s untouched, on the key that answered it", async (_name, answer) => {
    const p = pool({ "k-primary": [answer], "k-fallback": [() => json(200, {})] })
    const response = await p.call()
    expect(response.status).toBe(answer().status)
    expect(response.headers.get("x-should-retry")).toBeNull()
    expect(p.sent.map((s) => s.key)).toEqual(["k-primary"])
    expect(p.events).toEqual([])
  })

  it("sends the pooled key in place of the placeholder and drops another organization's headers", async () => {
    const seen: Headers[] = []
    const keys = createKeyPool({
      provider: OPENAI,
      keys: [{ id: "only", apiKey: "k-only", headers: { "openai-project": "proj-own" } }],
      fetch: async (_input, init) => {
        seen.push(new Headers(init?.headers))
        return json(200, {})
      },
    })
    await keys.fetch(URL_, {
      headers: { authorization: `Bearer ${POOLED_API_KEY}`, "openai-organization": "org-a" },
    })
    expect(seen[0]!.get("authorization")).toBe("Bearer k-only")
    expect(seen[0]!.get("openai-organization")).toBeNull()
    expect(seen[0]!.get("openai-project")).toBe("proj-own")
  })

  it("resends a one-shot stream body and form data intact on the next key", async () => {
    const bodies: string[] = []
    const keys = createKeyPool({
      provider: OPENAI,
      cooldownMs: { initial: 0, max: 0 },
      keys: [
        { id: "a", apiKey: "ka" },
        { id: "b", apiKey: "kb" },
      ],
      fetch: async (input, init) => {
        const request = new Request(input, init)
        bodies.push(await request.text())
        return request.headers.get("authorization") === "Bearer ka"
          ? OUT_OF_CREDIT()
          : json(200, {})
      },
    })
    const stream = new Blob(["streamed-bytes"]).stream()
    await keys.fetch(URL_, { method: "POST", body: stream, duplex: "half" } as RequestInit)
    expect(bodies).toEqual(["streamed-bytes", "streamed-bytes"])

    bodies.length = 0
    const form = new FormData()
    form.append("file", new Blob(["audio"]), "a.webm")
    await keys.fetch(URL_, { method: "POST", body: form })
    expect(bodies[0]).toContain("audio")
    expect(bodies[1]).toContain("audio")
  })

  it("keeps a probe leased until its rejection is recorded, however slowly its error body arrives", async () => {
    let releaseBody!: () => void
    const bodyGate = new Promise<void>((resolve) => (releaseBody = resolve))
    let primaryCalls = 0
    const keys = createKeyPool({
      provider: ANTHROPIC,
      keys: [
        { id: "primary", apiKey: "k-primary" },
        { id: "fallback", apiKey: "k-fallback" },
      ],
      cooldownMs: { initial: 0, max: 0 },
      fetch: async (_input, init) => {
        if (new Headers(init?.headers).get("x-api-key") !== "k-primary") return json(200, {})
        primaryCalls += 1
        if (primaryCalls === 1) return json(402, { error: { type: "billing_error" } })
        // The probe's headers arrive at once; its error body only when released.
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            await bodyGate
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify({ error: { type: "billing_error" } })),
            )
            controller.close()
          },
        })
        return new Response(body, { status: 402 })
      },
    })
    const call = () =>
      keys.fetch(URL_, { method: "POST", headers: { "x-api-key": POOLED_API_KEY }, body: "{}" })
    await call()

    const probe = call()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await Promise.all([call(), call()])
    releaseBody()
    await probe
    expect(primaryCalls).toBe(2)
  })

  it("stops buffering a stream body the moment the caller aborts", async () => {
    const controller = new AbortController()
    let sent = 0
    const keys = createKeyPool({
      provider: OPENAI,
      keys: [{ id: "a", apiKey: "ka" }],
      fetch: async () => {
        sent += 1
        return json(200, {})
      },
    })
    const endless = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) })
    const pending = keys.fetch(URL_, {
      method: "POST",
      body: endless,
      signal: controller.signal,
      duplex: "half",
    } as RequestInit)
    controller.abort(new Error("caller gave up"))
    await expect(pending).rejects.toThrow("caller gave up")
    expect(sent).toBe(0)
  })

  it("passes non-HTTP fetches through without a key or a health change", async () => {
    const p = pool({})
    await p.keys.fetch("data:,")
    expect(p.sent).toEqual([{ key: null, body: "" }])
    expect(p.events).toEqual([])
  })

  it("stops before the next key once the caller aborts", async () => {
    const controller = new AbortController()
    const keys = createKeyPool({
      provider: OPENAI,
      keys: [
        { id: "a", apiKey: "ka" },
        { id: "b", apiKey: "kb" },
      ],
      fetch: async () => {
        controller.abort(new Error("caller gave up"))
        return OUT_OF_CREDIT()
      },
    })
    await expect(keys.fetch(URL_, { signal: controller.signal })).rejects.toThrow("caller gave up")
  })
})

describe("OPENAI", () => {
  it.each([
    [429, { error: { type: "insufficient_quota", code: "insufficient_quota" } }, "billing"],
    [
      429,
      { error: { type: "insufficient_quota", code: "project_spend_limit_exceeded" } },
      "billing",
    ],
    [
      429,
      { error: { type: "insufficient_quota", code: "organization_spend_limit_exceeded" } },
      "billing",
    ],
    [429, { error: { type: "rate_limit_error", code: "rate_limit_exceeded" } }, null],
    [401, { error: { code: "invalid_api_key" } }, "auth"],
    [403, { error: { code: "unsupported_country_region_territory" } }, null],
    [404, { error: { code: "model_not_found" } }, null],
  ] as const)("classifies %i %j as %s", (status, body, reason) => {
    expect(OPENAI.classify(status, body)).toBe(reason)
  })

  it("resends without the reasoning another organization cannot decrypt, on the same key", async () => {
    const bodies: unknown[] = []
    const keys = createKeyPool({
      provider: OPENAI,
      keys: [{ id: "b", apiKey: "kb" }],
      fetch: async (input, init) => {
        const body = JSON.parse(await new Request(input, init).text()) as {
          input: { type?: string }[]
        }
        bodies.push(body)
        return body.input.some((item) => item.type === "reasoning")
          ? json(400, {
              error: {
                type: "invalid_request_error",
                code: "invalid_encrypted_content",
                param: null,
              },
            })
          : json(200, {})
      },
    })
    const input = [
      { role: "user", content: "hi" },
      { type: "reasoning", id: "rs_1", encrypted_content: "gAAA" },
      { type: "function_call", call_id: "c1", name: "t", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "{}" },
    ]
    const response = await keys.fetch(URL_, {
      method: "POST",
      body: JSON.stringify({ model: "m", input }),
    })
    expect(response.status).toBe(200)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual({ model: "m", input: [input[0], input[2], input[3]] })
  })
})

describe("OPENAI portability, from a Request and through a measured body", () => {
  it("drops the reasoning from a Request input and lets the transport measure the shorter body", async () => {
    const seen: { length: string | null; body: string }[] = []
    const keys = createKeyPool({
      provider: OPENAI,
      keys: [{ id: "b", apiKey: "kb" }],
      fetch: async (input, init) => {
        const body = await new Request(input, init).text()
        seen.push({ length: new Headers(init?.headers).get("content-length"), body })
        return body.includes('"reasoning"')
          ? json(400, {
              error: { type: "invalid_request_error", code: "invalid_encrypted_content" },
            })
          : json(200, {})
      },
    })
    const payload = JSON.stringify({
      input: [
        { type: "reasoning", encrypted_content: "gAAA" },
        { role: "user", content: "hi" },
      ],
    })
    const request = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(payload.length) },
      body: payload,
    })
    const response = await keys.fetch(request)
    expect(response.status).toBe(200)
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual({
      length: null,
      body: JSON.stringify({ input: [{ role: "user", content: "hi" }] }),
    })
  })
})

describe("ANTHROPIC", () => {
  it.each([
    [402, { type: "error", error: { type: "billing_error", message: "payment" } }, "billing"],
    [
      400,
      {
        error: {
          type: "invalid_request_error",
          message: "Your credit balance is too low to access the Anthropic API.",
        },
      },
      "billing",
    ],
    [
      400,
      {
        error: {
          type: "invalid_request_error",
          message: "You have reached your specified workspace API usage limits.",
        },
      },
      "billing",
    ],
    [
      429,
      {
        error: {
          type: "rate_limit_error",
          details: { error_code: "enforced_spend_limit_reached" },
        },
      },
      "billing",
    ],
    [
      429,
      { error: { type: "rate_limit_error", details: { error_code: "ramp_limit_exceeded" } } },
      null,
    ],
    [
      400,
      { error: { type: "invalid_request_error", details: { error_code: "organization_on_hold" } } },
      null,
    ],
    [401, { error: { type: "authentication_error" } }, "auth"],
    [529, { error: { type: "overloaded_error" } }, null],
  ] as const)("classifies %i %j as %s", (status, body, reason) => {
    expect(ANTHROPIC.classify(status, body)).toBe(reason)
  })

  it("keeps the header scheme the SDK chose", () => {
    const bearer = new Headers({ authorization: `Bearer ${POOLED_API_KEY}` })
    ANTHROPIC.authorize(bearer, "sk-ant")
    expect([bearer.get("authorization"), bearer.get("x-api-key")]).toEqual(["Bearer sk-ant", null])

    const apiKey = new Headers({ "x-api-key": POOLED_API_KEY })
    ANTHROPIC.authorize(apiKey, "sk-ant")
    expect([apiKey.get("authorization"), apiKey.get("x-api-key")]).toEqual([null, "sk-ant"])
  })
})
