# Changelog

## 0.1.0

The first release.

- `createKeyPool`: several keys for one provider, in priority order, behind one `fetch`. A request moves to the next key only on a billing or key rejection.
- Profiles for OpenAI, Anthropic, the Gemini API, OpenRouter, Groq, DeepSeek, Mistral, Together AI, Fireworks AI and Cerebras, each backed by the evidence ledger in `spec/contracts.ts`.
- Rejection reasons `credit`, `spend_limit`, `provider_limit` and `auth`. A cap the provider assigned is not moved for unless `failoverOn` says so.
- Key health in memory: exponential cooldown, a single probe, restore on the first 2xx. A cooling key is tried last, never refused locally.
- OpenAI encrypted reasoning from another organization is dropped and the request resent once.
- `keyover check`: one paid request per key and a failover drill.
- `keyover/testing`: a provider in memory, with the real providers' rejections.
