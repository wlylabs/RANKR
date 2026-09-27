"use client";

import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Copies to the clipboard; `copied` stays true for `ms` after a copy. */
export function useCopy(ms = 1500) {
  const [copied, setCopied] = useState(false);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), ms);
    } catch {
      /* clipboard blocked */
    }
  }
  return { copied, copy };
}

/** `what` names the value for screen readers when there is no visible label ("Copy link"). */
export function CopyButton({
  value,
  label,
  what = "address",
  className,
}: {
  value: string;
  label?: string;
  what?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copy(value);
      }}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg text-muted transition hover:text-fg",
        className,
      )}
      aria-label={copied ? "Copied" : `Copy ${label ?? what}`}
    >
      {label && <span className="font-mono text-xs">{label}</span>}
      {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
    </button>
  );
}
