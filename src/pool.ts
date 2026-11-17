/**
 * API-key failover at the transport layer: one `fetch` that holds several keys
 * for one provider, in priority order, and resends a request on the next key
 * when the provider answers that the current key cannot serve it: out of
 * credit, quota or budget, or not accepted as a key. Every SDK that accepts a
 * custom `fetch` (the OpenAI and Anthropic SDKs, the AI SDK providers) uses it
 * unchanged.
 *
 * A request moves to another key only on a response the provider defines as a
 * refusal given before any work ran (a billing or authentication rejection), so
 * the pool adds no retry for a failure that may have executed. Every other
 * response (success, rate limit, server error, a bad request) returns to the
 * caller untouched, and the SDK's own retry policy applies as before.
 *
 * Health is per process and in memory. A rejected key cools down with
 * exponential backoff; when the cooldown ends, one request probes it, and a key
 * that answers 2xx again takes its priority back without a restart. A cooling key is
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
 * Provider-neutral: what a provider's rejections look like is a
 * {@link ProviderProfile}, and the ones this package ships are in `profiles.ts`.
 */

/**
 * Why a provider refused to run a request on a key.
 *
 * - `credit`: the organization's credit, balance or payment cannot cover it.
 * - `spend_limit`: a limit the organization set for itself was reached (an
 *   organization, project, workspace or key budget).
 * - `provider_limit`: a spending cap the provider assigned to the organization
 *   (a usage tier). The pool does not move a request for it unless
 *   {@link KeyPoolOptions.failoverOn} says so: the cap is the provider's rule.
 * - `auth`: the provider did not accept the key for this request.
 */
export type RejectionReason = "credit" | "spend_limit" | "provider_limit" | "auth"

/** The rejections a pool moves a request for when {@link KeyPoolOptions.failoverOn} is absent. */
export const DEFAULT_FAILOVER_ON = ["credit", "spend_limit", "auth"] as const satisfies readonly RejectionReason[]

/** How one provider authenticates a request and says a key cannot serve. */
export interface ProviderProfile {
  readonly name: string
  /** Set the key on the outgoing headers, replacing the SDK's placeholder. */
  authorize(headers: Headers, apiKey: string): void
  /**
   * The rejection a non-2xx response proves, or null for any other failure.
   * `body` is the parsed JSON error body, or null when it is not JSON. Return a
   * reason only for an answer the provider defines as given before any work
   * ran: the pool resends on it.
   */
  classify(status: number, body: unknown, headers: Headers): RejectionReason | null
  /**
   * The JSON request rewritten without the state this key's organization
   * refused as another's, or null when the failure is not that. Optional.
   */
  portable?(status: number, body: unknown, request: unknown): unknown
}

/**
 * One key of the pool: the key itself, or the key with headers sent with it
 * only (its organization or project id, for example). An entry with no key (an
 * environment variable that is not set here) is left out of the pool.
 */
export type PoolKey =
  | string
  | null
  | undefined
  | {
      readonly apiKey: string | null | undefined
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
  /**
   * `serving`: no rejection on record. `cooling`: rejected, tried last until
   * `retryAt`. `recovering`: its cooldown is over and the next request probes it.
   */
  readonly state: "serving" | "cooling" | "recovering"
  readonly consecutiveRejections: number
  readonly lastReason: RejectionReason | null
  /** Epoch ms when a cooling key may be probed again; null in any other state. */
  readonly retryAt: number | null
}

