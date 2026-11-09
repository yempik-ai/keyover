/**
 * API-key failover at the transport layer: one `fetch` that holds several keys
 * for one provider, in priority order, and resends a request on the next key
 * when the provider answers that the current key cannot serve it — out of
 * credit, quota or budget, or not accepted as a key. Every SDK that accepts a
 * custom `fetch` (the OpenAI and Anthropic SDKs, the AI SDK providers) uses it
 * unchanged.
 *
 * Safe by construction: a request moves to another key only on a response that
 * proves the provider did not run it (a billing or authentication rejection),
 * so a resend never executes work twice. Every other response — success, rate
 * limit, server error, a bad request — returns to the caller untouched, and the
 * SDK's own retry policy applies as before.
 *
 * Health is per process and in memory. A rejected key cools down with
 * exponential backoff; when the cooldown ends, one request probes it, and a key
 * that serves again takes its priority back without a restart. A cooling key is
 * never refused locally: when every preferred key rejects, the cooling ones are
 * tried last, soonest retry first, so the provider stays the authority on
 * whether a key works. Each request tries each key at most once. When every key
 * rejects, the last rejection returns with `x-should-retry: false`, so an SDK
 * that honours it does not spend its retries on a refusal no retry can change.
 *
 * Some request state is bound to the organization that produced it (OpenAI's
 * encrypted reasoning). A profile's {@link ProviderProfile.portable} rewrites a
 * request another organization refused for that reason, once, on the same key.
 *
 * Self-contained and provider-neutral; {@link OPENAI} and {@link ANTHROPIC} are
 * the profiles it ships with.
 */

/** Why a key cannot serve: out of credit, quota or budget; or not accepted as a key. */
export type RejectionReason = "billing" | "auth"

/** How one provider authenticates a request and says a key cannot serve. */
export interface ProviderProfile {
  readonly name: string
  /** Set the key on the outgoing headers, replacing the SDK's placeholder. */
  authorize(headers: Headers, apiKey: string): void
  /**
   * The rejection a non-2xx response proves, or null for any other failure.
   * `body` is the parsed JSON error body, or null when it is not JSON.
   */
  classify(status: number, body: unknown): RejectionReason | null
  /**
   * The JSON request rewritten without the state this key's organization
   * refused as another's, or null when the failure is not that. Optional.
   */
  portable?(status: number, body: unknown, request: unknown): unknown
}

/** One key of the pool. `id` names it in events and status; the key itself never leaves. */
export interface PoolKey<Id extends string = string> {
  readonly id: Id
  readonly apiKey: string
  /** Headers sent with this key only (its organization or project id, for example). */
  readonly headers?: Readonly<Record<string, string>>
}

/** What the pool observed. Carries key ids only, never key material. */
export type KeyEvent<Id extends string = string> =
  | {
      readonly type: "key_rejected"
      readonly key: Id
      readonly reason: RejectionReason
      readonly status: number
      /** Consecutive rejections of this key; 1 is the transition from serving. */
      readonly consecutive: number
      readonly cooldownMs: number
    }
  | {
      readonly type: "failover"
      readonly from: Id
      readonly to: Id
      readonly reason: RejectionReason
    }
  | { readonly type: "key_restored"; readonly key: Id }
  | { readonly type: "request_made_portable"; readonly key: Id }
  | {
      readonly type: "all_keys_rejected"
      readonly keys: readonly Id[]
      readonly reason: RejectionReason
    }

/** A key's health, as {@link KeyPool.status} reports it. */
export interface KeyStatus<Id extends string = string> {
  readonly id: Id
  readonly state: "serving" | "cooling"
  readonly consecutiveRejections: number
  readonly lastReason: RejectionReason | null
  /** Epoch ms when a cooling key may be probed again; null while serving. */
  readonly retryAt: number | null
}

export interface KeyPoolOptions<Id extends string> {
  readonly provider: ProviderProfile
  /** Priority order: the first key serves whenever it can. Ids must be unique. */
  readonly keys: readonly PoolKey<Id>[]
  /** The transport underneath; the global `fetch` as it is at each call when absent. */
  readonly fetch?: typeof globalThis.fetch
  /** Cooldown after the first rejection, doubled per consecutive one up to `max`. */
  readonly cooldownMs?: { readonly initial: number; readonly max: number }
  readonly now?: () => number
  /** Called synchronously; an exception it throws is swallowed, never the request's. */
  readonly onEvent?: (event: KeyEvent<Id>) => void
}

