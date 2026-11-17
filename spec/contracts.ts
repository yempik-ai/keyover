/**
 * The evidence ledger: every provider answer the profiles classify, and the
 * answers they must leave alone. One list feeds the tests
 * (`src/profiles.test.ts`), the README's tables and the site's error
 * reference, so a rule cannot be documented one way and coded another.
 *
 * `body` is a projection: the fields the source establishes, never a guessed
 * complete response. `documented` means the provider's own reference says so;
 * `reported` means it is seen in the field and absent from the reference.
 */
import type { RejectionReason } from "../src/pool.ts"

export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "groq"
  | "deepseek"
  | "mistral"
  | "together"
  | "fireworks"
  | "cerebras"

export interface Contract {
  readonly provider: ProviderId
  /** What happened, in the words a developer would search for. */
  readonly title: string
  readonly status: number
  readonly body: unknown
  readonly headers?: Readonly<Record<string, string>>
  /** What the profile answers: the reason the pool may move for, or null to pass. */
  readonly expect: RejectionReason | null
  readonly evidence: "documented" | "reported"
  readonly source: string
  /** Why it passes, or what to know about it. */
  readonly note?: string
}

const OPENAI_DOCS = "https://developers.openai.com/api/docs/guides/error-codes"
const ANTHROPIC_ERRORS = "https://platform.claude.com/docs/en/api/errors"
const ANTHROPIC_LIMITS = "https://platform.claude.com/docs/en/api/rate-limits"
const GEMINI_402 =
  "https://discuss.ai.google.dev/t/api-update-depleted-prepay-credits-now-return-http-402-instead-of-429/183654"
const GEMINI_ERRORS = "https://aistudio.google.com/docs/api-errors"
const OPENROUTER_ERRORS = "https://openrouter.ai/docs/api_reference/errors-and-debugging"
const OPENROUTER_LIMITS = "https://openrouter.ai/docs/api_reference/limits"
const GROQ_SPEND = "https://console.groq.com/docs/spend-limits"
const GROQ_ERRORS = "https://console.groq.com/docs/errors"

