import { cn } from "@/lib/cn";

const MEDAL_STYLE: Record<number, { background: string; color: string }> = {
  1: {
    background:
      "linear-gradient(135deg, var(--medal-1-from) 0%, var(--medal-1-mid) 55%, var(--medal-1-to) 100%)",
    color: "var(--medal-1-text)",
  },
  2: {
    background:
      "linear-gradient(135deg, var(--medal-2-from) 0%, var(--medal-2-mid) 55%, var(--medal-2-to) 100%)",
    color: "var(--medal-2-text)",
  },
  3: {
    background:
      "linear-gradient(135deg, var(--medal-3-from) 0%, var(--medal-3-mid) 55%, var(--medal-3-to) 100%)",
    color: "var(--medal-3-text)",
  },
};

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  const isTopThree = rank <= 3;

  return (
    <span className={cn("flex w-9 shrink-0 items-center justify-center", className)}>
      {isTopThree ? (
        <span
          className="tabular inline-flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-extrabold"
          style={{
            background: MEDAL_STYLE[rank].background,
            color: MEDAL_STYLE[rank].color,
            boxShadow:
              "inset 0 1px 1px rgba(255,255,255,0.65), inset 0 -1.5px 2px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.22)",
          }}
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
