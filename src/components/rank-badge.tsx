import { cn } from "@/lib/cn";

const TOP_TIER_COLOR: Record<number, string> = {
  1: "text-rank-1",
  2: "text-rank-2",
  3: "text-rank-3",
};

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  const isTopThree = rank <= 3;

  return (
    <span
      className={cn(
        "tabular shrink-0 text-center font-bold",
        isTopThree
          ? cn("w-9 text-[26px] leading-none tracking-[-0.02em]", TOP_TIER_COLOR[rank])
          : "w-9 text-[14px] font-medium text-foreground-subtle",
        className,
      )}
    >
      {isTopThree ? rank : String(rank).padStart(2, "0")}
    </span>
  );
}
