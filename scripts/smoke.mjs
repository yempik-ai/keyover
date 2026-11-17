// The built package, run by whatever runtime calls this file: Node, Bun or
// Deno. It drains the first organization of a simulated provider and expects
// the pool to serve from the second, streaming the request body included.
import { createKeyPool, OPENAI } from "../dist/index.js"
import { fakeProvider } from "../dist/testing.js"

const provider = fakeProvider({
  flavor: "openai",
  orgs: { primary: { apiKey: "k-primary", credit: 0 }, spare: { apiKey: "k-spare" } },
})
const events = []
const pool = createKeyPool({
  provider: OPENAI,
  keys: { primary: "k-primary", spare: "k-spare" },
  fetch: provider.fetch,
  onEvent: (event) => events.push(event.type),
})

const send = (body) =>
  pool.fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${pool.clientOptions.apiKey}` },
    body,
    ...(typeof body === "string" ? {} : { duplex: "half" }),
  })

const first = await send(JSON.stringify({ input: "hi" }))
const streamed = await send(new Blob([JSON.stringify({ input: "hi" })]).stream())
const text = (await first.json()).output[0].content[0].text

const ok =
  first.status === 200 &&
  streamed.status === 200 &&
  text === "Served by spare." &&
  events.join() === "key_rejected,failover" &&
  provider.calls.map((call) => call.org).join() === "primary,spare,spare"
if (!ok) {
  console.error("smoke failed", { status: first.status, text, events, calls: provider.calls })
  throw new Error("smoke failed")
}
console.log("smoke ok:", text)
