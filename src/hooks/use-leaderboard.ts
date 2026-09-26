"use client";

import useSWR from "swr";
import type { LeaderboardEntry } from "@/types";

const fetcher = async (url: string): Promise<{ leaderboard: LeaderboardEntry[] }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load leaderboard.");
  return res.json();
};

export function useLeaderboard(initialData: LeaderboardEntry[]) {
  const { data, mutate, isLoading } = useSWR("/api/leaderboard", fetcher, {
    fallbackData: { leaderboard: initialData },
    refreshInterval: 4000,
    revalidateOnFocus: true,
    dedupingInterval: 1500,
  });

  return {
    leaderboard: data?.leaderboard ?? initialData,
    isLoading,
    mutate,
  };
}
