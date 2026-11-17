// The playground's words. Plain strings, so the page and llms.txt can share them.

export const play = {
  board: {
    label: "Playground: the pool, two billing organizations and an app",
    provider: "Provider whose errors the playground answers with",
    flavors: { openai: "OpenAI", anthropic: "Anthropic" },
    pooled: "Pool on",
    unpooled: "Pool off",
    reset: "Reset",
    send: "Send a request",
    served: "App served",
    failed: "App failed",
    log: "Requests, newest first",
    empty: "Nothing sent yet. Send a request, then spend the primary's credit.",
    movedTo: "moved to",
    pending: "in flight",
    ok: "200 to the app",
    final: "final: no retry",
    error: "{status} to the app",
  },
  tag: {
    role: { primary: "serves first", spare: "serves when it must" },
    credit: "{n} requests of credit left",
    empty: "empty",
    serving: "Serving",
    cooling: "Cooling, probe in {seconds}s",
    recovering: "Next request probes it",
    bypassed: "Not wired without the pool",
    stamp: { credit: "Out of credit", spend_limit: "Over its limit", provider_limit: "Provider cap", auth: "Key refused" },
    drain: "Drain",
    topUp: "Top up +{n}",
    rateLimit: "Rate limit",
  },
  tour: {
    title: "Break it",
    lede: "Four ways production goes wrong. Each one runs the real library in this tab.",
    steps: {
      failover: {
        title: "Spend the credit",
        text: "Drain the primary, then send a request.",
        done: "The request moved. The app got its 200.",
      },
      rate_limit: {
        title: "Hit a rate limit",
        text: "Rate limit the key that is serving, then send.",
        done: "Nothing moved. A rate limit is your SDK's to retry.",
      },
      restored: {
        title: "Top it up",
        text: "Top up the primary and send once its cooldown ends.",
        done: "One probe, and the primary serves first again.",
      },
      exhausted: {
        title: "Run everything dry",
        text: "Drain both organizations, then send.",
        done: "Every key was tried once. The answer is marked final.",
      },
    },
    payoff: {
      title: "That was the real library.",
      text: "The same pool, in your server, in front of the real provider. It is one option on the client you already have.",
      close: "Keep breaking it",
    },
  },
} as const;