export interface KeyPool<Id extends string = string> {
  readonly provider: string
  /** Pass as the SDK's `fetch`. */
  readonly fetch: typeof globalThis.fetch
  readonly status: () => readonly KeyStatus<Id>[]
}

/**
 * The `apiKey` to give an SDK whose `fetch` is a pool's: the pool replaces it
 * on every request, and a request that somehow bypasses the pool fails
 * authentication instead of reaching the provider with a real key.
 */
export const POOLED_API_KEY = "pooled-by-key-failover"

const DEFAULT_COOLDOWN = { initial: 30_000, max: 300_000 } as const

/** Statuses a profile is asked about; every other response passes through unread. */
const CLASSIFIED_STATUSES = new Set([400, 401, 402, 403, 429])

type FetchInput = Parameters<typeof globalThis.fetch>[0]

interface KeyState<Id extends string> {
  readonly key: PoolKey<Id>
  consecutive: number
  lastReason: RejectionReason | null
  retryAt: number
  /** A request is probing this key after its cooldown; others treat it as cooling. */
  probing: boolean
}

/** A pool of keys for one provider, exposed as a `fetch`. */
export function createKeyPool<Id extends string>(options: KeyPoolOptions<Id>): KeyPool<Id> {
  const { provider } = options
  if (options.keys.length === 0) throw new Error(`key pool for ${provider.name} has no keys`)
  if (new Set(options.keys.map((key) => key.id)).size !== options.keys.length) {
    throw new Error(`key pool for ${provider.name} has duplicate key ids`)
  }
  const transport: typeof globalThis.fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init)
  const cooldown = options.cooldownMs ?? DEFAULT_COOLDOWN
  const now = options.now ?? Date.now
  const states: KeyState<Id>[] = options.keys.map((key) => ({
    key,
    consecutive: 0,
    lastReason: null,
    retryAt: 0,
    probing: false,
  }))

  const emit = (event: KeyEvent<Id>): void => {
    try {
      options.onEvent?.(event)
    } catch {
      // Observation must never fail the request it observes.
    }
  }

  /** Serving keys in priority order, then cooling ones, soonest retry first. */
  const attemptOrder = (at: number): KeyState<Id>[] => {
    const ready = states.filter((s) => s.retryAt <= at && !s.probing)
    const cooling = states.filter((s) => !ready.includes(s)).sort((a, b) => a.retryAt - b.retryAt)
    return [...ready, ...cooling]
  }

  const reject = (state: KeyState<Id>, reason: RejectionReason, status: number): void => {
    state.consecutive += 1
    state.lastReason = reason
    const cooldownMs = Math.min(cooldown.max, cooldown.initial * 2 ** (state.consecutive - 1))
    state.retryAt = now() + cooldownMs
    emit({
      type: "key_rejected",
      key: state.key.id,
      reason,
      status,
      consecutive: state.consecutive,
      cooldownMs,
    })
  }

  const accept = (state: KeyState<Id>): void => {
    if (state.consecutive === 0) return
    state.consecutive = 0
    state.lastReason = null
    state.retryAt = 0
    emit({ type: "key_restored", key: state.key.id })
  }

  /** One key's attempt: the request, and once more made portable when the profile can. */
  const attempt = async (state: KeyState<Id>, request: ReplayableRequest): Promise<Response> => {
    const headers = new Headers(request.headers)
    provider.authorize(headers, state.key.apiKey)
    for (const [name, value] of Object.entries(state.key.headers ?? {})) headers.set(name, value)
    const response = await request.send(headers)
    if (response.ok || provider.portable === undefined) return response
    const json = request.json()
    if (json === undefined) return response
    const rewritten = provider.portable(response.status, await errorBodyOf(response), json)
    if (rewritten === null || rewritten === undefined) return response
    await response.body?.cancel().catch(() => undefined)
    request.replaceJson(rewritten)
    // The body changed length: the transport measures it again.
    headers.delete("content-length")
    emit({ type: "request_made_portable", key: state.key.id })
    return request.send(headers)
  }

  const pooledFetch = async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    // Not a provider call (the OpenAI SDK probes `data:` URLs): no key, no health.
    if (!/^https?:/i.test(urlOf(input))) return transport(input, init)
    const request = await replayable(input, init, transport)
    const order = attemptOrder(now())
    for (const [index, state] of order.entries()) {
      request.signal?.throwIfAborted()
      // A key past its cooldown with rejections behind it is probed by this request alone,
      // and stays leased until its verdict is recorded.
      const probe = state.consecutive > 0 && state.retryAt <= now() && !state.probing
      if (probe) state.probing = true
      try {
        const response = await attempt(state, request)
        const reason =
          response.ok || !CLASSIFIED_STATUSES.has(response.status)
            ? null
            : provider.classify(response.status, await errorBodyOf(response))
        if (reason === null) {
          accept(state)
          return response
        }
        reject(state, reason, response.status)
        const next = order[index + 1]
        if (next === undefined) {
          emit({ type: "all_keys_rejected", keys: order.map((s) => s.key.id), reason })
          return final(response)
        }
        await response.body?.cancel().catch(() => undefined)
        emit({ type: "failover", from: state.key.id, to: next.key.id, reason })
      } finally {
        if (probe) state.probing = false
      }
    }
    // Unreachable: the pool has at least one key and the last attempt always returns.
    throw new Error(`key pool for ${provider.name} made no attempt`)
  }

  return {
    provider: provider.name,
    fetch: pooledFetch as typeof globalThis.fetch,
    status: () => {
      const at = now()
      return states.map((s) => {
        const cooling = s.consecutive > 0 && s.retryAt > at
        return {
          id: s.key.id,
          state: cooling ? "cooling" : "serving",
          consecutiveRejections: s.consecutive,
          lastReason: s.lastReason,
          retryAt: cooling ? s.retryAt : null,
        }
      })
    },
  }
}