export interface KeyPoolOptions<Id extends string> {
  readonly provider: ProviderProfile
  /**
   * The keys by id, in priority order: the first serves whenever it can. An id
   * names its key in events and status; the key itself never leaves the pool.
   * Give ids names, not numbers: JavaScript lists integer-like properties first.
   */
  readonly keys: Readonly<Record<Id, PoolKey>>
  /**
   * The rejections that move a request to the next key. Default
   * {@link DEFAULT_FAILOVER_ON}: every reason but `provider_limit`. Any other
   * rejection returns to the caller untouched, like a rate limit.
   */
  readonly failoverOn?: readonly RejectionReason[]
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
  /**
   * What an SDK client takes to run through the pool: this `fetch` and
   * {@link POOLED_API_KEY}. `new OpenAI(pool.clientOptions)`,
   * `new Anthropic(pool.clientOptions)`, `createOpenAI(pool.clientOptions)`.
   */
  readonly clientOptions: {
    readonly apiKey: typeof POOLED_API_KEY
    readonly fetch: typeof globalThis.fetch
  }
  /** Each key's health, in priority order. */
  readonly status: () => readonly KeyStatus<Id>[]
}

/**
 * The `apiKey` to give an SDK whose `fetch` is a pool's: the pool replaces it
 * on every request, and a request that somehow bypasses the pool fails
 * authentication instead of reaching the provider with a real key.
 */
export const POOLED_API_KEY = "pooled-by-key-failover"

const DEFAULT_COOLDOWN = { initial: 30_000, max: 300_000 } as const

/** A key with a character outside printable ASCII: no header can carry it, and the error that says so quotes it. */
const UNSENDABLE = /[^\x21-\x7e]/

/** Statuses a profile is asked about; every other response passes through unread. */
const CLASSIFIED_STATUSES = new Set([400, 401, 402, 403, 429])

type FetchInput = Parameters<typeof globalThis.fetch>[0]

interface KeyState<Id extends string> {
  readonly id: Id
  readonly apiKey: string
  readonly headers: Readonly<Record<string, string>>
  consecutive: number
  lastReason: RejectionReason | null
  retryAt: number
  /** A request is probing this key after its cooldown; others treat it as cooling. */
  probing: boolean
}

