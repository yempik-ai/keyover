# Adding keyover to a project

This guide is written for a coding agent. Follow it from start to finish in the repository that should get API key failover. Read the [README](README.md) first: it defines the behaviour you are installing.

keyover holds several API keys for one AI provider, in priority order, behind one `fetch`. When the provider refuses a request because the key's billing organization is out of credit, over a spend limit it set, or the key is not accepted, the same request is sent again on the next key. Nothing else moves: a rate limit, a 5xx, a bad request and a safety decision all return to the SDK untouched.

## 0. Before you start

Find these facts in the target repository. Do not guess them.

| Fact | Where to look |
|---|---|
| Which providers the project calls | `package.json`: `openai`, `@anthropic-ai/sdk`, `ai` with `@ai-sdk/*` |
| Every place a client is constructed | Search for `new OpenAI(`, `new Anthropic(`, `createOpenAI(`, `createAnthropic(` and the other `create*` providers |
| How configuration is read | A validated env module (Zod, ArkType, t3-env), or bare `process.env` |
| The names of the existing key variables | `.env.example`, the env schema, the deploy configuration |
| The logger or alerting the project uses | Imports in the files that construct clients |
| The check command | What CI runs: types, tests, lint, build |

Requirements: a runtime with `fetch` (Node.js 20 or newer, Bun, Deno), ESM imports, and an SDK that accepts a custom `fetch`.

Stop and ask the user if any of these is true:

- The project calls the provider through a gateway (LiteLLM, Portkey, OpenRouter with a single key, Vercel AI Gateway). The gateway owns key selection: say so, and do not add a second layer unless the user wants one.
- The second key the user has in mind belongs to an account they do not control, or is a free-tier key meant to multiply a quota. keyover is for billing resilience between funded organizations the user is authorized to use.
- A client is constructed in browser code. Keys and the pool stay on the server.

## 1. Install

Use the project's package manager.

```bash
pnpm add keyover
```

## 2. Add the second key to the configuration

Keep the existing variable as the first key, so nothing changes for an environment that has only one. Add one variable per extra organization, named after the existing one:

```bash
OPENAI_API_KEY=...          # exists today: serves first
OPENAI_API_KEY_SPARE=...    # new: another billing organization
```

If the project validates its environment, add the new variable to the schema as optional. Add it to `.env.example` with a comment that says it bills another organization. Never write a key value into a file that is committed, a test fixture or a log.

## 3. Create one pool per provider

Create the pool once per process, in the module that already owns the client, and export the client as before. A pool recreated per request forgets which key was rejected.

```ts
import OpenAI from "openai"
import { createKeyPool, OPENAI } from "keyover"

const pool = createKeyPool({
  provider: OPENAI,
  keys: {
    primary: env.OPENAI_API_KEY,
    spare: env.OPENAI_API_KEY_SPARE,
  },
})

export const openai = new OpenAI({ ...existingOptions, ...pool.clientOptions })
```

- `keys` is in priority order. A key that is `undefined` is left out, so the pool works with one key.
- `pool.clientOptions` is `{ apiKey, fetch }`. Put it last so it replaces any `apiKey` the options already carry.
- The names (`primary`, `spare`) appear in events and logs. Name them after the organization when the project has names for them.
- For the Anthropic SDK and the AI SDK providers the shape is the same: `new Anthropic(pool.clientOptions)`, `createOpenAI(pool.clientOptions)`, `createAnthropic(pool.clientOptions)`.
- The profiles are `OPENAI`, `ANTHROPIC`, `GEMINI`, `OPENROUTER`, `GROQ`, `DEEPSEEK`, `MISTRAL`, `TOGETHER`, `FIREWORKS` and `CEREBRAS`. Use the profile of the provider that answers the request, not of the SDK that sends it: a DeepSeek endpoint called through the OpenAI SDK takes `DEEPSEEK`.

If the project already passes its own `fetch` to the client (for tracing, a proxy, a test double), give that function to the pool instead of dropping it: `createKeyPool({ ..., fetch: existingFetch })`.

Replace every client construction you found in step 0. A client left on a bare key does not fail over.

## 4. Report the events

