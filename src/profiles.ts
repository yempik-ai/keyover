/**
 * How each provider authenticates a request and says a key cannot serve.
 *
 * A profile returns a reason only for an answer its provider documents, or is
 * reliably reported, to give before running the request. Everything it is not
 * sure of returns null and goes back to the caller. The evidence for every
 * rule, and the answers that must not match, are in `spec/contracts.ts`.
 */
import type { ProviderProfile, RejectionReason } from "./pool.ts"

interface ProviderError {
  readonly type?: unknown
  readonly code?: unknown
  readonly message?: unknown
  readonly status?: unknown
  readonly details?: unknown
  readonly metadata?: { readonly limit_source?: unknown } | null
}

/** `body.error` as an object, the envelope most providers use, or null. */
function errorOf(body: unknown): ProviderError | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null
  const error = (body as { error: unknown }).error
  return typeof error === "object" && error !== null ? (error as ProviderError) : null
}

function bearer(headers: Headers, apiKey: string): void {
  headers.set("authorization", `Bearer ${apiKey}`)
}

/**
 * OpenAI's codes for an organization or project that cannot pay for the
 * request (https://developers.openai.com/api/docs/guides/error-codes). Each
 * names itself in `error.code`, while `error.type` may still read
 * `insufficient_quota`. `organization_usage_limit_exceeded` is the monthly
 * limit OpenAI assigns to the organization's tier, not one the organization
 * set. `slow_down` and the rate limits are not here: they pass.
 */
const OPENAI_CODES: ReadonlyMap<unknown, RejectionReason> = new Map([
  ["insufficient_quota", "credit"],
  ["credit_balance_exhausted", "credit"],
  ["billing_not_active", "credit"],
  ["organization_spend_limit_exceeded", "spend_limit"],
  ["project_spend_limit_exceeded", "spend_limit"],
  ["billing_hard_limit_reached", "spend_limit"],
  ["organization_usage_limit_exceeded", "provider_limit"],
])

/**
 * OpenAI: `Authorization: Bearer`. The organization and project headers are
 * dropped: a key is already scoped to its own, and another key's would be
 * refused as a mismatch; a per-key value goes in the key's `headers`.
 *
 * Encrypted reasoning (`include: ["reasoning.encrypted_content"]` with
 * `store: false`) decrypts only in the organization that produced it; another
 * answers 400 `invalid_encrypted_content`. `portable` drops the `reasoning`
 * input items: the model continues from the visible turns and tool results,
 * which the API accepts without them.
 */
