import type { ProviderId } from "@spec/contracts";

/** The providers with a profile, in the order the site lists them. */
export interface Provider {
  readonly id: ProviderId;
  readonly name: string;
  /** The profile's export name. */
  readonly profile: string;
  readonly keyEnv: string;
  /** The OpenAI-compatible endpoint, for providers used through the OpenAI SDK. */
  readonly baseURL?: string;
  readonly blurb: string;
  /** The message people paste into a search box, for the two providers set large. */
  readonly sample?: string;
}

export const providers: readonly Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    profile: "OPENAI",
    keyEnv: "OPENAI_API_KEY",
    blurb: "429 insufficient_quota, credit_balance_exhausted and the spend limit codes.",
    sample: "You exceeded your current quota, please check your plan and billing details.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    profile: "ANTHROPIC",
    keyEnv: "ANTHROPIC_API_KEY",
    blurb: "The 400 that says your credit balance is too low, 402 billing_error and spend limits.",
    sample: "Your credit balance is too low to access the Anthropic API.",
  },
  {
    id: "gemini",
    name: "Gemini API",
    profile: "GEMINI",
    keyEnv: "GEMINI_API_KEY",
    blurb: "402 for depleted prepay credits. A 429 quota never moves.",
  },
  {
    id: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    name: "OpenRouter",
    profile: "OPENROUTER",
    keyEnv: "OPENROUTER_API_KEY",
    blurb: "402 insufficient credits and the 403 budget limits, told apart from moderation.",
  },
  {
    id: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    name: "Groq",
    profile: "GROQ",
    keyEnv: "GROQ_API_KEY",
    blurb: "400 blocked_api_access when the spend limit is reached.",
  },
  {
    id: "deepseek",
    baseURL: "https://api.deepseek.com",
    name: "DeepSeek",
    profile: "DEEPSEEK",
    keyEnv: "DEEPSEEK_API_KEY",
    blurb: "402 Insufficient Balance.",
  },
  {
    id: "mistral",
    baseURL: "https://api.mistral.ai/v1",
    name: "Mistral",
    profile: "MISTRAL",
    keyEnv: "MISTRAL_API_KEY",
    blurb: "402 Payment required.",
  },
  {
    id: "together",
    baseURL: "https://api.together.xyz/v1",
    name: "Together AI",
    profile: "TOGETHER",
    keyEnv: "TOGETHER_API_KEY",
    blurb: "402 when the balance reaches its spend cut-off.",
  },
  {
    id: "fireworks",
    baseURL: "https://api.fireworks.ai/inference/v1",
    name: "Fireworks AI",
    profile: "FIREWORKS",
    keyEnv: "FIREWORKS_API_KEY",
    blurb: "402 for an unpaid plan or exceeded usage limits.",
  },
  {
    id: "cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    name: "Cerebras",
    profile: "CEREBRAS",
    keyEnv: "CEREBRAS_API_KEY",
    blurb: "402 PaymentRequired.",
  },
];

export function providerOf(id: string) {
  return providers.find((provider) => provider.id === id);
}

/** What the pool does with a rejection, in the reader's words. */
export const verdicts = {
  credit: "Moves to the next key: out of credit",
  spend_limit: "Moves to the next key: your own spend limit",
  auth: "Moves to the next key: key not accepted",
  provider_limit: "Stays by default: a cap the provider assigned",
  pass: "Stays with your SDK",
} as const;