Wire `onEvent` to the project's logger. The first rejection of a key is the one a person must see: that organization needs a top-up.

```ts
onEvent(event) {
  switch (event.type) {
    case "key_rejected":
      if (event.consecutive === 1) logger.error(event, "ai key rejected, requests move to the next key")
      else logger.warn(event, "ai key still rejected")
      return
    case "all_keys_rejected":
      logger.error(event, "every ai key rejected the request")
      return
    case "failover":
    case "key_restored":
    case "request_made_portable":
      logger.info(event, `ai key pool: ${event.type}`)
      return
  }
}
```

Events carry key names, never key material. Do not add the key to the log line yourself.

## 5. Check the requests can move

A request can only continue in another organization if it carries its own state. Search the project for these and report each one you find to the user. Do not rewrite them without asking.

| In the code | What it means |
|---|---|
| `previous_response_id`, `conversation`, `store: true` relied on later | The history lives in one OpenAI organization. After a failover the next turn cannot find it. |
| File ids, vector stores, containers, fine-tuned model ids, batches | The resource exists in one organization only. |
| A model the second organization has not been granted | A 404 that no failover moves. |

Requests that send their full history, including ones that pass `reasoning.encrypted_content` back, are fine: the `OPENAI` profile repairs the one rejection that case produces.

## 6. Prove it

1. Run the project's check command. Types and tests must pass.
2. Add one test of the project's own client module with the simulated provider, if the project has tests for that module:

   ```ts
   import { fakeProvider } from "keyover/testing"

   const provider = fakeProvider({
     flavor: "openai",
     orgs: { primary: { apiKey: "k1", credit: 0 }, spare: { apiKey: "k2" } },
   })
   // Build the pool with `fetch: provider.fetch`, make one call through the
   // project's client, and expect a normal answer and `provider.calls` to show
   // the primary rejected and the spare serving.
   ```

3. Tell the user to run the drill with real keys. It costs a few one-token requests, so do not run it yourself without being asked:

   ```bash
   npx keyover check
   ```

## 7. Report

Tell the user, in this order:

1. Which clients now run through a pool, and which you left alone and why.
2. The variables they must set, and where (`.env`, the deploy's secret store).
3. Anything from step 5 that will not survive a failover.
4. The checklist in the README, [Before you add a second organization](README.md#before-you-add-a-second-organization): model access, data controls and DPA, a spend limit in each organization, who receives the alert.

## Porting to another language

The behaviour to reproduce, for an HTTP transport in any language. The reference is [`src/pool.ts`](src/pool.ts); the provider rules and their evidence are [`spec/contracts.ts`](spec/contracts.ts), and a port passes when it classifies every entry of that ledger the same way.

1. Keep an ordered, nonempty list of keys with unique names and optional per-key headers. Per key, hold in memory: the count of consecutive rejections, the last reason, the time it may be probed again, and whether a probe is in flight.
2. Pass a request that is not HTTP straight to the transport underneath.
3. Make the request replayable: buffer a one-shot body once, and keep the caller's cancellation signal.
4. Decide the attempt order once per request: keys that are ready, in priority order, then keys that are cooling or being probed, soonest retry first.
5. Before each key, honour cancellation. A key whose cooldown is over and that has rejections on record is probed by this request alone: claim it, and release the claim only when its verdict is recorded, also when the attempt throws.
6. Copy the headers, set the key the way the provider's profile says, then apply the key's own headers.
7. Send. A 2xx clears the key's rejections (emit `key_restored` if it had any) and returns.
8. Ask the profile to classify only a 400, 401, 402, 403 or 429, from a copy of the body. No reason, or a reason the pool is not configured to move for (by default `provider_limit`), returns the response untouched and changes no key's health.
9. For a rejection: count it, set the retry time to now plus `min(max, initial × 2^(count − 1))`, emit `key_rejected`. If a key remains, discard the response, emit `failover` and continue. Otherwise emit `all_keys_rejected` and return the last response with `x-should-retry: false`.
10. If a profile can repair a request another organization refused for its state (OpenAI `invalid_encrypted_content`), rewrite the body, emit `request_made_portable` and resend once on the same key.
11. Never resend on a transport error, a timeout, a 5xx or a response that has started streaming.
