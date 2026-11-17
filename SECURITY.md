# Security

keyover sits between your SDK and your provider and holds your API keys in memory. It puts a key only on the request your SDK made, and it never logs, prints or returns key material: events, `status()` and the `check` command carry the names you gave the keys, and a key quoted in a transport error is removed from it.

Redirects are left to the transport, exactly as without the pool. `fetch` drops `Authorization` when a redirect leaves the origin, but not a header such as `x-api-key`. If your base URL can redirect, pass `redirect: "error"` in your SDK's fetch options.

## Reporting a problem

Please report privately, through a [security advisory](https://github.com/yempik-ai/keyover/security/advisories/new) on this repository, if you find a way to make keyover:

- put a key on a request your SDK did not make;
- put key material in an event, a status, a thrown error, or the output of `check`;
- resend a request on a response that is not a billing or key rejection, so that it could run twice;
- move a request for a rate limit, a safety hold or an access restriction.

Please do not open a public issue for it. You will get an answer within a few days.

## What is in scope

- The pool (`src/pool.ts`) and the provider profiles (`src/profiles.ts`).
- The `check` command (`src/check.ts`, `src/cli.ts`).
- The simulated provider (`src/testing.ts`), where it answers differently from the real one in a way that hides a failure.

## What is not

Which organizations you put in a pool, and whether your agreement with a provider allows you to serve from one when another reaches a limit, is yours to decide. See [Before you add a second organization](README.md#before-you-add-a-second-organization).
