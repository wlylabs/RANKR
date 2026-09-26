import { cn } from "@/lib/cn";

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        "tabular flex w-8 shrink-0 items-center justify-center text-[14px] font-medium text-foreground-subtle",
        className,
      )}
    >
      {String(rank).padStart(2, "0")}
    </span>
  );
}
