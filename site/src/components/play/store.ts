import { ANTHROPIC, createKeyPool, type KeyEvent, type KeyPool, type KeyStatus, OPENAI } from "@lib/index";
import { type FakeCall, type FakeFlavor, type FakeOrgState, fakeProvider, type FakeProvider } from "@lib/testing";

// The playground: the library's own pool, in this browser, in front of a
// provider that lives in memory. Nothing here imitates the pool. The page shows
// what `createKeyPool` does and the events it emits.

export const ORG_IDS = ["primary", "spare"] as const;
export type OrgId = (typeof ORG_IDS)[number];

/** Credit is counted in requests, so a visitor can spend it by hand. */
const START_CREDIT: Record<OrgId, number> = { primary: 3, spare: 12 };
export const TOP_UP = 5;

/** Short enough to watch a key come back; production defaults are 30s to 5min. */
const COOLDOWN = { initial: 6_000, max: 24_000 } as const;
const LATENCY_MS = 320;

const ENDPOINT: Record<FakeFlavor, { url: string; path: string }> = {
  openai: { url: "https://api.openai.com/v1/responses", path: "POST /v1/responses" },
  anthropic: { url: "https://api.anthropic.com/v1/messages", path: "POST /v1/messages" },
};

const PROFILE = { openai: OPENAI, anthropic: ANTHROPIC } as const;

/** One attempt of a request on one key, as the provider answered it. */
export interface Hop {
  readonly org: OrgId;
  readonly status: number;
  readonly outcome: FakeCall["outcome"];
  /** The provider's own error code or message, for a rejection. */
  readonly detail: string | null;
}

/** One request the visitor's "app" made, from its point of view and the pool's. */
export interface Exchange {
  readonly n: number;
  readonly path: string;
  readonly pooled: boolean;
  readonly hops: readonly Hop[];
  /** What the app got back. Null while the request is in flight. */
  readonly result: { readonly ok: boolean; readonly status: number; readonly text: string; readonly final: boolean } | null;
}

export const TOUR = ["failover", "rate_limit", "restored", "exhausted"] as const;
export type TourStep = (typeof TOUR)[number];

export interface Snapshot {
  readonly flavor: FakeFlavor;
  readonly pooled: boolean;
  readonly orgs: Readonly<Record<OrgId, FakeOrgState & { readonly status: KeyStatus<OrgId> }>>;
  readonly exchanges: readonly Exchange[];
  readonly events: readonly KeyEvent<OrgId>[];
  readonly served: number;
  readonly failed: number;
  readonly busy: boolean;
  readonly tour: ReadonlySet<TourStep>;
  /** Epoch ms of this snapshot, for cooldown countdowns. */
  readonly at: number;
}

export interface Playground {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => Snapshot;
  readonly send: () => Promise<void>;
  readonly drain: (org: OrgId) => void;
  readonly topUp: (org: OrgId) => void;
  readonly rateLimit: (org: OrgId, limited: boolean) => void;
  readonly setPooled: (pooled: boolean) => void;
  readonly setFlavor: (flavor: FakeFlavor) => void;
  readonly reset: () => void;
}