/** A pool of keys for one provider, exposed as a `fetch`. */
export function createKeyPool<Id extends string>(options: KeyPoolOptions<Id>): KeyPool<Id> {
  const { provider } = options
  const transport: typeof globalThis.fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init)
  const cooldown = options.cooldownMs ?? DEFAULT_COOLDOWN
  const failoverOn: ReadonlySet<RejectionReason> = new Set(options.failoverOn ?? DEFAULT_FAILOVER_ON)
  const now = options.now ?? Date.now
  const states: KeyState<Id>[] = []
  for (const id of Object.keys(options.keys) as Id[]) {
    const entry: PoolKey = options.keys[id]
    // Trimmed: a newline left by a secret file is the usual way a good key gets refused.
    const apiKey = (typeof entry === "object" ? entry?.apiKey : entry)?.trim()
    if (!apiKey) continue
    if (UNSENDABLE.test(apiKey)) {
      throw new Error(`key pool for ${provider.name}: key "${id}" has characters a header cannot carry`)
    }
    const headers = (typeof entry === "object" && entry?.headers) || {}
    states.push({ id, apiKey, headers, consecutive: 0, lastReason: null, retryAt: 0, probing: false })
  }
  if (states.length === 0) throw new Error(`key pool for ${provider.name} has no keys`)

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
    // The exponent is capped so a long run of rejections cannot overflow into NaN.
    const cooldownMs = Math.min(
      cooldown.max,
      cooldown.initial * 2 ** Math.min(state.consecutive - 1, 30),
    )
    state.retryAt = now() + cooldownMs
    emit({
      type: "key_rejected",
      key: state.id,
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
    emit({ type: "key_restored", key: state.id })
  }

  /** One key's attempt: the request, and once more made portable when the profile can. */
  const attempt = async (state: KeyState<Id>, request: ReplayableRequest): Promise<Response> => {
    try {
      const headers = new Headers(request.headers)
      provider.authorize(headers, state.apiKey)
      for (const [name, value] of Object.entries(state.headers)) headers.set(name, value)
      const response = await request.send(headers)
      if (provider.portable === undefined || !CLASSIFIED_STATUSES.has(response.status)) {
        return response
      }
      const json = request.json()
      if (json === undefined) return response
      const rewritten = provider.portable(response.status, await errorBodyOf(response), json)
      if (rewritten === null || rewritten === undefined) return response
      await response.body?.cancel().catch(() => undefined)
      request.replaceJson(rewritten)
      emit({ type: "request_made_portable", key: state.id })
      return await request.send(headers)
    } catch (error) {
      throw withoutKey(error, state.apiKey)
    }
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
        if (response.ok) {
          accept(state)
          return response
        }
        const reason = CLASSIFIED_STATUSES.has(response.status)
          ? provider.classify(response.status, await errorBodyOf(response), response.headers)
          : null
        // Not a rejection this pool moves for: the caller's answer, and no verdict on the key.
        if (reason === null || !failoverOn.has(reason)) return response
        reject(state, reason, response.status)
        const next = order[index + 1]
        if (next === undefined) {
          emit({ type: "all_keys_rejected", keys: order.map((s) => s.id), reason })
          return final(response)
        }
        await response.body?.cancel().catch(() => undefined)
        emit({ type: "failover", from: state.id, to: next.id, reason })
      } finally {
        if (probe) state.probing = false
      }
    }
    // Unreachable: the pool has at least one key and the last attempt always returns.
    throw new Error(`key pool for ${provider.name} made no attempt`)
  }

  const fetch = pooledFetch as typeof globalThis.fetch
  return {
    provider: provider.name,
    fetch,
    clientOptions: { apiKey: POOLED_API_KEY, fetch },
    status: () => {
      const at = now()
      return states.map((s) => {
        const state = s.consecutive === 0 ? "serving" : s.retryAt > at ? "cooling" : "recovering"
        return {
          id: s.id,
          state,
          consecutiveRejections: s.consecutive,
          lastReason: s.lastReason,
          retryAt: state === "cooling" ? s.retryAt : null,
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
 * as they are; a one-shot stream body, a `Request`'s included, is read into
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
      cache: request.cache,
      credentials: request.credentials,
      integrity: request.integrity,
      keepalive: request.keepalive,
      // "navigate" is a mode only the browser itself may set.
      ...(request.mode === "navigate" ? {} : { mode: request.mode }),
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
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
  let rewritten = false
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
      rewritten = true
      headers.delete("content-length")
    },
    send(sent) {
      // The body changed length: no header, a key's own included, may state the old one.
      if (rewritten) sent.delete("content-length")
      return transport(target, { ...base, ...(body === undefined ? {} : { body }), headers: sent })
    },
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

const errorBodies = new WeakMap<Response, Promise<unknown>>()

/** The parsed JSON error body of a response, read once, from a copy so the caller still gets it. */
function errorBodyOf(response: Response): Promise<unknown> {
  let body = errorBodies.get(response)
  if (body === undefined) {
    body = response
      .clone()
      .text()
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => null)
    errorBodies.set(response, body)
  }
  return body
}

/**
 * The response as the final answer: `x-should-retry: false`, since no retry can
 * change it. A fetched response's headers are immutable, so it is rebuilt, and
 * keeps the address it came from.
 */
function final(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set("x-should-retry", "false")
  const rebuilt = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  Object.defineProperties(rebuilt, {
    url: { value: response.url },
    redirected: { value: response.redirected },
  })
  return rebuilt
}

/**
 * `error` with the key removed from its message. A transport, or `Headers`
 * itself, can quote a header value in what it throws, and errors get logged.
 * An error that does not carry the key is returned as it is.
 */
function withoutKey(error: unknown, apiKey: string): unknown {
  if (!(error instanceof Error)) return error
  if (!error.message.includes(apiKey) && !error.stack?.includes(apiKey)) return error
  const clean = new Error(error.message.replaceAll(apiKey, "[key]"))
  clean.name = error.name
  return clean
}
