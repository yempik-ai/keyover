"use client";

import { useId, useState, type ReactNode } from "react";

/** Tabs over panels that are all in the document: a reader without scripts, or a crawler, sees every one. */
export default function Tabs({ label, tabs }: { label: string; tabs: { name: string; panel: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.name}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (step === 0) return;
              const next = (index + step + tabs.length) % tabs.length;
              setActive(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {tab.name}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.name}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
