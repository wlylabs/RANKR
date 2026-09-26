"use client";

import { useCallback, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { LeaderboardList } from "@/components/leaderboard-list";
import { Footer } from "@/components/footer";
import { ClaimSheet, type ClaimSubmitInput, type ClaimSubmitResult } from "@/components/claim-sheet";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { useMyEntrant } from "@/hooks/use-my-entrant";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import type { ClaimResponse, LeaderboardEntry } from "@/types";

function fireConfetti() {
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 38,
    gravity: 1.1,
    ticks: 160,
    origin: { y: 0.35 },
    colors: ["#0e8f68", "#3ecf98", "#6c63ff", "#101110"],
    scalar: 0.85,
    disableForReducedMotion: true,
  });
}

export function LeaderboardView({ initialLeaderboard }: { initialLeaderboard: LeaderboardEntry[] }) {
  const { leaderboard, mutate } = useLeaderboard(initialLeaderboard);
  const { entrantId, setEntrantId } = useMyEntrant();
  const { show } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPooledCents = leaderboard.reduce((sum, entry) => sum + entry.totalCents, 0);
  const topAmountCents = leaderboard[0]?.totalCents ?? 0;

  const handleSubmit = useCallback(
    async (input: ClaimSubmitInput): Promise<ClaimSubmitResult> => {
      try {
        const res = await fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json();

        if (!res.ok) {
          return { ok: false, error: data.error ?? "Something went wrong." };
        }

        const claim = data as ClaimResponse;
        setEntrantId(claim.entrant.id);
        void mutate({ leaderboard: claim.leaderboard }, { revalidate: false });

        if (clearTimer.current) clearTimeout(clearTimer.current);
        setJustMovedId(claim.entrant.id);
        clearTimer.current = setTimeout(() => setJustMovedId(null), 2600);

        show({
          title: claim.entrant.rank === 1 ? "You're #1" : `You're now #${claim.entrant.rank}`,
          description: `${formatCents(claim.paymentCents)} claimed · total ${formatCents(claim.entrant.totalCents)}`,
          variant: "success",
        });

        if (claim.entrant.rank <= 3) fireConfetti();

        return { ok: true };
      } catch {
        return { ok: false, error: "Network error — please try again." };
      }
    },
    [mutate, setEntrantId, show],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onClaim={() => setDialogOpen(true)} />

      <Hero
        entrantCount={leaderboard.length}
        totalPooledCents={totalPooledCents}
        topAmountCents={topAmountCents}
        onClaim={() => setDialogOpen(true)}
      />

      <main id="leaderboard" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:px-6">
        {leaderboard.length === 0 ? (
          <div className="card rounded-[var(--radius-lg)] px-6 py-16 text-center">
            <p className="text-[16px] font-medium text-foreground">
              The leaderboard is empty.
            </p>
            <p className="mt-1 text-[14px] text-foreground-muted">
              Be the first to claim a rank.
            </p>
          </div>
        ) : (
          <LeaderboardList entries={leaderboard} justMovedId={justMovedId} />
        )}
      </main>

      <Footer />

      <ClaimSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leaderboard={leaderboard}
        myEntrantId={entrantId}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
