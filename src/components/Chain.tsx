import clsx from "clsx";
import { chainMeta } from "@/lib/chains";

/** Chain as a plain mono tag, e.g. "SOL". */
export function ChainTag({ chainId, className }: { chainId: string; className?: string }) {
  const meta = chainMeta(chainId);
  return (
    <span className={clsx("font-mono text-[11px] text-subtle uppercase", className)} title={meta.name}>
      {meta.short}
    </span>
  );
}
