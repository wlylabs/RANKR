"use client";

import { motion } from "framer-motion";
import { RankBadge } from "@/components/rank-badge";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import type { LeaderboardEntry } from "@/types";

export function LeaderboardRow({
  entry,
  index,
  justMoved,
}: {
  entry: LeaderboardEntry;
  index: number;
  justMoved: boolean;
}) {
  const isTopThree = entry.rank <= 3;
  const animatedCents = useCountUp(entry.totalCents);

  return (
    <motion.div
      layout
      layoutId={`row-${entry.id}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{
        layout: { type: "spring", stiffness: 320, damping: 32 },
        opacity: { duration: 0.25, delay: Math.min(index * 0.025, 0.3) },
        y: { duration: 0.25, delay: Math.min(index * 0.025, 0.3) },
      }}
      whileHover={{ x: 2 }}
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-none hover:bg-surface-2 sm:px-5",
        isTopThree && "py-4",
        justMoved && "rounded-[var(--radius-sm)] border-transparent bg-accent-soft hover:bg-accent-soft",
      )}
    >
      <RankBadge rank={entry.rank} />
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-foreground",
          isTopThree ? "text-[16px] font-semibold" : "text-[14.5px] font-medium",
        )}
      >
        {entry.displayName}
      </p>
      <p
        className={cn(
          "tabular shrink-0 font-semibold",
          isTopThree ? "text-[17px] text-foreground" : "text-[14.5px] text-foreground-muted",
          entry.rank === 1 && "accent-text",
        )}
      >
        {formatCents(Math.round(animatedCents))}
      </p>
    </motion.div>
  );
}
