"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { formatChange, formatMultiple } from "@/lib/format";
import { tierOf } from "@/lib/metrics";

export function toneOf(multiple: number, flat = "text-muted") {
  return multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : flat;
}

/**
 * A brief green / red wash behind a number when a live refresh moves it (up or down), like a trading
 * screen. Only a change you can see counts (3.42x to 3.43x, not 3.421x to 3.422x). The parent must be
 * `relative isolate`. Reduced motion turns it off with every other animation.
 */
export function Flash({ value }: { value: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ up: boolean; n: number } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (formatMultiple(before) === formatMultiple(value)) return;
    setFlash((f) => ({ up: value > before, n: (f?.n ?? 0) + 1 }));
  }, [value]);
  if (!flash) return null;
  return (
    <span
      key={flash.n}
      aria-hidden
      className={clsx(
        "pointer-events-none absolute inset-y-0 -inset-x-1 -z-10 rounded",
        flash.up ? "animate-flash-up" : "animate-flash-down",
      )}
    />
  );
}

/** "3.42x" for gains, "-37.2%" for losses. Plain colored mono text, 10x+ in bold; flashes when it moves. */
export function MultipleBadge({
  multiple,
  size = "md",
  className,
}: {
  multiple: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tier = tierOf(multiple);
  return (
    <span
      className={clsx(
        "tabular relative isolate inline-block text-right font-mono whitespace-nowrap",
        toneOf(multiple),
        tier === "moon" || tier === "rekt" ? "font-semibold" : "font-medium",
        size === "sm" && "text-xs",
        size === "md" && "min-w-[4.5rem] text-[13px]",
        size === "lg" && "text-base",
        className,
      )}
    >
      <Flash value={multiple} />
      {formatMultiple(multiple)}
    </span>
  );
}

/** Percentage version, e.g. "+242%" under a big multiple. */
export function ChangeText({ multiple, className }: { multiple: number; className?: string }) {
  return <span className={clsx("tabular font-mono", toneOf(multiple), className)}>{formatChange(multiple)}</span>;
}
