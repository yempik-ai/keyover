# Working in keyover

keyover is two things in one repository: a small library that fails API keys over between billing organizations (`src`) and the site that demonstrates it (`site`). Read the [README](README.md) for what it does.

## Commands

```bash
pnpm test         # the library's tests
pnpm typecheck
pnpm build        # dist/, what gets published
pnpm tables       # rewrite the README's provider tables from spec/contracts.ts
pnpm site         # the site, with the playground, on localhost:3000
pnpm check        # types, tests, build, site: the definition of done
```

## Rules

- **The safety contract is the product.** A profile returns a reason only for an answer its provider gives before running the request. Read "What moves a request, and what does not" in the README before touching `src/pool.ts` or `src/profiles.ts`. Never make the pool resend on a rate limit, a 5xx, a timeout or a started stream.
- **Evidence before code.** A classification rule starts as an entry in `spec/contracts.ts` with its source: the provider's reference (`documented`) or a field report (`reported`). `body` holds only the fields that source establishes. Add the answers that must not match too. The tests, the README tables and the site's error pages are all generated from that file.
- **No dependencies.** `src` imports nothing from npm. The pool uses `fetch`, `Request`, `Response` and `Headers` only, so it runs on Node, Bun, Deno and edge runtimes. `src/check.ts` and `src/cli.ts` may use `node:` modules; nothing else in `src` may.
- **Two runtimes read the source.** `src` is compiled by `tsc` and also bundled by the site. Import with the `.ts` extension and use only erasable TypeScript syntax (no enums, no parameter properties).
- **Keys never leave the pool.** Events, status and the CLI carry key names. Nothing logs, prints or returns key material, and an error path must not either: a transport error can quote a header.
- **The site runs the real library.** `site/src/components/play` builds a pool with `createKeyPool` and `fakeProvider`. It must not imitate the pool's behaviour in its own code.
- **Copy lives in `site/src/content`.** The examples on the site are the files in `examples/`, which are typechecked against the real SDKs.
- **No em dashes** in copy or docs.
- **Tests sit next to the module.** A behaviour change comes with a test. `src/sdk.test.ts` and `src/testing.test.ts` go through the real OpenAI SDK, Anthropic SDK and AI SDK: keep them that way.
- **The site is static.** `NEXT_OUTPUT=export` must keep building (GitHub Pages).