export function createPlayground(): Playground {
  const listeners = new Set<() => void>();
  let flavor: FakeFlavor = "openai";
  let pooled = true;
  let provider!: FakeProvider<OrgId>;
  let pool!: KeyPool<OrgId>;
  let exchanges: Exchange[] = [];
  let events: KeyEvent<OrgId>[] = [];
  let served = 0;
  let failed = 0;
  let inFlight = 0;
  let tour = new Set<TourStep>();
  let current!: Snapshot;
  let ticker: ReturnType<typeof setInterval> | undefined;

  const publish = () => {
    const status = pool.status();
    const orgs = Object.fromEntries(
      ORG_IDS.map((id) => [id, { ...provider.state(id), status: status.find((s) => s.id === id)! }]),
    ) as Snapshot["orgs"];
    current = { flavor, pooled, orgs, exchanges, events, served, failed, busy: inFlight > 0, tour, at: Date.now() };
    // A cooling key counts down once a second, and only while one is cooling.
    const cooling = status.some((s) => s.state === "cooling");
    if (cooling && ticker === undefined) ticker = setInterval(publish, 1_000);
    if (!cooling && ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
    for (const listener of listeners) listener();
  };

  const achieve = (step: TourStep) => {
    if (!tour.has(step)) tour = new Set(tour).add(step);
  };

  const build = () => {
    exchanges = [];
    events = [];
    served = 0;
    failed = 0;
    provider = fakeProvider<OrgId>({
      flavor,
      latencyMs: LATENCY_MS,
      orgs: {
        primary: { apiKey: "sk-playground-primary", credit: START_CREDIT.primary },
        spare: { apiKey: "sk-playground-spare", credit: START_CREDIT.spare },
      },
    });
    pool = createKeyPool<OrgId>({
      provider: PROFILE[flavor],
      keys: { primary: "sk-playground-primary", spare: "sk-playground-spare" },
      fetch: provider.fetch,
      cooldownMs: COOLDOWN,
      onEvent: (event) => {
        events = [...events, event];
        if (event.type === "failover") achieve("failover");
        if (event.type === "key_restored") achieve("restored");
        if (event.type === "all_keys_rejected") achieve("exhausted");
      },
    });
  };

  build();
  publish();

  const send = async () => {
    const n = (exchanges[0]?.n ?? 0) + 1;
    const { url, path } = ENDPOINT[flavor];
    const usedPool = pooled;
    const firstCall = provider.calls.length;
    const exchange: Exchange = { n, path, pooled: usedPool, hops: [], result: null };
    exchanges = [exchange, ...exchanges].slice(0, 40);
    inFlight += 1;
    publish();

    // Without the pool the app does what a plain SDK client does: one key.
    const transport = usedPool ? pool.fetch : provider.fetch;
    const response = await transport(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(flavor === "openai"
          ? { authorization: `Bearer ${usedPool ? pool.clientOptions.apiKey : "sk-playground-primary"}` }
          : { "x-api-key": usedPool ? pool.clientOptions.apiKey : "sk-playground-primary" }),
      },
      body: JSON.stringify({ model: "playground", input: "Hello" }),
    });
    const body: unknown = await response.json();
    const hops = provider.calls.slice(firstCall).map(
      (call): Hop => ({
        org: call.org ?? "primary",
        status: call.status,
        outcome: call.outcome,
        detail: call.outcome === "served" ? null : DETAIL[flavor][call.outcome],
      }),
    );
    const last = hops.at(-1);
    if (response.ok) served += 1;
    else failed += 1;
    if (usedPool && last?.outcome === "rate_limited" && hops.length === 1) achieve("rate_limit");
    const done: Exchange = {
      ...exchange,
      hops,
      result: {
        ok: response.ok,
        status: response.status,
        text: response.ok ? textOf(body) : messageOf(body),
        final: response.headers.get("x-should-retry") === "false",
      },
    };
    exchanges = exchanges.map((e) => (e.n === n ? done : e));
    inFlight -= 1;
    publish();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && ticker !== undefined) {
          clearInterval(ticker);
          ticker = undefined;
        }
      };
    },
    snapshot: () => current,
    send,
    drain: (org) => {
      provider.drain(org);
      publish();
    },
    topUp: (org) => {
      provider.topUp(org, TOP_UP);
      publish();
    },
    rateLimit: (org, limited) => {
      provider.rateLimit(org, limited);
      publish();
    },
    setPooled: (next) => {
      pooled = next;
      publish();
    },
    setFlavor: (next) => {
      flavor = next;
      build();
      publish();
    },
    reset: () => {
      tour = new Set();
      build();
      publish();
    },
  };
}

/** The code or phrase a developer recognizes each rejection by. */
const DETAIL: Record<FakeFlavor, Record<Exclude<FakeCall["outcome"], "served">, string>> = {
  openai: {
    out_of_credit: "insufficient_quota",
    revoked: "invalid_api_key",
    unknown_key: "invalid_api_key",
    rate_limited: "rate_limit_exceeded",
  },
  anthropic: {
    out_of_credit: "credit balance is too low",
    revoked: "authentication_error",
    unknown_key: "authentication_error",
    rate_limited: "rate_limit_error",
  },
};

function textOf(body: unknown): string {
  const b = body as {
    output?: { content?: { text?: string }[] }[];
    content?: { text?: string }[];
  };
  return b.output?.[0]?.content?.[0]?.text ?? b.content?.[0]?.text ?? "";
}

function messageOf(body: unknown): string {
  return (body as { error?: { message?: string } }).error?.message ?? "";
}
