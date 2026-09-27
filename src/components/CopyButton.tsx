"use client";

import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

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
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
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
