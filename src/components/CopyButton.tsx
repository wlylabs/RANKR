"use client";

import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
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
      aria-label={copied ? "Copied" : `Copy ${label ?? "address"}`}
    >
      {label && <span className="font-mono text-xs">{label}</span>}
      {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
    </button>
  );
}
