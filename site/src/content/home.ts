import { site } from "./site";

export const home = {
  meta: {
    title: `${site.name}: API key failover for OpenAI, Anthropic and the AI SDK`,
    description:
      "When one billing organization runs out of credit, your requests move to the next key. A drop-in fetch for the OpenAI SDK, the Anthropic SDK and the Vercel AI SDK. No gateway, no dependencies.",
  },
  nav: { how: "How it works", errors: "Error reference", github: "GitHub" },
  hero: {
    headline: { first: "Out of credit.", not: "Not", rest: "out of service." },
    lede: "One fetch for the OpenAI, Anthropic and AI SDKs. When a billing organization runs dry, requests move to your next key.",
    copy: "Copy",
    copied: "Copied",
    source: "Read the source",
  },
  stories: {
    title: "It happens to people who did everything right",
    lede: "Credit runs out at the worst hour, and the fix is waiting on someone to wake up, find a card and click.",
    items: [
      {
        quote:
          "I launched this at midnight prior to logging off and going to bed. I woke up and noticed my OpenAI account failed to fund. So we ran out of funds and it caused things to break for some of you.",
        who: "MrRowTheBoat, on his own Show HN launch",
        where: "Hacker News, 215 points",
        href: "https://news.ycombinator.com/item?id=49238851",
      },
      {
        quote: "It seems like auto-recharge might be broken, and it took my site offline for more than an hour.",
        who: "RyanW, in the thread Auto-recharge silently failed",
        where: "OpenAI developer forum. Support confirmed it and deployed a fix",
        href: "https://community.openai.com/t/auto-recharge-silently-failed/1385922",
      },
      {
        quote: "Anthropic \"credit balance is too low\" (HTTP 400) blocks failover to the next credential",
        who: "The title of a bug report on a popular proxy, since fixed",
        where: "Anthropic says it with a 400, and code that reads every 400 as a bad request strands a funded spare",
        href: "https://github.com/router-for-me/CLIProxyAPI/issues/7120",
      },
    ],
  },
  how: {
    title: "One option on the client you already have",
    lede: "No gateway to run and no new client to learn. The pool is a fetch: your SDK keeps its retries, its streaming and its types.",
    tabs: "SDK",
    sdks: { openai: "OpenAI SDK", anthropic: "Anthropic SDK", "ai-sdk": "AI SDK" },
    agent: {
      title: "Or hand it to your agent",
      text: "The repository has a guide written for coding agents. It finds your clients, wires the pool, and proves the failover with a drill.",
      copy: "Copy the prompt",
    },
  },
  rule: {
    title: "A request moves only when the provider proves it never ran",
    lede: "A billing or key rejection arrives before any work starts, so sending the request again cannot run it twice. Every other answer goes back to your SDK untouched.",
    moves: {
      title: "Moves to the next key",
      items: [
        { what: "Out of credit", code: "429 insufficient_quota" },
        { what: "Credit balance too low", code: "400 credit balance is too low" },
        { what: "Spend limit reached", code: "429 organization_spend_limit_exceeded" },
        { what: "A key the provider does not know", code: "401 invalid_api_key" },
      ],
    },
    stays: {
      title: "Stays with your SDK",
      items: [
        { what: "Rate limit", code: "429 rate_limit_exceeded", why: "A traffic control, and your SDK's to retry." },
        { what: "Server error", code: "5xx", why: "It may have run. A resend could run it twice." },
        { what: "Bad request", code: "400", why: "Another key cannot fix the input." },
        { what: "Organization on hold", code: "403", why: "A trust and safety decision. Never routed around." },
      ],
    },
  },
  check: {
    title: "Prove it before the night it matters",
    lede: "A fallback nobody has tested is a hope. One command sends a minimal request on each key, then runs a drill: a pool whose first key is invalid must still answer.",
    command: `npx ${site.name} check`,
    caption: "It names the environment variables, never their values, and exits 1 when a key cannot serve. Run it in CI or on a schedule.",
    output: [
      "openai  OPENAI_API_KEY        rejected: out of credit or over its limit (429)",
      "openai  OPENAI_API_KEY_SPARE  serving",
      "openai  drill  failover served: drill (invalid key) -> OPENAI_API_KEY, OPENAI_API_KEY -> OPENAI_API_KEY_SPARE",
    ],
  },
  errors: {
    title: "The error you searched for, and what happens to it",
    lede: "Ten providers, each with its own way to say the money ran out. Every rule is backed by the provider's reference or a field report, and by a test.",
    all: "All error references",
    moves: "moved",
    stays: "left alone",
  },
  compare: {
    title: "Not a gateway, not a key rotator",
    lede: "Key pools and gateways exist, and some are very good. This one does a single narrow job inside the SDK you already use.",
    columns: { aspect: "", rotator: "A key rotator", gateway: "A gateway", own: site.name },
    rows: [
      {
        aspect: "What you change",
        rotator: "Wrap every call, or adopt its client",
        gateway: "Route all traffic through a proxy or a hosted service",
        own: "One option on your existing client",
      },
      {
        aspect: "When it switches keys",
        rotator: "On most errors, rate limits included",
        gateway: "On the status codes or failures you configure",
        own: "Only on a billing or key rejection",
      },
      {
        aspect: "A rate limit",
        rotator: "Jumps to another key, which is limit evasion",
        gateway: "Often falls back",
        own: "Stays with your SDK's retry",
      },
      {
        aspect: "A timeout or a 5xx",
        rotator: "Resent on another key, and it may run twice",
        gateway: "Depends on your configuration",
        own: "Never resent by the pool",
      },
      {
        aspect: "A cap your provider assigned",
        rotator: "Routed around",
        gateway: "Routed around when the status matches",
        own: "Left alone unless you opt in",
      },
      {
        aspect: "Where it runs",
        rotator: "In your process",
        gateway: "A server or a service in the request path",
        own: "In your process, with no dependencies",
      },
    ],
    wrong: {
      title: "When to use something else",
      text: "If you need routing across providers, budgets per team, a dashboard or shared key health across a fleet, run a gateway such as LiteLLM, Portkey or Bifrost. They do far more than this does.",
    },
  },
  faq: {
    title: "Questions",
    items: [
      {
        q: `What is ${site.name}?`,
        a: `${site.name} is an open-source TypeScript library that holds several API keys for one AI provider, in priority order, behind one fetch. When the provider refuses a request because the key's billing organization is out of credit, over its own spend limit, or the key is not accepted, the same request is sent again on the next key. It plugs into the OpenAI SDK, the Anthropic SDK and the Vercel AI SDK as their fetch option. It has no dependencies and is MIT licensed.`,
      },
      {
        q: "What happens when my OpenAI or Anthropic organization runs out of credits?",
        a: "Without a fallback, every request fails until someone adds credit: OpenAI answers 429 insufficient_quota and Anthropic answers 400 with the message that your credit balance is too low. With the pool in place, the first rejected request is resent on your next key inside the same call, your code receives a normal response, and an event tells you which organization needs a top-up.",
      },
      {
        q: "Does it rotate keys to get around rate limits?",
        a: "No. A rate limit returns to your SDK untouched, and the SDK retries it as it always did. The pool also never moves a request for a safety hold, a region or IP restriction or a model your key cannot access, and by default it does not move one for a spending cap your provider assigned to your usage tier. It is built for billing resilience between organizations you are authorized to use, not for multiplying free tiers or limits.",
      },
      {
        q: "Can a failover run my request twice?",
        a: "The pool resends only a response the provider defines as a refusal given before any work started: a billing or authentication rejection. It adds no retry for a timeout, a 5xx, a dropped stream or any other failure that may already have run. Those go back to your SDK, which applies its own retry policy as before.",
      },
      {
        q: "Does it work with streaming?",
        a: "Yes. A billing or key rejection arrives as the HTTP response, before a stream starts, so the pool moves the request before any token is sent. A stream that has started is passed through and is never replayed.",
      },
      {
        q: "What happens to the conversation when the organization changes?",
        a: "Visible turns and tool results are portable, so a stateless request continues on the next key. OpenAI encrypted reasoning only decrypts in the organization that produced it: the pool detects that rejection and resends once without the reasoning items. Prompt caches start cold on the new organization. State stored at the provider, such as previous_response_id, files and vector stores, belongs to one organization and is not moved.",
      },
      {
        q: "How does a key come back after I add credit?",
        a: "A rejected key cools down, 30 seconds at first and up to 5 minutes. When the cooldown ends, a single request probes it while the others prefer the keys that serve. Once it answers 2xx it takes its priority back, with no restart. A cooling key is never refused locally: if every other key rejects, it is tried last, so a top-up works at once.",
      },
      {
        q: "How is it different from LiteLLM, Portkey or OpenRouter?",
        a: "Those are gateways: you send your traffic through a proxy or a hosted service, and you get routing across providers, budgets and dashboards. This is a small library inside your process that changes one option on the SDK client you already have, and it switches keys only for billing and key rejections. If you already run a gateway, you may not need it.",
      },
      {
        q: "Which runtimes and SDKs does it support?",
        a: "Any SDK that accepts a custom fetch: the official OpenAI and Anthropic SDKs, and the AI SDK providers. It uses only fetch, Request, Response and Headers, and it is tested on Node.js 20, 22 and 24, Bun and Deno.",
      },
      {
        q: "I run several instances. Do they share key health?",
        a: "No, and they do not need to. Health is in memory, per process. Each instance learns that a key is rejected with one fast extra round trip, then prefers the next key while the first cools down. There is no store to run.",
      },
    ],
  },
  footer: {
    made: "Open source, made at",
    license: "MIT license",
    links: { github: "GitHub", npm: "npm", errors: "Error reference", llms: "llms.txt" },
  },
} as const;
