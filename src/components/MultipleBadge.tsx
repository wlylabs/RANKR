import clsx from "clsx";
import { formatChange, formatMultiple } from "@/lib/format";
import { tierOf, type Tier } from "@/lib/metrics";

// 10x+ and -90% get a solid fill so the extremes jump out of a list.
const STYLES: Record<Tier, string> = {
  moon: "bg-up text-bg",
  pump: "bg-up-soft text-up",
  up: "bg-up-soft text-up",
  flat: "bg-surface-2 text-muted",
  down: "bg-down-soft text-down",
  rekt: "bg-down text-bg",
};

export function Arrow({ up, className }: { up: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={clsx("shrink-0", className)} aria-hidden="true">
      <path d={up ? "M4 1 7.5 7h-7z" : "M4 7 .5 1h7z"} fill="currentColor" />
    </svg>
  );
}

/** "3.42x" for gains, "-37.2%" for losses, colored by tier. */
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
        "tabular inline-flex items-center justify-center gap-1 rounded-md font-mono font-semibold whitespace-nowrap",
        STYLES[tier],
        size === "sm" && "px-1.5 py-0.5 text-xs",
        size === "md" && "min-w-[4.75rem] px-2 py-1 text-[13px]",
        size === "lg" && "px-3 py-1.5 text-base",
        className,
      )}
    >
      {tier !== "flat" && <Arrow up={multiple >= 1} className="size-[7px]" />}
      {formatMultiple(multiple)}
    </span>
  );
}

/** Plain colored text version, e.g. "+242%" under a big multiple. */
export function ChangeText({ multiple, className }: { multiple: number; className?: string }) {
  return (
    <span
      className={clsx(
        "tabular font-mono font-medium",
        multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : "text-muted",
        className,
      )}
    >
      {formatChange(multiple)}
    </span>
  );
}
