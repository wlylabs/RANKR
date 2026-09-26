import { listLeaderboard } from "@/lib/entrants";
import { LeaderboardView } from "@/components/leaderboard-view";
import { ToastProvider } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

export default function Home() {
  const initialLeaderboard = listLeaderboard();

  return (
    <ToastProvider>
      <LeaderboardView initialLeaderboard={initialLeaderboard} />
    </ToastProvider>
  );
}
