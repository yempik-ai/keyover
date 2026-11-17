# Changelog

## 0.1.1

Fixes from an independent audit of 0.1.0.

- A 401 moves a request only when it names a key the provider does not know. OpenAI's 401 for an IP outside the allowlist or a removed member passes, and so does Fireworks' 401, which also means missing permissions.
- A quota code the OpenAI profile does not know passes, and Anthropic's `billing_error` moves only on the 402 the reference gives it.
- OpenRouter: a 402 for one request above the in-flight budget passes; a key limit moves on 402 as well as 403.
- A key quoted in a transport error is removed from it. A key with a character no header can carry is refused at startup, by name, and surrounding whitespace is trimmed.
- A response body is read only for the statuses a profile is asked about, so a 5xx returns at once.
- A `Request` is resent with the options it came with (credentials, cache, integrity, referrer policy).
- The final rejection keeps the address it came from, and the cooldown stays a number however long a key keeps rejecting.

## 0.1.0

The first release.

- `createKeyPool`: several keys for one provider, in priority order, behind one `fetch`. A request moves to the next key only on a billing or key rejection.
- Profiles for OpenAI, Anthropic, the Gemini API, OpenRouter, Groq, DeepSeek, Mistral, Together AI, Fireworks AI and Cerebras, each backed by the evidence ledger in `spec/contracts.ts`.
- Rejection reasons `credit`, `spend_limit`, `provider_limit` and `auth`. A cap the provider assigned is not moved for unless `failoverOn` says so.
- Key health in memory: exponential cooldown, a single probe, restore on the first 2xx. A cooling key is tried last, never refused locally.
- OpenAI encrypted reasoning from another organization is dropped and the request resent once.
- `keyover check`: one paid request per key and a failover drill.
- `keyover/testing`: a provider in memory, with the real providers' rejections.
