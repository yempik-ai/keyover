"use client";

import { usePlayground } from "./usePlayground";

/**
 * The headline tells the truth about the playground. While requests are
 * served it reads "Not out of service"; when the app's last request died for
 * lack of credit, the "Not" comes off its peg.
 */
export default function Headline({ lines }: { lines: { first: string; not: string; rest: string } }) {
  const { state } = usePlayground();
  const last = state.exchanges.find((exchange) => exchange.result !== null);
  const cause = last?.hops.at(-1)?.outcome;
  const down = last?.result?.ok === false && (cause === "out_of_credit" || cause === "revoked");

  return (
    <h1 className="headline">
      <span className="headline-line">{lines.first}</span>{" "}
      <span className="headline-line">
        <span className="not" data-down={down}>
          {lines.not}
        </span>{" "}
        {lines.rest}
      </span>
    </h1>
  );
}
