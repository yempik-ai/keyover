# ai-key-failover

When one billing organization runs out of credit, production AI features can go down even though another organization has capacity. `ai-key-failover` holds several API keys for one provider, in priority order, behind one `fetch`. When the provider rejects a key for billing or authentication, the request moves to the next key in-process, without a restart. It works with SDKs that accept a custom `fetch`, has no runtime dependencies, and ships as ESM for Node.js 20 and later.

## Install

```sh
pnpm add ai-key-failover openai
```

Set `OPENAI_API_KEY_PRIMARY` and `OPENAI_API_KEY_FALLBACK` on your server:

```ts
import OpenAI from "openai"
import { createKeyPool, OPENAI, POOLED_API_KEY } from "ai-key-failover"

const pool = createKeyPool({
  provider: OPENAI,
  keys: [
    { id: "primary", apiKey: process.env.OPENAI_API_KEY_PRIMARY! },
    { id: "fallback", apiKey: process.env.OPENAI_API_KEY_FALLBACK! },
  ],
})
const client = new OpenAI({ apiKey: POOLED_API_KEY, organization: null, project: null, fetch: pool.fetch })

const response = await client.responses.create({ model: "gpt-6-luna", input: "Hello", store: false })
console.log(response.output_text)
```

Create one pool per provider per process and reuse it across requests. The keys are tried in array order. `POOLED_API_KEY` is a placeholder: the pool replaces it before sending a provider request. Validate environment variables at application startup; the complete [examples](./examples) do so. Keep keys and the pool on your server.

## Use with

These snippets assume `primary` and `fallback` contain validated API keys.

### OpenAI SDK

```ts
import OpenAI from "openai"
import { createKeyPool, OPENAI, POOLED_API_KEY } from "ai-key-failover"

const pool = createKeyPool({
  provider: OPENAI,
  keys: [{ id: "primary", apiKey: primary }, { id: "fallback", apiKey: fallback }],
})
const client = new OpenAI({
  apiKey: POOLED_API_KEY, organization: null, project: null, fetch: pool.fetch,
})
const response = await client.responses.create({
  model: "gpt-6-luna", input: "Hello", store: false,
})
```

### Anthropic SDK

```ts
import Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC, createKeyPool, POOLED_API_KEY } from "ai-key-failover"

const pool = createKeyPool({
  provider: ANTHROPIC,
  keys: [{ id: "primary", apiKey: primary }, { id: "fallback", apiKey: fallback }],
})
const client = new Anthropic({ apiKey: POOLED_API_KEY, fetch: pool.fetch })
const response = await client.messages.create({
  model: "claude-haiku-5-5", max_tokens: 128,
  messages: [{ role: "user", content: "Hello" }],
})
```

### Vercel AI SDK

Install `ai` and the provider package you use (`@ai-sdk/openai` or `@ai-sdk/anthropic`), with their required Zod peer.

```ts
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { ANTHROPIC, createKeyPool, OPENAI, POOLED_API_KEY } from "ai-key-failover"

const openaiPool = createKeyPool({
  provider: OPENAI,
  keys: [{ id: "primary", apiKey: openaiPrimary }, { id: "fallback", apiKey: openaiFallback }],
})
const anthropicPool = createKeyPool({
  provider: ANTHROPIC,
  keys: [{ id: "primary", apiKey: anthropicPrimary }, { id: "fallback", apiKey: anthropicFallback }],
})
const openai = createOpenAI({ apiKey: POOLED_API_KEY, fetch: openaiPool.fetch })
const anthropic = createAnthropic({ apiKey: POOLED_API_KEY, fetch: anthropicPool.fetch })

const fromOpenAI = await generateText({
  model: openai.responses("gpt-6-luna"), prompt: "Hello",
  providerOptions: { openai: { store: false } },
})
const fromAnthropic = await generateText({ model: anthropic("claude-haiku-5-5"), prompt: "Hello" })
```

## Guarantees

- Failover happens only on responses proving the request was not executed: a billing or authentication rejection. Resending therefore never double-executes work.
- Every other response returns untouched. The SDK's retry policy continues to apply to those responses. Transport errors propagate to the SDK too.
- Key health is in-memory and per process.
- Rejected keys enter exponential cooldown: 30 seconds by default, doubling on consecutive rejections up to 5 minutes. After cooldown, a single request probes the key while concurrent requests prefer serving keys. Configure durations with `cooldownMs: { initial: 30_000, max: 300_000 }`.
- A key that serves again automatically regains its original priority.
- Cooling keys are never refused locally. They are tried last, soonest retry first, so the provider remains the authority on whether a key works.
- Each request tries each key at most once for failover. The portability repair described below can resend once on the same key.
- If every key rejects, the last rejection carries `x-should-retry: false`. SDKs that honor this header avoid retrying an exhausted pool.
- OpenAI organization and project headers are dropped. Set organization-specific headers per key with `headers: { "openai-organization": "org-id", "openai-project": "proj-id" }` when needed.
- One-shot request stream bodies are buffered once so they can be resent. Successful response streams pass through; the pool cannot fail over after a stream starts.
- Non-HTTP fetches, such as `data:` URLs, pass through without authorization changes or health updates.

