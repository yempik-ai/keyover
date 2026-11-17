import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { withTables } from "../scripts/readme-tables.ts"

it("the README's provider tables are the ones the evidence ledger generates", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")
  // Out of date? Run: pnpm tables
  expect(withTables(readme)).toBe(readme)
})
