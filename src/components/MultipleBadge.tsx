import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Flame } from "lucide-react";
import { formatChange, formatMultiple } from "@/lib/format";
import { tierOf } from "@/lib/metrics";

const STYLES = {
  moon: "bg-gold-soft text-gold",
  pump: "bg-up-soft text-up",
  up: "bg-up-soft text-up",
  flat: "bg-surface-2 text-muted",
  down: "bg-down-soft text-down",
  rekt: "bg-down-soft text-down",
} as const;

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
  const Icon = tier === "moon" ? Flame : multiple >= 1 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        "tabular inline-flex items-center justify-center gap-0.5 rounded-lg font-bold whitespace-nowrap",
        STYLES[tier],
        size === "sm" && "px-1.5 py-0.5 text-xs",
        size === "md" && "min-w-[4.5rem] px-2 py-1 text-sm",
        size === "lg" && "px-3 py-1.5 text-base",
        className,
      )}
    >
      {tier !== "flat" && <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.75} />}
      {formatMultiple(multiple)}
    </span>
  );
}

/** Plain colored text version, e.g. "+242%" under a big multiple. */
export function ChangeText({ multiple, className }: { multiple: number; className?: string }) {
  const tier = tierOf(multiple);
  return (
    <span
      className={clsx(
        "tabular font-semibold",
        tier === "moon" ? "text-gold" : multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : "text-muted",
        className,
      )}
    >
      {formatChange(multiple)}
    </span>
  );
}
