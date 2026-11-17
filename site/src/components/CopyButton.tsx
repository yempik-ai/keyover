"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

/** A command or a prompt, and the button that copies it. */
export default function CopyButton({
  text,
  label,
  copied,
  className,
}: {
  text: string;
  label: string;
  copied: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1_600);
      }}
    >
      {done ? <Check size={16} weight="bold" aria-hidden="true" /> : <Copy size={16} weight="bold" aria-hidden="true" />}
      <span aria-live="polite">{done ? copied : label}</span>
    </button>
  );
}