## What counts as a rejection

The tables describe the built-in profiles. Classification runs only for HTTP 400, 401, 402, 403, and 429; all other statuses pass through unread. Error fields below are under `error` in the JSON response.

### OpenAI

| Status | Error type or code | Reason |
| --- | --- | --- |
| 401 | Any body, including non-JSON | `auth` |
| 400, 402, 403, 429 | `type: "insufficient_quota"` | `billing` |
| 400, 402, 403, 429 | `code: "insufficient_quota"` or `"credit_balance_exhausted"` | `billing` |
| 400, 402, 403, 429 | `code: "organization_spend_limit_exceeded"` or `"project_spend_limit_exceeded"` | `billing` |
| 400, 402, 403, 429 | `code: "organization_usage_limit_exceeded"` | `billing` |
| 400, 402, 403, 429 | `code: "billing_hard_limit_reached"` or `"billing_not_active"` | `billing` |

OpenAI distinguishes quota exhaustion from request-rate limits in its [error-code guide](https://developers.openai.com/api/docs/guides/error-codes).

### Anthropic

| Status | Error type, code, or message | Reason |
| --- | --- | --- |
| 401 | Any body, including non-JSON | `auth` |
| 402 | Any body | `billing` |
| 400, 403, 429 | `type: "billing_error"` | `billing` |
| 400 | Message contains `credit balance is too low` (case-insensitive) | `billing` |
| 400 | Message contains `reached your specified API usage limits` or `reached your specified workspace API usage limits` (case-insensitive) | `billing` |
| 429 | `details.error_code: "enforced_spend_limit_reached"` | `billing` |

Anthropic documents billing, authentication, and permission failures in [API errors](https://platform.claude.com/docs/en/api/errors), and the monthly spend-cap discriminator in [rate limits](https://platform.claude.com/docs/en/api/rate-limits).

The following do **not** trigger failover:

- Rate limits, including OpenAI `slow_down` and Anthropic `ramp_limit_exceeded`: these are traffic controls, not billing or key rejections. The SDK retains its retry policy.
- Server errors (5xx, including Anthropic 529): these do not establish non-execution, so resending with another key could execute work twice.
- Ordinary 400 errors: switching keys does not repair invalid input. The explicit encrypted-reasoning repair below is separate from failover.
- 403/404 model-access errors: configure the required model access in each organization instead of treating permissions as exhausted credit.
- Anthropic `organization_on_hold`: this is a trust-and-safety decision you must not route around.

## State bound to an organization

OpenAI encrypted reasoning, requested with `include: ["reasoning.encrypted_content"]` and `store: false`, only decrypts in the organization that produced it. Another organization answers HTTP 400 with `invalid_encrypted_content`: "Encrypted content organization_id did not match the target organization". The OpenAI profile drops input items whose `type` is `"reasoning"` and resends once on the same key. The model continues from visible turns and tool results. This behavior was verified against the live API in the source production system; this repository's tests use fake transports.

Anthropic thinking blocks from recent models are silently dropped across organizations, without an error. Prompt caches are per organization for both providers: a switch only costs cache warmth.

Stored provider state belongs to one organization. `store: true`, `previous_response_id`, Files, vector stores, Assistants, Batches, and fine-tuned models are **not portable**. This package does not make them portable. Keep requests stateless and carry visible conversation turns and tool results if you want failover; for OpenAI Responses, set `store: false` explicitly.

## Observability

`onEvent` receives the `KeyEvent<Id>` discriminated union. `RejectionReason` is `"billing" | "auth"`:

```ts
type KeyEvent<Id extends string = string> =
  | { readonly type: "key_rejected"; readonly key: Id; readonly reason: RejectionReason; readonly status: number; readonly consecutive: number; readonly cooldownMs: number }
  | { readonly type: "failover"; readonly from: Id; readonly to: Id; readonly reason: RejectionReason }
  | { readonly type: "key_restored"; readonly key: Id }
  | { readonly type: "request_made_portable"; readonly key: Id }
  | { readonly type: "all_keys_rejected"; readonly keys: readonly Id[]; readonly reason: RejectionReason }
```

Page on the first `key_rejected` (`consecutive === 1`) and on `all_keys_rejected`. Events carry key ids only, never key material. Choose ids suitable for logs. The callback runs synchronously, and callback exceptions are swallowed so observation cannot fail a request.

```ts
const pool = createKeyPool({
  provider: OPENAI,
  keys: [{ id: "primary", apiKey: primary }, { id: "fallback", apiKey: fallback }],
  onEvent: (event) => console.info("key-pool", event),
})
console.log(pool.status())
```

`status()` returns a snapshot in configured priority order: `id`, `state` (`"serving" | "cooling"`), `consecutiveRejections`, `lastReason`, and `retryAt` (epoch milliseconds, or `null` while serving). A key becomes eligible for a probe when its cooldown expires; a `"serving"` snapshot alone is not evidence that a recovery probe has succeeded. `key_restored` records that observation.

## Multiple processes

Health is per process by design. Each instance discovers a rejected key with one fast extra round trip, then prefers its fallback during cooldown. No shared store or coordination service is needed. Reuse the pool within each instance so it retains those observations.

## Custom providers

A `ProviderProfile` defines `name`, `authorize(headers, apiKey)`, `classify(status, body)`, and optional `portable(status, body, request)`. Authorization replaces the SDK placeholder. Classification returns `"billing"`, `"auth"`, or `null`. A portability hook returns rewritten JSON, or `null`/`undefined` when no repair applies; the pool resends a rewrite once on the same key. Profiles must classify only rejections that prove non-execution.

An OpenAI-compatible provider with the same authentication and error contract can reuse the built-in logic:

```ts
import { createKeyPool, OPENAI, type ProviderProfile } from "ai-key-failover"

const compatible: ProviderProfile = { ...OPENAI, name: "compatible" }
const pool = createKeyPool({
  provider: compatible,
  keys: [{ id: "primary", apiKey: primary }, { id: "fallback", apiKey: fallback }],
})
// Pass pool.fetch to the SDK configured with the provider's base URL.
```

Confirm that provider's error contract before reusing classification or portability. Only the classified HTTP statuses listed above reach `classify`.

## Before you add a second organization

- [ ] Both organizations have access to the same models you call.
- [ ] Both have the required data controls and retention settings, with a DPA accepted in each organization. Each organization is a separate account with the provider.
- [ ] Spend limits are set deliberately in each organization.
- [ ] Rejection alerts reach someone who can restore billing or replace a key.

## Porting to another language

1. Keep an ordered, nonempty list of keys with unique ids and optional per-key headers; retain rejection count, reason, retry time, and probe-in-flight state in memory.
2. Pass non-HTTP requests directly to the underlying transport.
3. Prepare a replayable request, buffering a one-shot request body once; retain its cancellation signal and parsed JSON when available.
4. Snapshot attempt order: eligible keys in configured priority order, then cooling or already-probing keys sorted by earliest retry time.
5. Before each key, honor cancellation. Claim an eligible recovering key's probe for this attempt; concurrent requests prefer other eligible keys.
6. Copy request headers, authorize with that key, then apply its per-key headers. OpenAI authorization also drops organization/project headers.
7. Send the request. If the optional portability hook can repair rejected JSON state, cancel the rejected response body, replace request JSON (dropping any `Content-Length`), emit `request_made_portable`, and resend once on that same key.
8. Classify only non-success responses with status 400, 401, 402, 403, or 429, using a copy of the error body. Transport failures propagate.
9. For an unclassified response, clear any rejection state, emit `key_restored` if needed, and return the response untouched.
10. For a rejection, increment its consecutive count; set retry time to now plus `min(max, initial × 2^(count − 1))`; emit `key_rejected`.
11. If another key remains, cancel the rejected response body, emit `failover`, and continue. Otherwise emit `all_keys_rejected` and return the last response with `x-should-retry: false`. Release a probe claim only once its verdict (step 9 or 10) is recorded, also when the attempt throws — releasing it earlier lets concurrent requests probe the same key again.
12. Expose health snapshots and id-only synchronous events; isolate observer exceptions from requests. Each request visits each key once, apart from the one portability resend per key attempt.

## Limitations / non-goals

This is not a load balancer. It does not spread load on rate limits, share health across processes, or make stored provider state portable. It does not change the SDK's handling of unclassified responses or resume a failed response stream. Request-body buffering uses memory proportional to the body size.

## License

[MIT](./LICENSE), Copyright (c) 2026 Simone Bova.
