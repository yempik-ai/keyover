"use client";

import { Check } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";
import { play } from "@/content/play";
import { TOUR } from "./store";
import { usePlayground } from "./usePlayground";

/** The four things to break, ticked by what the pool actually did. `children` is the payoff's install box. */
export default function Tour({ children }: { children: ReactNode }) {
  const { state } = usePlayground();
  const dialog = useRef<HTMLDialogElement>(null);
  const done = TOUR.filter((step) => state.tour.has(step)).length;
  const complete = done === TOUR.length;

  useEffect(() => {
    if (complete) dialog.current?.showModal();
  }, [complete]);

  return (
    <aside className="tour" aria-labelledby="tour-title">
      <header>
        <h2 id="tour-title">{play.tour.title}</h2>
        <span className="tour-count" aria-live="polite">
          {done}/{TOUR.length}
        </span>
      </header>
      <p className="tour-lede">{play.tour.lede}</p>
      <ol>
        {TOUR.map((step) => {
          const ticked = state.tour.has(step);
          const copy = play.tour.steps[step];
          return (
            <li key={step} data-done={ticked}>
              <span className="tick" aria-hidden="true">
                {ticked && <Check size={14} weight="bold" />}
              </span>
              <div>
                <h3>{copy.title}</h3>
                <p>{ticked ? copy.done : copy.text}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <dialog ref={dialog} className="payoff" aria-labelledby="payoff-title">
        <h2 id="payoff-title">{play.tour.payoff.title}</h2>
        <p>{play.tour.payoff.text}</p>
        {children}
        <form method="dialog">
          <button type="submit" className="ghost">
            {play.tour.payoff.close}
          </button>
        </form>
      </dialog>
    </aside>
  );
}
