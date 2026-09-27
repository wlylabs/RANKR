import clsx from "clsx";
import { formatChange, formatMultiple } from "@/lib/format";
import { tierOf } from "@/lib/metrics";

function tone(multiple: number) {
  return multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : "text-muted";
}

/** "3.42x" for gains, "-37.2%" for losses. Plain colored mono text, 10x+ in bold. */
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
        "tabular inline-block text-right font-mono whitespace-nowrap",
        tone(multiple),
        tier === "moon" || tier === "rekt" ? "font-semibold" : "font-medium",
        size === "sm" && "text-xs",
        size === "md" && "min-w-[4.5rem] text-[13px]",
        size === "lg" && "text-base",
        className,
      )}
    >
      {formatMultiple(multiple)}
    </span>
  );
}

/** Percentage version, e.g. "+242%" under a big multiple. */
export function ChangeText({ multiple, className }: { multiple: number; className?: string }) {
  return <span className={clsx("tabular font-mono", tone(multiple), className)}>{formatChange(multiple)}</span>;
}
