"use client";

import { ArrowBendDownRight, ArrowClockwise, PaperPlaneRight } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { play } from "@/content/play";
import KeyTag from "./KeyTag";
import { ORG_IDS, type Exchange } from "./store";
import { usePlayground } from "./usePlayground";

/**
 * The hero's working part: two billing organizations, the pool in front of
 * them, and an app that sends requests. Every figure on it comes from the
 * library's own `status()` and events.
 */
export default function Board() {
  const { state, playground } = usePlayground();
  const log = useRef<HTMLOListElement>(null);
  const newest = state.exchanges[0]?.n;

  useEffect(() => {
    log.current?.scrollTo({ top: 0 });
  }, [newest]);

  return (
    <section className="board" aria-label={play.board.label}>
      <header className="board-bar">
        <div className="seg" role="group" aria-label={play.board.provider}>
          {(["openai", "anthropic"] as const).map((flavor) => (
            <button
              key={flavor}
              type="button"
              aria-pressed={state.flavor === flavor}
              onClick={() => playground.setFlavor(flavor)}
            >
              {play.board.flavors[flavor]}
            </button>
          ))}
        </div>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={state.pooled}
            onChange={(event) => playground.setPooled(event.target.checked)}
          />
          <span className="switch-track" aria-hidden="true" />
          <span>{state.pooled ? play.board.pooled : play.board.unpooled}</span>
        </label>
        <button type="button" className="ghost" onClick={playground.reset}>
          <ArrowClockwise size={15} weight="bold" aria-hidden="true" />
          {play.board.reset}
        </button>
      </header>

      <div className="rail" data-pooled={state.pooled}>
        {ORG_IDS.map((id, index) => (
          <KeyTag
            key={id}
            id={id}
            org={state.orgs[id]}
            at={state.at}
            bypassed={!state.pooled && index > 0}
            onDrain={() => playground.drain(id)}
            onTopUp={() => playground.topUp(id)}
            onRateLimit={(limited) => playground.rateLimit(id, limited)}
          />
        ))}
      </div>

      <div className="app">
        <button type="button" className="send" onClick={() => void playground.send()}>
          <PaperPlaneRight size={18} weight="fill" aria-hidden="true" />
          {play.board.send}
        </button>
        <dl className="tally" aria-live="polite">
          <div>
            <dt>{play.board.served}</dt>
            <dd>{state.served}</dd>
          </div>
          <div data-alarm={state.failed > 0}>
            <dt>{play.board.failed}</dt>
            <dd>{state.failed}</dd>
          </div>
        </dl>
      </div>

      <ol className="log" ref={log} aria-label={play.board.log}>
        {state.exchanges.length === 0 ? (
          <li className="log-empty">{play.board.empty}</li>
        ) : (
          state.exchanges.map((exchange) => <Row key={exchange.n} exchange={exchange} />)
        )}
      </ol>
    </section>
  );
}

function Row({ exchange }: { exchange: Exchange }) {
  const { result } = exchange;
  return (
    <li className="row" data-ok={result?.ok ?? "pending"}>
      <span className="row-n">#{exchange.n}</span>
      <span className="row-hops">
        {exchange.hops.length === 0 && <span className="hop hop-wait">{exchange.path}</span>}
        {exchange.hops.map((hop, index) => (
          <span key={index} className="hop" data-outcome={hop.outcome}>
            {index > 0 && <ArrowBendDownRight size={13} weight="bold" aria-label={play.board.movedTo} />}
            <b>{hop.org}</b> {hop.status}
            {hop.detail && <i> {hop.detail}</i>}
          </span>
        ))}
      </span>
      <span className="row-result">
        {result === null
          ? play.board.pending
          : result.ok
            ? play.board.ok
            : result.final
              ? play.board.final
              : play.board.error.replace("{status}", String(result.status))}
      </span>
    </li>
  );
}
