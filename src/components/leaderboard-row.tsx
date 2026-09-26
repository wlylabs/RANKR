"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/avatar";
import { RankBadge } from "@/components/rank-badge";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import type { LeaderboardEntry } from "@/types";

export function LeaderboardRow({
  entry,
  justMoved,
}: {
  entry: LeaderboardEntry;
  justMoved: boolean;
}) {
  return (
    <motion.div
      layout
      layoutId={`row-${entry.id}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 last:border-none sm:px-5",
        justMoved && "rounded-[var(--radius-sm)] border-transparent bg-accent-soft",
      )}
    >
      <RankBadge rank={entry.rank} />
      <Avatar seed={entry.id} initials={entry.initials} size={36} />
      <p className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-foreground">
        {entry.displayName}
      </p>
      <p className="tabular shrink-0 text-[14.5px] font-semibold text-foreground-muted">
        {formatCents(entry.totalCents)}
      </p>
    </motion.div>
  );
}