/** A request that can be sent more than once, each time with its own headers. */
interface ReplayableRequest {
  readonly headers: Headers
  readonly signal: AbortSignal | null | undefined
  /** The body parsed as JSON on first use; undefined when it is not JSON text. What {@link ProviderProfile.portable} reads. */
  json(): unknown
  /** Send `body` as JSON from now on, on this key and every next one. */
  replaceJson(body: unknown): void
  send(headers: Headers): Promise<Response>
}

function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input
  return input instanceof URL ? input.href : input.url
}

/**
 * Make a request resendable. Strings, buffers, blobs and form data are resent
 * as they are; a one-shot stream body — a `Request`'s included — is read into
 * memory once, first, and the caller's abort stops that read.
 */
async function replayable(
  input: FetchInput,
  init: RequestInit | undefined,
  transport: typeof globalThis.fetch,
): Promise<ReplayableRequest> {
  let target: FetchInput
  let base: RequestInit
  let headers: Headers
  let body: RequestInit["body"]
  if (input instanceof Request) {
    const request = new Request(input, init)
    target = request.url
    base = {
      method: request.method,
      signal: request.signal,
      redirect: request.redirect,
      ...(request.keepalive ? { keepalive: true } : {}),
    }
    headers = new Headers(request.headers)
    body = request.body === null ? null : await buffered(request.body, request.signal)
  } else {
    target = input
    base = init ?? {}
    headers = new Headers(init?.headers)
    body =
      init?.body instanceof ReadableStream ? await buffered(init.body, init.signal) : init?.body
  }
  let json: { readonly value: unknown } | undefined
  return {
    headers,
    signal: base.signal,
    json() {
      json ??= { value: parseJson(body) }
      return json.value
    },
    replaceJson(next) {
      json = { value: next }
      body = JSON.stringify(next)
      headers.delete("content-length")
    },
    send: (sent) =>
      transport(target, { ...base, ...(body === undefined ? {} : { body }), headers: sent }),
  }
}

/** Read a stream to its end; an abort cancels the read and rejects with the signal's reason. */
async function buffered(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal | null | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted()
  const reader = stream.getReader()
  const stop = () => void reader.cancel(signal?.reason).catch(() => undefined)
  signal?.addEventListener("abort", stop, { once: true })
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      chunks.push(value)
      size += value.byteLength
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } finally {
    signal?.removeEventListener("abort", stop)
  }
}

