"use client";

import { play } from "@/content/play";
import { TOP_UP, type OrgId, type Snapshot } from "./store";

const PIPS = 5;

/** One billing organization's key, as a tag on the rail: its credit, its state, and the ways to break it. */
export default function KeyTag({
  id,
  org,
  at,
  bypassed,
  onDrain,
  onTopUp,
  onRateLimit,
}: {
  id: OrgId;
  org: Snapshot["orgs"][OrgId];
  at: number;
  /** The pool is off and this key is not the app's: nothing reaches it. */
  bypassed: boolean;
  onDrain: () => void;
  onTopUp: () => void;
  onRateLimit: (limited: boolean) => void;
}) {
  const { status } = org;
  const seconds = status.retryAt === null ? 0 : Math.max(1, Math.ceil((status.retryAt - at) / 1_000));
  const state = bypassed ? "bypassed" : status.state;
  const word =
    state === "bypassed"
      ? play.tag.bypassed
      : state === "cooling"
        ? play.tag.cooling.replace("{seconds}", String(seconds))
        : state === "recovering"
          ? play.tag.recovering
          : play.tag.serving;

  return (
    <article className="tag" data-state={state}>
      <span className="tag-peg" aria-hidden="true" />
      <header>
        <h3>{id}</h3>
        <p className="tag-role">{play.tag.role[id]}</p>
      </header>

      <div className="credit" aria-label={play.tag.credit.replace("{n}", String(org.credit))}>
        <span className="pips" aria-hidden="true">
          {Array.from({ length: PIPS }, (_, index) => (
            <i key={index} data-on={index < org.credit} />
          ))}
        </span>
        <span className="credit-n">
          {org.credit > PIPS ? `+${org.credit - PIPS}` : org.credit === 0 ? play.tag.empty : ""}
        </span>
      </div>

      <p className="tag-state" aria-live="polite">
        {word}
      </p>
      {state === "cooling" && status.lastReason && (
        <p className="stamp" aria-hidden="true">
          {play.tag.stamp[status.lastReason]}
        </p>
      )}

      <div className="tag-actions">
        <button type="button" onClick={onDrain} disabled={org.credit === 0}>
          {play.tag.drain}
        </button>
        <button type="button" onClick={onTopUp}>
          {play.tag.topUp.replace("{n}", String(TOP_UP))}
        </button>
        <button type="button" aria-pressed={org.rateLimited} onClick={() => onRateLimit(!org.rateLimited)}>
          {play.tag.rateLimit}
        </button>
      </div>
    </article>
  );
}
