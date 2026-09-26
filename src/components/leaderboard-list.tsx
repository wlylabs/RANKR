"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { LeaderboardRow } from "@/components/leaderboard-row";
import type { LeaderboardEntry } from "@/types";

export function LeaderboardList({
  entries,
  justMovedId,
}: {
  entries: LeaderboardEntry[];
  justMovedId: string | null;
}) {
  if (entries.length === 0) return null;

  return (
    <LayoutGroup id="list">
      <div className="card overflow-hidden rounded-[var(--radius-lg)]">
        <AnimatePresence>
          {entries.map((entry, index) => (
            <LeaderboardRow
              key={entry.id}
              entry={entry}
              index={index}
              justMoved={entry.id === justMovedId}
            />
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
