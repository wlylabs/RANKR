"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { PodiumCard } from "@/components/podium-card";
import type { LeaderboardEntry } from "@/types";

export function Podium({
  entries,
  justMovedId,
}: {
  entries: LeaderboardEntry[];
  justMovedId: string | null;
}) {
  if (entries.length === 0) return null;

  return (
    <LayoutGroup id="podium">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:gap-4">
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <PodiumCard key={entry.id} entry={entry} justMoved={entry.id === justMovedId} />
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
