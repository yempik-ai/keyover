/**
 * A provider that lives in memory: a `fetch` that answers like OpenAI or
 * Anthropic for a set of billing organizations whose credit you control. Use it
 * as a pool's `fetch` to test what your code does when an organization runs out
 * of credit, a key is revoked or a rate limit hits, without a network or a bill.
 *
 * The rejections carry the status and JSON body the real provider sends, so the
 * real SDKs raise their real error classes and the pool classifies them as it
 * does in production. Successful answers are minimal but complete: the OpenAI
 * SDK, the Anthropic SDK and the AI SDK providers parse them.
 */

/** The API whose wire format the fake speaks. */
export type FakeFlavor = "openai" | "anthropic"

/** One billing organization of the fake provider. */
export interface FakeOrg {
  /** The key that bills this organization. */
  readonly apiKey: string
  /** Credit left. A request costs {@link FakeProviderOptions.cost}; default: never runs out. */
  readonly credit?: number
}

/** What the fake answered to one request. */
export interface FakeCall<Id extends string = string> {
  /** The organization the request's key bills; null when the key is unknown. */
  readonly org: Id | null
  readonly status: number
  readonly outcome: "served" | "out_of_credit" | "revoked" | "rate_limited" | "unknown_key"
  readonly url: string
}

/** An organization's live state, as {@link FakeProvider.state} reports it. */
export interface FakeOrgState {
  readonly credit: number
  readonly revoked: boolean
  readonly rateLimited: boolean
  /** Requests this organization served and was charged for. */
  readonly served: number
}

export interface FakeProviderOptions<Id extends string> {
  readonly flavor: FakeFlavor
  readonly orgs: Readonly<Record<Id, FakeOrg>>
  /** Credit one served request costs. Default 1. */
  readonly cost?: number
  /** Milliseconds each answer takes. Default 0. */
  readonly latencyMs?: number
  /** The text a served request answers with. Default names the organization. */
  readonly reply?: (org: Id) => string
  /** Called after every answer, rejections included. */
  readonly onCall?: (call: FakeCall<Id>) => void
}

export interface FakeProvider<Id extends string> {
  /** Pass as the pool's `fetch`. */
  readonly fetch: typeof globalThis.fetch
  /** Every answer so far, oldest first. */
  readonly calls: readonly FakeCall<Id>[]
  readonly state: (org: Id) => FakeOrgState
  /** Spend the organization's credit: its next request is rejected as out of credit. */
  readonly drain: (org: Id) => void
  /** Add credit, as a top-up or an auto-recharge does. */
  readonly topUp: (org: Id, credit: number) => void
  /** Revoke or reinstate the organization's key. */
  readonly revoke: (org: Id, revoked?: boolean) => void
  /** Start or stop answering the organization's requests with a rate limit. */
  readonly rateLimit: (org: Id, limited?: boolean) => void
}

interface OrgState {
  credit: number
  revoked: boolean
  rateLimited: boolean
  served: number
}

