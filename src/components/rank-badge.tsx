import { cn } from "@/lib/cn";

const TIER_BG: Record<number, string> = {
  1: "bg-rank-1",
  2: "bg-rank-2",
  3: "bg-rank-3",
};

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  const isTopThree = rank <= 3;

  return (
    <span className={cn("flex w-9 shrink-0 items-center justify-center", className)}>
      {isTopThree ? (
        <span
          className={cn(
            "tabular inline-flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold text-white ring-1 ring-inset ring-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.18)]",
            TIER_BG[rank],
          )}
        >
          {rank}
        </span>
      ) : (
        <span className="tabular text-[14px] font-medium text-foreground-subtle">
          {String(rank).padStart(2, "0")}
        </span>
      )}
    </span>
  );
}
