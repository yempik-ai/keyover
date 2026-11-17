#!/usr/bin/env node
import { check, USAGE } from "./check.ts"

const [command, ...rest] = process.argv.slice(2)
if (command !== "check") {
  console.log(USAGE)
  process.exit(command === undefined || command === "--help" || command === "-h" ? 0 : 2)
}
// The class only: a transport error can quote a header value, the key itself.
check(rest).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`check failed: ${error instanceof Error ? error.name : typeof error}`)
    process.exit(1)
  },
)
