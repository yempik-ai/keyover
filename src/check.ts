/**
 * `check`: prove, with the real provider, that each key serves and that
 * failover works, before the night it has to.
 *
 * For each provider with keys in the environment:
 *
 * 1. Each key alone answers one minimal paid request. Nothing cheaper proves
 *    credit: a model lookup succeeds on an empty balance.
 * 2. A drill: a pool whose first key is deliberately invalid must still
 *    answer, from the next key, through the same transport your app uses.
 *
 * Keys are named by their environment variable, in the order given. The
 * command prints names and outcomes, never key material, and exits 1 when a
 * key does not serve or a drill fails.
 */
import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { parseArgs } from "node:util"
import {
  ANTHROPIC,
  createKeyPool,
  type KeyEvent,
  OPENAI,
  POOLED_API_KEY,
  type ProviderProfile,
  type RejectionReason,
} from "./index.ts"

interface Target {
  readonly profile: ProviderProfile
  /** Environment variables that hold this provider's keys start with this. */
  readonly prefix: string
  readonly model: string
  /** The smallest request the provider bills, for `model`. */
  readonly probe: (model: string) => {
    readonly url: string
    readonly headers: Record<string, string>
    readonly body: unknown
  }
}

const TARGETS: readonly Target[] = [
  {
    profile: OPENAI,
    prefix: "OPENAI_API_KEY",
    model: "gpt-6-luna",
    probe: (model) => ({
      url: "https://api.openai.com/v1/responses",
      headers: { authorization: `Bearer ${POOLED_API_KEY}` },
      body: { model, input: "ok", max_output_tokens: 16, store: false },
    }),
  },
  {
    profile: ANTHROPIC,
    prefix: "ANTHROPIC_API_KEY",
    model: "claude-haiku-5-5",
    probe: (model) => ({
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": POOLED_API_KEY, "anthropic-version": "2023-06-01" },
      body: { model, max_tokens: 1, messages: [{ role: "user", content: "ok" }] },
    }),
  },
]

export const USAGE = `Usage: keyover check [ENV_VAR...] [--model provider=model] [--env-file path]

Proves that each API key serves and that failover works, with real requests.

  ENV_VAR      Names of the environment variables that hold the keys, in the
               priority order your pool uses. The provider is read from the
               name (OPENAI_API_KEY..., ANTHROPIC_API_KEY...). With none, every
               such variable in the environment is checked, plain name first.
  --model      The model to probe, per provider: --model openai=gpt-6-luna
  --env-file   A dotenv file to load first. Default: .env when it exists.

Costs one minimal request per key and one per provider. Prints the names of
the variables, never their values.`

interface Outcome {
  readonly status: number
  readonly events: readonly KeyEvent[]
}

async function probe(
  target: Target,
  model: string,
  keys: Readonly<Record<string, string>>,
  fetch: typeof globalThis.fetch | undefined,
): Promise<Outcome> {
  const events: KeyEvent[] = []
  const pool = createKeyPool({
    provider: target.profile,
    keys,
    failoverOn: ["credit", "spend_limit", "provider_limit", "auth"],
    ...(fetch ? { fetch } : {}),
    onEvent: (event) => events.push(event),
  })
  const request = target.probe(model)
  const response = await pool.fetch(request.url, {
    method: "POST",
    headers: { ...request.headers, "content-type": "application/json" },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(30_000),
  })
  await response.body?.cancel()
  return { status: response.status, events }
}

const REASON: Record<RejectionReason, string> = {
  credit: "out of credit",
  spend_limit: "over the spend limit you set",
  provider_limit: "over the limit the provider assigned",
  auth: "key not accepted",
}

function verdict({ status, events }: Outcome): string {
  if (status >= 200 && status < 300) return "serving"
  const rejected = events.find((event) => event.type === "key_rejected")
  if (rejected?.type === "key_rejected") {
    return `rejected: ${REASON[rejected.reason]} (${status})`
  }
  return `failed (${status}): not a billing or key rejection, so no failover would move it`
}

/** The variables to check for a provider: the ones named, or every one in the environment. */
function variablesOf(target: Target, named: readonly string[], env: Env): string[] {
  const mine = (name: string) => name.startsWith(target.prefix)
  if (named.length > 0) return named.filter(mine)
  return Object.keys(env)
    .filter((name) => mine(name) && env[name])
    .sort((a, b) => Number(b === target.prefix) - Number(a === target.prefix) || a.localeCompare(b))
}

type Env = Readonly<Record<string, string | undefined>>

/** What `check` reads and writes; the defaults are the process's own. */
export interface CheckIo {
  readonly env?: Env
  readonly fetch?: typeof globalThis.fetch
  readonly print?: (line: string) => void
  readonly printError?: (line: string) => void
}

/** Run `check` with the given arguments; resolves to the exit code. */
export async function check(argv: readonly string[], io: CheckIo = {}): Promise<number> {
  const print = io.print ?? console.log
  const printError = io.printError ?? console.error
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      model: { type: "string", multiple: true },
      "env-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  })
  if (values.help) {
    print(USAGE)
    return 0
  }
  if (io.env === undefined) {
    const envFile = values["env-file"] ?? (existsSync(".env") ? ".env" : undefined)
    if (envFile !== undefined) loadEnvFile(envFile)
  }
  const env = io.env ?? process.env

  const models = new Map((values.model ?? []).map((pair) => pair.split("=", 2) as [string, string]))
  const unknown = positionals.filter((name) => !TARGETS.some((t) => name.startsWith(t.prefix)))
  if (unknown.length > 0) {
    printError(`Cannot tell the provider of: ${unknown.join(", ")}\n\n${USAGE}`)
    return 2
  }

  let failed = false
  let checked = 0
  for (const target of TARGETS) {
    const names = variablesOf(target, positionals, env)
    if (names.length === 0) continue
    const model = models.get(target.profile.name) ?? target.model
    const keys: Record<string, string> = {}
    for (const name of names) {
      const value = env[name]
      if (!value) {
        print(`${target.profile.name}  ${name}  not set`)
        failed = true
        continue
      }
      keys[name] = value
      checked += 1
      const result = verdict(await probe(target, model, { [name]: value }, io.fetch))
      print(`${target.profile.name}  ${name}  ${result}`)
      if (result !== "serving") failed = true
    }
    if (Object.keys(keys).length === 0) continue
    const drill = await probe(
      target,
      model,
      { "drill (invalid key)": "invalid-drill-key", ...keys },
      io.fetch,
    )
    const path = drill.events.flatMap((event) =>
      event.type === "failover" ? [`${event.from} -> ${event.to}`] : [],
    )
    const served = drill.status >= 200 && drill.status < 300 && path.length > 0
    print(
      `${target.profile.name}  drill  ${served ? `failover served: ${path.join(", ")}` : `failed (${drill.status})`}`,
    )
    if (!served) failed = true
    if (Object.keys(keys).length === 1) {
      print(`${target.profile.name}  note   one key only: there is nothing to fail over to`)
    }
  }
  if (checked === 0) {
    printError(`No API key found in the environment.\n\n${USAGE}`)
    return 2
  }
  return failed ? 1 : 0
}

