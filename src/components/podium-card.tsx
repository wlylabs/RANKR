"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import type { LeaderboardEntry } from "@/types";

const RANK_STYLES: Record<
  number,
  { order: string; height: string; topBar: string; label: string }
> = {
  1: { order: "sm:order-2", height: "sm:pt-0", topBar: "bg-rank-1", label: "1st" },
  2: { order: "sm:order-1", height: "sm:pt-8", topBar: "bg-rank-2", label: "2nd" },
  3: { order: "sm:order-3", height: "sm:pt-8", topBar: "bg-rank-3", label: "3rd" },
};

export function PodiumCard({ entry, justMoved }: { entry: LeaderboardEntry; justMoved: boolean }) {
  const style = RANK_STYLES[entry.rank] ?? RANK_STYLES[3];
  const isFirst = entry.rank === 1;

  return (
    <motion.div
      layout
      layoutId={`podium-${entry.id}`}
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: justMoved ? [1, 1.03, 1] : 1,
      }}
      exit={{ opacity: 0, y: 16, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn("flex w-full flex-col items-center", style.order, style.height)}
    >
      <div
        className={cn(
          "card-lifted relative flex w-full flex-col items-center overflow-hidden rounded-[var(--radius-lg)] px-5 pb-6 pt-8 text-center",
          justMoved && "accent-ring",
        )}
      >
        <span className={cn("absolute inset-x-0 top-0 h-[3px]", style.topBar)} />
        <span className="absolute left-4 top-4 text-[12px] font-medium text-foreground-subtle">
          {style.label}
        </span>
        {isFirst && (
          <Crown size={18} strokeWidth={2} className="absolute right-4 top-4 accent-text" />
        )}
        <Avatar
          seed={entry.id}
          initials={entry.initials}
          size={isFirst ? 68 : 56}
          ring={isFirst}
        />
        <p className="mt-3 truncate text-[15px] font-semibold text-foreground max-w-full">
          {entry.displayName}
        </p>
        <p
          className={cn(
            "tabular mt-1 text-[20px] font-bold",
            isFirst ? "accent-text" : "text-foreground-muted",
          )}
        >
          {formatCents(entry.totalCents)}
        </p>
      </div>
    </motion.div>
  );
}