/** A string or byte body parsed as JSON; undefined for any other body or text that is not JSON. */
function parseJson(body: RequestInit["body"]): unknown {
  let text: string
  if (typeof body === "string") text = body
  else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
    text = new TextDecoder().decode(body)
  else return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The parsed JSON error body of a response, read from a copy so the caller still gets it. */
async function errorBodyOf(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.clone().text())
  } catch {
    return null
  }
}

/** The response as the final answer: `x-should-retry: false`, since no retry can change it. */
function final(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set("x-should-retry", "false")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

interface ProviderError {
  readonly type?: unknown
  readonly code?: unknown
  readonly message?: unknown
  readonly details?: { readonly error_code?: unknown } | null
}

/** `body.error` as both providers shape it, or null. */
function errorOf(body: unknown): ProviderError | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null
  const error = (body as { error: unknown }).error
  return typeof error === "object" && error !== null ? (error as ProviderError) : null
}

/**
 * OpenAI codes that mean the organization or project has no credit, budget or
 * usage left (https://developers.openai.com/api/docs/guides/error-codes): each
 * names itself in `error.code`, while `error.type` may still read
 * `insufficient_quota`. `slow_down` and the rate limits are not here: they pass.
 */
const OPENAI_BILLING_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "billing_hard_limit_reached",
  "billing_not_active",
])

/**
 * OpenAI: `Authorization: Bearer`. The organization and project headers are
 * dropped — a key is already scoped to its own, and another key's would be
 * refused as a mismatch; a per-key value goes in {@link PoolKey.headers}.
 *
 * Encrypted reasoning (`include: ["reasoning.encrypted_content"]` with
 * `store: false`) decrypts only in the organization that produced it; another
 * answers 400 `invalid_encrypted_content`. {@link ProviderProfile.portable}
 * drops the `reasoning` input items — the model continues from the visible
 * turns and tool results, which the API accepts without them.
 */
export const OPENAI: ProviderProfile = {
  name: "openai",
  authorize(headers, apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`)
    headers.delete("openai-organization")
    headers.delete("openai-project")
  },
  classify(status, body) {
    if (status === 401) return "auth"
    const error = errorOf(body)
    if (error === null) return null
    if (OPENAI_BILLING_CODES.has(String(error.code)) || error.type === "insufficient_quota")
      return "billing"
    return null
  },
  portable(status, body, request) {
    if (status !== 400 || errorOf(body)?.code !== "invalid_encrypted_content") return null
    if (typeof request !== "object" || request === null || !("input" in request)) return null
    const { input } = request as { input: unknown }
    if (!Array.isArray(input)) return null
    const kept = input.filter(
      (item: unknown) =>
        !(
          typeof item === "object" &&
          item !== null &&
          (item as { type?: unknown }).type === "reasoning"
        ),
    )
    return kept.length === input.length ? null : { ...request, input: kept }
  },
}

/**
 * Anthropic (https://platform.claude.com/docs/en/api/errors, …/rate-limits):
 * 402 `billing_error`; a 400 whose message names the credit balance or a spend
 * limit the organization or workspace set; a 429 whose `details.error_code` is
 * `enforced_spend_limit_reached` (the tier's monthly cap). An organization on
 * hold is a trust-and-safety decision, never routed around.
 *
 * The key rides the header the SDK chose: the Anthropic SDK sends
 * `Authorization: Bearer`, the AI SDK `x-api-key`; the API accepts both.
 */
export const ANTHROPIC: ProviderProfile = {
  name: "anthropic",
  authorize(headers, apiKey) {
    if (headers.has("authorization")) {
      headers.set("authorization", `Bearer ${apiKey}`)
      headers.delete("x-api-key")
    } else {
      headers.set("x-api-key", apiKey)
    }
  },
  classify(status, body) {
    if (status === 401) return "auth"
    const error = errorOf(body)
    if (status === 402 || error?.type === "billing_error") return "billing"
    if (status === 429 && error?.details?.error_code === "enforced_spend_limit_reached")
      return "billing"
    if (
      status === 400 &&
      typeof error?.message === "string" &&
      ANTHROPIC_BILLING_MESSAGE.test(error.message)
    ) {
      return "billing"
    }
    return null
  },
}

const ANTHROPIC_BILLING_MESSAGE =
  /credit balance is too low|reached your specified (workspace )?API usage limits/i