export const OPENAI: ProviderProfile = {
  name: "openai",
  authorize(headers, apiKey) {
    bearer(headers, apiKey)
    headers.delete("openai-organization")
    headers.delete("openai-project")
  },
  classify(status, body) {
    if (status === 401) return "auth"
    const error = errorOf(body)
    if (error === null) return null
    return OPENAI_CODES.get(error.code) ?? (error.type === "insufficient_quota" ? "credit" : null)
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

const ANTHROPIC_LOW_CREDIT = /credit balance is too low/i
const ANTHROPIC_CORS = /^CORS requests are not allowed/i
const ANTHROPIC_OWN_LIMIT = /reached your specified (workspace )?API usage limits/i

/**
 * Anthropic (https://platform.claude.com/docs/en/api/errors, …/rate-limits):
 * 402 `billing_error`; a 400 whose message names the credit balance, or a spend
 * limit the organization or workspace set; a 429 whose `details.error_code` is
 * `enforced_spend_limit_reached`, the monthly cap of the usage tier Anthropic
 * assigned. An organization on hold is a trust-and-safety decision and is
 * never a rejection to move for, whatever its status. A workspace limit of
 * Claude Code (a 429 with `retry-after`) is not told apart from a rate limit
 * and passes.
 *
 * The key rides the header the SDK chose: the Anthropic SDK sends
 * `Authorization: Bearer`, the AI SDK `x-api-key`; the API accepts both.
 */
export const ANTHROPIC: ProviderProfile = {
  name: "anthropic",
  authorize(headers, apiKey) {
    if (headers.has("authorization")) {
      bearer(headers, apiKey)
      headers.delete("x-api-key")
    } else {
      headers.set("x-api-key", apiKey)
    }
  },
  classify(status, body) {
    const error = errorOf(body)
    const detail = (error?.details as { error_code?: unknown } | null | undefined)?.error_code
    if (detail === "organization_on_hold") return null
    // A browser request the organization does not allow: the key is fine, and no other key is the fix.
    if (status === 401 && ANTHROPIC_CORS.test(String(error?.message))) return null
    if (status === 401) return "auth"
    if (status === 402 || error?.type === "billing_error") return "credit"
    if (status === 429 && detail === "enforced_spend_limit_reached") return "provider_limit"
    if (status === 400 && typeof error?.message === "string") {
      if (ANTHROPIC_LOW_CREDIT.test(error.message)) return "credit"
      if (ANTHROPIC_OWN_LIMIT.test(error.message)) return "spend_limit"
    }
    return null
  },
}

/**
 * Google's Gemini API (AI Studio keys). Since 2026-09-18 a depleted prepaid
 * balance answers 402, in both envelopes: `generateContent` keeps
 * `status: "RESOURCE_EXHAUSTED"` in the body, the Interactions API says
 * `code: "payment_required"`. A 429 is a rate or a daily quota, free tier
 * included, and always passes: quota is not credit.
 *
 * An invalid key is a 401 on the Interactions API and, on `generateContent`, a
 * 400 whose details carry the reason `API_KEY_INVALID`.
 *
 * The key rides `x-goog-api-key`, or `Authorization: Bearer` when the request
 * already carries one (the OpenAI-compatible endpoint). A key in the `?key=`
 * query string is outside what a profile can replace: send it as a header.
 */
export const GEMINI: ProviderProfile = {
  name: "gemini",
  authorize(headers, apiKey) {
    if (headers.has("authorization")) {
      bearer(headers, apiKey)
      headers.delete("x-goog-api-key")
    } else {
      headers.set("x-goog-api-key", apiKey)
    }
  },
  classify(status, body) {
    if (status === 402) return "credit"
    if (status === 401) return "auth"
    if (status !== 400) return null
    const details = errorOf(body)?.details
    return Array.isArray(details) &&
      details.some((d: unknown) => (d as { reason?: unknown } | null)?.reason === "API_KEY_INVALID")
      ? "auth"
      : null
  },
}

const OPENROUTER_BUDGETS: ReadonlySet<unknown> = new Set([
  "openrouter_guardrail_budget",
  "openrouter_workspace_budget",
  "openrouter_key_limit",
])

/**
 * OpenRouter (https://openrouter.ai/docs/api_reference/errors-and-debugging,
 * …/limits): 402 when the account or key has no credits left; 403 with
 * `error.metadata.limit_source` naming a budget the account set on a
 * guardrail, a workspace or a key. A 402 that carries `retry-after` (limit
 * source `openrouter_in_flight_budget`) is a reservation that frees itself: it
 * passes, like a rate limit. Every other 403 is moderation or permission.
 */
export const OPENROUTER: ProviderProfile = {
  name: "openrouter",
  authorize: bearer,
  classify(status, body, headers) {
    if (status === 401) return "auth"
    const source = errorOf(body)?.metadata?.limit_source
    if (status === 402) {
      return headers.has("retry-after") || source === "openrouter_in_flight_budget" ? null : "credit"
    }
    return status === 403 && OPENROUTER_BUDGETS.has(source) ? "spend_limit" : null
  },
}

/**
 * Groq (https://console.groq.com/docs/spend-limits): when the monthly spend
 * limit the organization set is reached, every key answers 400 with the code
 * `blocked_api_access`.
 */
export const GROQ: ProviderProfile = {
  name: "groq",
  authorize: bearer,
  classify(status, body) {
    if (status === 401) return "auth"
    return status === 400 && errorOf(body)?.code === "blocked_api_access" ? "spend_limit" : null
  },
}

/**
 * A provider that authenticates with `Authorization: Bearer`, answers 402
 * Payment Required when the account's balance cannot cover the request, and
 * 401 for a key it does not accept. Read the provider's error reference before
 * you use this for one that is not listed here.
 */
export function paymentRequired(name: string): ProviderProfile {
  return {
    name,
    authorize: bearer,
    classify: (status) => (status === 402 ? "credit" : status === 401 ? "auth" : null),
  }
}

/** DeepSeek: 402 Insufficient Balance (https://api-docs.deepseek.com/quick_start/error_codes/). */
export const DEEPSEEK = paymentRequired("deepseek")
/** Mistral: 402 Payment required (https://docs.mistral.ai/resources/error-glossary). */
export const MISTRAL = paymentRequired("mistral")
/** Together AI: 402 when the balance reaches its spend cut-off (https://docs.together.ai/docs/error-codes). */
export const TOGETHER = paymentRequired("together")
/** Fireworks AI: 402 when the account is not on a paid plan or is over its usage limits (https://docs.fireworks.ai/guides/inference-error-codes). */
export const FIREWORKS = paymentRequired("fireworks")
/** Cerebras: 402 PaymentRequired (https://inference-docs.cerebras.ai/support/error). */
export const CEREBRAS = paymentRequired("cerebras")