/** A fake provider for the given organizations. */
export function fakeProvider<Id extends string>(
  options: FakeProviderOptions<Id>,
): FakeProvider<Id> {
  const { flavor } = options
  const cost = options.cost ?? 1
  const ids = Object.keys(options.orgs) as Id[]
  const states = new Map<Id, OrgState>(
    ids.map((id) => [
      id,
      {
        credit: options.orgs[id].credit ?? Number.POSITIVE_INFINITY,
        revoked: false,
        rateLimited: false,
        served: 0,
      },
    ]),
  )
  const byKey = new Map<string, Id>(ids.map((id) => [options.orgs[id].apiKey, id]))
  const calls: FakeCall<Id>[] = []

  const stateOf = (org: Id): OrgState => {
    const state = states.get(org)
    if (state === undefined) throw new Error(`fake provider has no organization "${org}"`)
    return state
  }

  const answer = (org: Id | null, url: string): { call: FakeCall<Id>; response: Response } => {
    const reject = (outcome: Exclude<FakeCall["outcome"], "served">) => {
      const { status, body, headers } = REJECTIONS[flavor][outcome]
      return {
        call: { org, status, outcome, url },
        response: Response.json(body, { status, ...(headers ? { headers } : {}) }),
      }
    }
    if (org === null) return reject("unknown_key")
    const state = stateOf(org)
    if (state.revoked) return reject("revoked")
    if (state.credit < cost) return reject("out_of_credit")
    if (state.rateLimited) return reject("rate_limited")
    state.credit -= cost
    state.served += 1
    const text = options.reply?.(org) ?? `Served by ${org}.`
    return {
      call: { org, status: 200, outcome: "served", url },
      response: Response.json(success(flavor, url, text)),
    }
  }

  const fetch = async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init)
    const key =
      request.headers.get("authorization")?.replace(/^Bearer /i, "") ??
      request.headers.get("x-api-key") ??
      ""
    if (options.latencyMs) await sleep(options.latencyMs, request.signal)
    request.signal.throwIfAborted()
    const { call, response } = answer(byKey.get(key) ?? null, request.url)
    calls.push(call)
    options.onCall?.(call)
    return response
  }

  return {
    fetch: fetch as typeof globalThis.fetch,
    calls,
    state: (org) => ({ ...stateOf(org) }),
    drain: (org) => {
      stateOf(org).credit = 0
    },
    topUp: (org, credit) => {
      stateOf(org).credit += credit
    },
    revoke: (org, revoked = true) => {
      stateOf(org).revoked = revoked
    },
    rateLimit: (org, limited = true) => {
      stateOf(org).rateLimited = limited
    },
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms)
    function done() {
      signal.removeEventListener("abort", abort)
      resolve()
    }
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

interface Rejection {
  readonly status: number
  readonly body: unknown
  readonly headers?: Record<string, string>
}

/** The rejections as each provider sends them: status, body and the header an SDK reads. */
const REJECTIONS: Record<FakeFlavor, Record<Exclude<FakeCall["outcome"], "served">, Rejection>> = {
  openai: {
    out_of_credit: {
      status: 429,
      body: {
        error: {
          message:
            "You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.",
          type: "insufficient_quota",
          param: null,
          code: "insufficient_quota",
        },
      },
    },
    revoked: {
      status: 401,
      body: {
        error: {
          message:
            "Incorrect API key provided. You can find your API key at https://platform.openai.com/account/api-keys.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      },
    },
    unknown_key: {
      status: 401,
      body: {
        error: {
          message:
            "Incorrect API key provided. You can find your API key at https://platform.openai.com/account/api-keys.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      },
    },
    rate_limited: {
      status: 429,
      headers: { "retry-after": "1" },
      body: {
        error: {
          message: "Rate limit reached for requests. Please try again in 1s.",
          type: "requests",
          param: null,
          code: "rate_limit_exceeded",
        },
      },
    },
  },
  anthropic: {
    out_of_credit: {
      status: 400,
      body: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        },
      },
    },
    revoked: {
      status: 401,
      body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
    },
    unknown_key: {
      status: 401,
      body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
    },
    rate_limited: {
      status: 429,
      headers: { "retry-after": "1" },
      body: {
        type: "error",
        error: {
          type: "rate_limit_error",
          message: "This request would exceed your organization's rate limit.",
        },
      },
    },
  },
}

/** The smallest complete answer of the endpoint the request addressed. */
function success(flavor: FakeFlavor, url: string, text: string): unknown {
  const usage = { input_tokens: 1, output_tokens: 1 }
  if (flavor === "anthropic") {
    return {
      id: "msg_fake",
      type: "message",
      role: "assistant",
      model: "fake",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage,
    }
  }
  if (new URL(url).pathname.endsWith("/chat/completions")) {
    return {
      id: "chatcmpl_fake",
      object: "chat.completion",
      created: 0,
      model: "fake",
      choices: [
        { index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }
  }
  return {
    id: "resp_fake",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "fake",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        id: "msg_fake",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { ...usage, total_tokens: 2 },
  }
}
