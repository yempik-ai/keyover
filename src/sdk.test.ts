import Anthropic from "@anthropic-ai/sdk"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { ANTHROPIC, createKeyPool, OPENAI, POOLED_API_KEY, type ProviderProfile } from "./index.js"

const keys = [
  { id: "a", apiKey: "sk-test-a" },
  { id: "b", apiKey: "sk-test-b" },
] as const

function rejection(provider: ProviderProfile): Response {
  return provider === OPENAI
    ? Response.json(
        { error: { type: "insufficient_quota", code: "credit_balance_exhausted" } },
        { status: 429 },
      )
    : Response.json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Your credit balance is too low to access the Anthropic API.",
          },
        },
        { status: 400 },
      )
}

/** All SDK traffic ends here; only the fallback key receives a successful response. */
function setup(provider: ProviderProfile, success: () => Response, allRejected = false) {
  const sent: Request[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    sent.push(request)
    const apiKey = request.headers.get("authorization")?.replace(/^Bearer /, "") ??
      request.headers.get("x-api-key")
    expect(["sk-test-a", "sk-test-b"]).toContain(apiKey)
    return allRejected || apiKey === "sk-test-a" ? rejection(provider) : success()
  })
  const pool = createKeyPool({ provider, keys, fetch })
  return { pool, fetch, sent }
}

function openaiResponse(): Response {
  return Response.json({
    id: "resp_test",
    object: "response",
    created_at: 1_700_000_000,
    status: "completed",
    model: "m",
    error: null,
    incomplete_details: null,
    output: [{
      type: "message",
      id: "msg_test",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "Hello", annotations: [] }],
    }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  })
}

function anthropicResponse(): Response {
  return Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "m",
    content: [{ type: "text", text: "Hello" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  })
}

describe("official OpenAI SDK", () => {
  it("returns only the successful response after a billing rejection", async () => {
    const { pool, fetch, sent } = setup(OPENAI, openaiResponse)
    const client = new OpenAI({
      apiKey: POOLED_API_KEY,
      organization: null,
      project: null,
      fetch: pool.fetch,
    })

    const response = await client.responses.create({ model: "m", input: "Hi", store: false })

    expect(response.output_text).toBe("Hello")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sent.map((request) => request.headers.get("authorization")))
      .toEqual(["Bearer sk-test-a", "Bearer sk-test-b"])
    expect(sent.every((request) => !request.headers.has("openai-organization") &&
      !request.headers.has("openai-project"))).toBe(true)
    expect(await Promise.all(sent.map((request) => request.text())))
      .toEqual([JSON.stringify({ model: "m", input: "Hi", store: false }),
        JSON.stringify({ model: "m", input: "Hi", store: false })])
  })

  it("throws the last 429 without SDK retries when every key rejects", async () => {
    const { pool, fetch, sent } = setup(OPENAI, openaiResponse, true)
    const client = new OpenAI({
      apiKey: POOLED_API_KEY,
      organization: null,
      project: null,
      fetch: pool.fetch,
    })

    const error = await client.responses.create({ model: "m", input: "Hi", store: false })
      .catch((error: unknown) => error)

    expect(error).toBeInstanceOf(OpenAI.RateLimitError)
    expect(error).toMatchObject({ status: 429, code: "credit_balance_exhausted" })
    if (!(error instanceof OpenAI.RateLimitError)) throw new Error("Expected a rate-limit error")
    expect(error.headers.get("x-should-retry")).toBe("false")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sent.map((request) => request.headers.get("authorization")))
      .toEqual(["Bearer sk-test-a", "Bearer sk-test-b"])
  })
})

describe("official Anthropic SDK", () => {
  it("replaces the SDK's auth header with key B after a credit rejection", async () => {
    const { pool, fetch, sent } = setup(ANTHROPIC, anthropicResponse)
    const client = new Anthropic({ apiKey: POOLED_API_KEY, fetch: pool.fetch })

    const response = await client.messages.create({
      model: "m",
      max_tokens: 16,
      messages: [{ role: "user", content: "Hi" }],
    })

    expect(response.content).toEqual([{ type: "text", text: "Hello" }])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sent.map((request) => request.headers.get("authorization") ??
      request.headers.get("x-api-key")))
      .toEqual(sent[0]?.headers.has("authorization")
        ? ["Bearer sk-test-a", "Bearer sk-test-b"]
        : ["sk-test-a", "sk-test-b"])
  })
})

describe("Vercel AI SDK", () => {
  it("generates text through the OpenAI Responses provider after failover", async () => {
    const { pool, fetch, sent } = setup(OPENAI, openaiResponse)
    const openai = createOpenAI({ apiKey: POOLED_API_KEY, fetch: pool.fetch })

    const response = await generateText({ model: openai.responses("m"), prompt: "Hi" })

    expect(response.text).toBe("Hello")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sent.map((request) => new URL(request.url).pathname))
      .toEqual(["/v1/responses", "/v1/responses"])
    expect(sent.map((request) => request.headers.get("authorization")))
      .toEqual(["Bearer sk-test-a", "Bearer sk-test-b"])
  })

  it("generates text through the Anthropic provider after failover", async () => {
    const { pool, fetch, sent } = setup(ANTHROPIC, anthropicResponse)
    const anthropic = createAnthropic({ apiKey: POOLED_API_KEY, fetch: pool.fetch })

    const response = await generateText({ model: anthropic("m"), prompt: "Hi", maxOutputTokens: 16 })

    expect(response.text).toBe("Hello")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sent.map((request) => new URL(request.url).pathname))
      .toEqual(["/v1/messages", "/v1/messages"])
    expect(sent.map((request) => request.headers.get("x-api-key")))
      .toEqual(["sk-test-a", "sk-test-b"])
  })
})
