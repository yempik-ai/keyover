import { describe, expect, it } from "vitest"
import { check } from "./check.ts"
import { fakeProvider } from "./testing.ts"

function run(credit: { primary: number; spare: number }) {
  const provider = fakeProvider({
    flavor: "openai",
    orgs: {
      primary: { apiKey: "sk-live-primary", credit: credit.primary },
      spare: { apiKey: "sk-live-spare", credit: credit.spare },
    },
  })
  const lines: string[] = []
  const env = { OPENAI_API_KEY: "sk-live-primary", OPENAI_API_KEY_SPARE: "sk-live-spare", PATH: "/bin" }
  const code = check([], { env, fetch: provider.fetch, print: (l) => lines.push(l), printError: (l) => lines.push(l) })
  return { code, lines, provider }
}

describe("check", () => {
  it("passes when every key serves and the drill fails over, naming variables and never keys", async () => {
    const { code, lines } = run({ primary: 9, spare: 9 })

    expect(await code).toBe(0)
    expect(lines).toEqual([
      "openai  OPENAI_API_KEY  serving",
      "openai  OPENAI_API_KEY_SPARE  serving",
      "openai  drill  failover served: drill (invalid key) -> OPENAI_API_KEY",
    ])
    expect(lines.join("\n")).not.toContain("sk-live")
  })

  it("exits 1 and says which key is out of credit, while the drill still serves from the other", async () => {
    const { code, lines } = run({ primary: 0, spare: 9 })

    expect(await code).toBe(1)
    expect(lines).toEqual([
      "openai  OPENAI_API_KEY  rejected: out of credit (429)",
      "openai  OPENAI_API_KEY_SPARE  serving",
      "openai  drill  failover served: drill (invalid key) -> OPENAI_API_KEY, OPENAI_API_KEY -> OPENAI_API_KEY_SPARE",
    ])
  })

  it("exits 2 when the environment holds no key", async () => {
    const lines: string[] = []
    expect(await check([], { env: {}, print: () => {}, printError: (l) => lines.push(l) })).toBe(2)
    expect(lines[0]).toContain("No API key found")
  })
})
