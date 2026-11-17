# Security

keyover sits between your SDK and your provider and holds your API keys in memory. It sends a key only to the URL your SDK asked for, and it never logs, prints or returns key material: events, `status()` and the `check` command carry the names you gave the keys.

## Reporting a problem

Please report privately, through a [security advisory](https://github.com/yempik-ai/keyover/security/advisories/new) on this repository, if you find a way to make keyover:

- send a key to a host other than the one the request addressed;
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