export const CONTRACTS: readonly Contract[] = [
  // --- OpenAI ---------------------------------------------------------------
  {
    provider: "openai",
    title: "Prepaid credit balance is depleted",
    status: 429,
    body: { error: { type: "insufficient_quota", code: "credit_balance_exhausted" } },
    expect: "credit",
    evidence: "documented",
    source: OPENAI_DOCS,
  },
  {
    provider: "openai",
    title: "You exceeded your current quota, please check your plan and billing details",
    status: 429,
    body: {
      error: {
        message:
          "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        param: null,
        code: "insufficient_quota",
      },
    },
    expect: "credit",
    evidence: "reported",
    source:
      "https://stackoverflow.com/questions/75898276/openai-api-error-429-you-exceeded-your-current-quota-please-check-your-plan-a",
    note: "The long-standing form. The reference now names the cause in error.code and keeps insufficient_quota as the broader error.type.",
  },
  {
    provider: "openai",
    title: "Organization reached the monthly spend limit it set",
    status: 429,
    body: { error: { type: "insufficient_quota", code: "organization_spend_limit_exceeded" } },
    expect: "spend_limit",
    evidence: "documented",
    source: OPENAI_DOCS,
  },
  {
    provider: "openai",
    title: "Project reached the monthly spend limit it set",
    status: 429,
    body: { error: { type: "insufficient_quota", code: "project_spend_limit_exceeded" } },
    expect: "spend_limit",
    evidence: "documented",
    source: OPENAI_DOCS,
  },
  {
    provider: "openai",
    title: "Billing hard limit has been reached",
    status: 400,
    body: {
      error: {
        code: "billing_hard_limit_reached",
        message: "Billing hard limit has been reached",
        param: null,
        type: "invalid_request_error",
      },
    },
    expect: "spend_limit",
    evidence: "reported",
    source: "https://community.openai.com/t/billing-hard-limit-reached-api-error/572481",
    note: "A legacy code, reported on image and batch endpoints. It is not in the current reference.",
  },
  {
    provider: "openai",
    title: "Organization reached the monthly usage limit OpenAI assigned",
    status: 429,
    body: { error: { type: "insufficient_quota", code: "organization_usage_limit_exceeded" } },
    expect: "provider_limit",
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "OpenAI assigns this limit. The pool does not move a request for it unless failoverOn includes provider_limit.",
  },
  {
    provider: "openai",
    title: "Incorrect API key provided",
    status: 401,
    body: {
      error: { type: "invalid_request_error", param: null, code: "invalid_api_key" },
    },
    expect: "auth",
    evidence: "reported",
    source: "https://community.openai.com/t/please-help-cant-get-python-quickstart-example-working-invalid-api-key/1127289",
    note: "The reference documents the 401 and its causes: a wrong, revoked or deleted key. The code is what the response carries.",
  },
  {
    provider: "openai",
    title: "IP not authorized",
    status: 401,
    body: { error: { message: "IP not authorized" } },
    expect: null,
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "The organization's own IP allowlist. An access restriction is never routed around.",
  },
  {
    provider: "openai",
    title: "You must be a member of an organization to use the API",
    status: 401,
    body: { error: { message: "You must be a member of an organization to use the API" } },
    expect: null,
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "A membership decision, not a key that is unknown.",
  },
  {
    provider: "openai",
    title: "A quota code this version does not know",
    status: 429,
    body: { error: { type: "insufficient_quota", code: "a_code_added_later" } },
    expect: null,
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "The reference says to read the code. A new one may be a cap, so it passes until it is listed.",
  },
  {
    provider: "openai",
    title: "Rate limit reached for requests",
    status: 429,
    body: { error: { message: "Rate limit reached for requests" } },
    expect: null,
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "A traffic control. Your SDK retries it.",
  },
  {
    provider: "openai",
    title: "Request rate increased too quickly",
    status: 429,
    body: { error: { type: "rate_limit_error", code: "slow_down" } },
    expect: null,
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "A traffic control. Your SDK retries it.",
  },
  {
    provider: "openai",
    title: "Country, region, or territory not supported",
    status: 403,
    body: null,
    expect: null,
    evidence: "documented",
    source: OPENAI_DOCS,
    note: "An access restriction. Never routed around.",
  },

  // --- Anthropic ------------------------------------------------------------
  {
    provider: "anthropic",
    title: "Your credit balance is too low to access the Anthropic API",
    status: 400,
    body: {
      type: "error",
      error: {
        type: "invalid_request_error",
        message:
          "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
      },
    },
    expect: "credit",
    evidence: "reported",
    source: "https://github.com/anthropics/claude-code/issues/36604",
    note: "A 400, not a 402: code that treats every 400 as a bad request leaves a working spare unused.",
  },
  {
    provider: "anthropic",
    title: "A billing_error type on a status the reference does not give it",
    status: 403,
    body: { type: "error", error: { type: "billing_error" } },
    expect: null,
    evidence: "documented",
    source: ANTHROPIC_ERRORS,
    note: "The reference pairs billing_error with 402 only.",
  },
  {
    provider: "anthropic",
    title: "An issue with your billing or payment information",
    status: 402,
    body: { type: "error", error: { type: "billing_error" } },
    expect: "credit",
    evidence: "documented",
    source: ANTHROPIC_ERRORS,
  },
  {
    provider: "anthropic",
    title: "You have reached your specified API usage limits",
    status: 400,
    body: {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "You have reached your specified API usage limits.",
      },
    },
    expect: "spend_limit",
    evidence: "documented",
    source: ANTHROPIC_LIMITS,
  },
  {
    provider: "anthropic",
    title: "You have reached your specified workspace API usage limits",
    status: 400,
    body: {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "You have reached your specified workspace API usage limits.",
      },
    },
    expect: "spend_limit",
    evidence: "documented",
    source: ANTHROPIC_LIMITS,
  },
  {
    provider: "anthropic",
    title: "Organization crossed its usage tier's monthly spend cap",
    status: 429,
    body: {
      type: "error",
      error: {
        type: "rate_limit_error",
        details: { error_code: "enforced_spend_limit_reached" },
      },
    },
    expect: "provider_limit",
    evidence: "documented",
    source: ANTHROPIC_LIMITS,
    note: "Anthropic assigns this cap. The pool does not move a request for it unless failoverOn includes provider_limit.",
  },
  {
    provider: "anthropic",
    title: "API key is malformed, revoked or expired",
    status: 401,
    body: { type: "error", error: { type: "authentication_error" } },
    expect: "auth",
    evidence: "documented",
    source: ANTHROPIC_ERRORS,
  },
  {
    provider: "anthropic",
    title: "CORS requests are not allowed for this Organization",
    status: 401,
    body: {
      type: "error",
      error: {
        type: "authentication_error",
        message: "CORS requests are not allowed for this Organization",
      },
    },
    expect: null,
    evidence: "documented",
    source: ANTHROPIC_ERRORS,
    note: "Not a problem with the key. Send the request from a server.",
  },
  {
    provider: "anthropic",
    title: "Organization is on hold",
    status: 400,
    body: {
      type: "error",
      error: { type: "invalid_request_error", details: { error_code: "organization_on_hold" } },
    },
    expect: null,
    evidence: "documented",
    source: "https://platform.claude.com/docs/zh-TW/api/ruby/%24shared",
    note: "A trust and safety decision. Never routed around.",
  },
  {
    provider: "anthropic",
    title: "Rate limit",
    status: 429,
    body: { type: "error", error: { type: "rate_limit_error" } },
    headers: { "retry-after": "12" },
    expect: null,
    evidence: "documented",
    source: ANTHROPIC_LIMITS,
    note: "A traffic control. Your SDK retries it. A Claude Code workspace limit looks the same and passes too.",
  },
  {
    provider: "anthropic",
    title: "Usage increased too quickly",
    status: 429,
    body: {
      type: "error",
      error: { type: "rate_limit_error", details: { error_code: "ramp_limit_exceeded" } },
    },
    expect: null,
    evidence: "documented",
    source: ANTHROPIC_LIMITS,
    note: "A traffic control. Your SDK retries it.",
  },
  {
    provider: "anthropic",
    title: "The API is temporarily overloaded",
    status: 529,
    body: { type: "error", error: { type: "overloaded_error" } },
    expect: null,
    evidence: "documented",
    source: ANTHROPIC_ERRORS,
    note: "It may have started work. A resend on another key could run it twice.",
  },

  // --- Gemini API -------------------------------------------------------------
  {
    provider: "gemini",
    title: "Your prepayment credits are depleted",
    status: 402,
    body: {
      error: {
        code: 402,
        message: "Your prepayment credits are depleted.",
        status: "RESOURCE_EXHAUSTED",
      },
    },
    expect: "credit",
    evidence: "documented",
    source: GEMINI_402,
    note: "Since 2026-09-18. Before that date the same failure was a 429.",
  },
  {
    provider: "gemini",
    title: "Prepay credit balance is depleted (Interactions API)",
    status: 402,
    body: { error: { code: "payment_required" } },
    expect: "credit",
    evidence: "documented",
    source: GEMINI_ERRORS,
  },
  {
    provider: "gemini",
    title: "API key not valid. Please pass a valid API key",
    status: 400,
    body: {
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }],
      },
    },
    expect: "auth",
    evidence: "reported",
    source: "https://discuss.ai.google.dev/t/invalidargument-400-api-key-not-valid-stuck-with-this-error/40782",
    note: "The generateContent form. Only the API_KEY_INVALID reason matches, never a plain 400.",
  },
  {
    provider: "gemini",
    title: "API key is missing, invalid or expired (Interactions API)",
    status: 401,
    body: { error: { code: "authentication" } },
    expect: "auth",
    evidence: "documented",
    source: GEMINI_ERRORS,
  },
  {
    provider: "gemini",
    title: "You have exceeded your daily quota",
    status: 429,
    body: { error: { code: "quota_exceeded" } },
    expect: null,
    evidence: "documented",
    source: GEMINI_ERRORS,
    note: "A quota, free tier included, is not credit. The pool never moves a request for it.",
  },
  {
    provider: "gemini",
    title: "Billing is not enabled for the project",
    status: 400,
    body: { error: { code: "failed_precondition" } },
    expect: null,
    evidence: "documented",
    source: GEMINI_ERRORS,
    note: "A setup problem. Enable billing on the project.",
  },
  {
    provider: "gemini",
    title: "Key lacks permission, or the project is restricted",
    status: 403,
    body: { error: { code: "permission_denied" } },
    expect: null,
    evidence: "documented",
    source: GEMINI_ERRORS,
    note: "An access restriction. Never routed around.",
  },

  // --- OpenRouter -------------------------------------------------------------
  {
    provider: "openrouter",
    title: "Your account or API key has insufficient credits",
    status: 402,
    body: { error: { code: 402, metadata: { limit_source: "openrouter_credits" } } },
    expect: "credit",
    evidence: "documented",
    source: OPENROUTER_ERRORS,
  },
  {
    provider: "openrouter",
    title: "This request's estimated cost is larger than the whole in-flight budget",
    status: 402,
    body: {
      error: {
        code: 402,
        metadata: { limit_source: "openrouter_credits", reason: "weight_exceeds_budget" },
      },
    },
    expect: null,
    evidence: "documented",
    source: OPENROUTER_LIMITS,
    note: "The in-flight budget has a ceiling OpenRouter sets. Lower max_tokens or the prompt size.",
  },
  {
    provider: "openrouter",
    title: "Key reached the limit set on it",
    status: 403,
    body: { error: { code: 403, metadata: { limit_source: "openrouter_key_limit" } } },
    expect: "spend_limit",
    evidence: "documented",
    source: OPENROUTER_LIMITS,
  },
  {
    provider: "openrouter",
    title: "Workspace budget reached",
    status: 403,
    body: { error: { code: 403, metadata: { limit_source: "openrouter_workspace_budget" } } },
    expect: "spend_limit",
    evidence: "documented",
    source: OPENROUTER_LIMITS,
  },
  {
    provider: "openrouter",
    title: "Invalid or disabled API key",
    status: 401,
    body: { error: { code: 401 } },
    expect: "auth",
    evidence: "documented",
    source: OPENROUTER_ERRORS,
  },
  {
    provider: "openrouter",
    title: "In-flight budget reserved by other requests",
    status: 402,
    body: {
      error: {
        code: 402,
        metadata: { limit_source: "openrouter_in_flight_budget", reason: "in_flight_budget_exhausted" },
      },
    },
    headers: { "retry-after": "2" },
    expect: null,
    evidence: "documented",
    source: OPENROUTER_LIMITS,
    note: "A reservation that frees itself. It carries retry-after, and your SDK waits.",
  },
  {
    provider: "openrouter",
    title: "Moderation flag or guardrail block",
    status: 403,
    body: { error: { code: 403 } },
    expect: null,
    evidence: "documented",
    source: OPENROUTER_ERRORS,
    note: "A policy decision. Never routed around.",
  },

  // --- Groq -------------------------------------------------------------------
  {
    provider: "groq",
    title: "Organization reached the monthly spend limit it set",
    status: 400,
    body: { error: { code: "blocked_api_access" } },
    expect: "spend_limit",
    evidence: "documented",
    source: GROQ_SPEND,
  },
  {
    provider: "groq",
    title: "Invalid API key",
    status: 401,
    body: null,
    expect: "auth",
    evidence: "documented",
    source: GROQ_ERRORS,
  },
  {
    provider: "groq",
    title: "Flex tier capacity exceeded",
    status: 498,
    body: null,
    expect: null,
    evidence: "documented",
    source: GROQ_ERRORS,
    note: "A capacity decision, not a billing one.",
  },

  // --- 402 Payment Required ---------------------------------------------------
  {
    provider: "deepseek",
    title: "Insufficient Balance",
    status: 402,
    body: null,
    expect: "credit",
    evidence: "documented",
    source: "https://api-docs.deepseek.com/quick_start/error_codes/",
  },
  {
    provider: "deepseek",
    title: "Authentication fails: wrong API key",
    status: 401,
    body: null,
    expect: "auth",
    evidence: "documented",
    source: "https://api-docs.deepseek.com/quick_start/error_codes/",
  },
  {
    provider: "mistral",
    title: "Payment required",
    status: 402,
    body: null,
    expect: "credit",
    evidence: "documented",
    source: "https://docs.mistral.ai/resources/error-glossary",
  },
  {
    provider: "together",
    title: "Organization's balance reached its spend cut-off",
    status: 402,
    body: null,
    expect: "credit",
    evidence: "documented",
    source: "https://docs.together.ai/docs/error-codes",
  },
  {
    provider: "fireworks",
    title: "Account is not on a paid plan or has exceeded usage limits",
    status: 402,
    body: null,
    expect: "credit",
    evidence: "documented",
    source: "https://docs.fireworks.ai/guides/inference-error-codes",
  },
  {
    provider: "fireworks",
    title: "Invalid API key or insufficient permissions",
    status: 401,
    body: null,
    expect: null,
    evidence: "documented",
    source: "https://docs.fireworks.ai/guides/inference-error-codes",
    note: "One status for a bad key and for missing permissions. It passes.",
  },
  {
    provider: "fireworks",
    title: "Account is suspended",
    status: 412,
    body: null,
    expect: null,
    evidence: "documented",
    source: "https://docs.fireworks.ai/guides/inference-error-codes",
    note: "A suspension, or a model that failed to load. Never routed around.",
  },
  {
    provider: "cerebras",
    title: "Payment required: no active subscription or balance",
    status: 402,
    body: null,
    expect: "credit",
    evidence: "documented",
    source: "https://inference-docs.cerebras.ai/support/error",
  },
  {
    provider: "deepseek",
    title: "Rate limit reached",
    status: 429,
    body: null,
    expect: null,
    evidence: "documented",
    source: "https://api-docs.deepseek.com/quick_start/error_codes/",
    note: "A traffic control. Your SDK retries it.",
  },
  {
    provider: "mistral",
    title: "Too many requests",
    status: 429,
    body: null,
    expect: null,
    evidence: "documented",
    source: "https://docs.mistral.ai/resources/error-glossary",
    note: "A traffic control. Your SDK retries it.",
  },
  {
    provider: "together",
    title: "Account cannot access the requested model or feature",
    status: 403,
    body: null,
    expect: null,
    evidence: "documented",
    source: "https://docs.together.ai/docs/error-codes",
    note: "An access restriction, account blocks included. Never routed around.",
  },
  {
    provider: "cerebras",
    title: "Too many requests",
    status: 429,
    body: null,
    expect: null,
    evidence: "documented",
    source: "https://inference-docs.cerebras.ai/support/error",
    note: "A traffic control. Your SDK retries it.",
  },
]
