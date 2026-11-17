# Contributing

Issues and pull requests are welcome.

```bash
pnpm install
pnpm check        # types, tests, build, site: must pass
pnpm site         # the site and its playground
```

- **A new provider, or a new rule for an existing one, starts in [`spec/contracts.ts`](spec/contracts.ts).** Add the answer with its status, the fields of the body your source establishes, and a link to the source: the provider's error reference, or a report where the exact response is shown. Add the look-alike answers that must not match. Then make `src/profiles.ts` classify them, and run `pnpm tables`.
- **The pool resends only on a refusal given before any work ran.** A change that makes it move a request for anything else (a rate limit, a 5xx, a timeout) will not be merged. If a provider's answer is ambiguous, it passes.
- **No runtime dependencies**, and nothing in `src` beyond `fetch`, `Request`, `Response` and `Headers`, except the CLI.
- A behaviour change comes with a test next to the module.
- No em dashes in copy or docs.
