/**
 * The README's provider tables, written from the evidence ledger so the
 * documentation cannot say what the tests do not prove.
 *
 *   node scripts/readme-tables.ts   rewrites the block between the markers
 */
import { readFileSync, writeFileSync } from "node:fs"
import { CONTRACTS, type Contract, type ProviderId } from "../spec/contracts.ts"

const PROVIDERS: readonly (readonly [ProviderId, string, string])[] = [
  ["openai", "OpenAI", "OPENAI"],
  ["anthropic", "Anthropic", "ANTHROPIC"],
  ["gemini", "Gemini API", "GEMINI"],
  ["openrouter", "OpenRouter", "OPENROUTER"],
  ["groq", "Groq", "GROQ"],
  ["deepseek", "DeepSeek", "DEEPSEEK"],
  ["mistral", "Mistral", "MISTRAL"],
  ["together", "Together AI", "TOGETHER"],
  ["fireworks", "Fireworks AI", "FIREWORKS"],
  ["cerebras", "Cerebras", "CEREBRAS"],
]

export const START = "<!-- contracts:start -->"
export const END = "<!-- contracts:end -->"

/** The field of the body that tells this answer from its neighbours. */
function discriminator({ body }: Contract): string {
  if (typeof body !== "object" || body === null) return ""
  const error = ("error" in body ? body.error : body) as Record<string, unknown>
  const details = error.details
  if (Array.isArray(details)) return `\`reason: ${(details[0] as { reason: string }).reason}\``
  if (typeof details === "object" && details !== null) {
    return `\`details.error_code: ${(details as { error_code: string }).error_code}\``
  }
  const metadata = error.metadata as { limit_source?: string } | undefined
  if (metadata?.limit_source) return `\`limit_source: ${metadata.limit_source}\``
  if (typeof error.code === "string") return `\`code: ${error.code}\``
  if (typeof error.status === "string") return `\`status: ${error.status}\``
  if (typeof error.type === "string" && error.type !== "invalid_request_error") {
    return `\`type: ${error.type}\``
  }
  return ""
}

function row(contract: Contract): string {
  const what = [contract.title, discriminator(contract)].filter(Boolean).join("<br>")
  const pool = contract.expect === null ? "stays" : `\`${contract.expect}\``
  return `| ${contract.status} | ${what} | ${pool} | [${contract.evidence}](${contract.source}) |`
}

export function tables(): string {
  return PROVIDERS.map(([id, name, profile]) => {
    const mine = CONTRACTS.filter((contract) => contract.provider === id)
    return [
      `<details${id === "openai" || id === "anthropic" ? " open" : ""}>`,
      `<summary><strong>${name}</strong> · <code>${profile}</code></summary>`,
      "",
      "| Status | Answer | Pool | Evidence |",
      "|---|---|---|---|",
      ...mine.map(row),
      "",
      "</details>",
    ].join("\n")
  }).join("\n\n")
}

/** `readme` with the block between the markers replaced by the current tables. */
export function withTables(readme: string): string {
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start === -1 || end === -1) throw new Error("README has no contracts markers")
  return `${readme.slice(0, start + START.length)}\n${tables()}\n${readme.slice(end)}`
}

if (import.meta.main) {
  const path = new URL("../README.md", import.meta.url)
  writeFileSync(path, withTables(readFileSync(path, "utf8")))
}
