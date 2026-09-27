import type { Metadata } from "next";
import { Suspense } from "react";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Every memecoin pasted on Rankr, ranked by the multiple since its first paste.",
};

export default function LeaderboardPage() {
  return (
    <Suspense>
      <Leaderboard />
    </Suspense>
  );
}
