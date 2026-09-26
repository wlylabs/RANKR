"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RankBadge } from "@/components/rank-badge";
import { formatCents } from "@/lib/format";
import type { LeaderboardEntry } from "@/types";

const PRESET_DOLLARS = [5, 10, 25, 50];

export interface ClaimSubmitInput {
  entrantId?: string;
  displayName: string;
  amount: number;
}

export type ClaimSubmitResult = { ok: true } | { ok: false; error: string };

interface ClaimSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaderboard: LeaderboardEntry[];
  myEntrantId: string | null;
  onSubmit: (input: ClaimSubmitInput) => Promise<ClaimSubmitResult>;
}

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

export function ClaimSheet({
  open,
  onOpenChange,
  leaderboard,
  myEntrantId,
  onSubmit,
}: ClaimSheetProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the dialog transitions to open, without an
  // effect — adjusting state during render per React's own guidance.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setAmount("");
      setError(null);
    }
  }

  const myEntry = useMemo(
    () => leaderboard.find((entry) => entry.id === myEntrantId) ?? null,
    [leaderboard, myEntrantId],
  );
  const topEntry = leaderboard[0] ?? null;

  const takeFirstCents = useMemo(() => {
    if (!topEntry || myEntry?.rank === 1) return null;
    const needed = topEntry.totalCents + 100 - (myEntry?.totalCents ?? 0);
    return Math.max(needed, 100);
  }, [topEntry, myEntry]);

  const parsedAmount = Number.parseFloat(amount || "0");
  const isValid = Number.isFinite(parsedAmount) && parsedAmount >= 1;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;
    if (!myEntry && name.trim().length < 2) {
      setError("Enter your name — at least 2 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await onSubmit({
      entrantId: myEntry?.id,
      displayName: myEntry?.displayName ?? name.trim(),
      amount: parsedAmount,
    });

    setSubmitting(false);

    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6">
        <DialogTitle className="text-[18px] font-semibold text-foreground">
          {myEntry ? "Add to Your Rank" : "Claim Your Rank"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] text-foreground-muted">
          {myEntry
            ? "Every dollar you add pushes you higher. Outbid the entrant above you."
            : "Enter the leaderboard with a contribution. The more you give, the higher you rank."}
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
          {myEntry ? (
            <div className="card flex items-center gap-3 rounded-[var(--radius-md)] p-3">
              <RankBadge rank={myEntry.rank} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-foreground">
                  {myEntry.displayName}
                </p>
                <p className="tabular text-[13px] text-foreground-subtle">
                  Currently #{myEntry.rank} · {formatCents(myEntry.totalCents)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="claim-name" className="text-[13px] font-medium text-foreground-muted">
                Your name
              </label>
              <Input
                id="claim-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Alex Rivera"
                maxLength={40}
                autoComplete="off"
                autoFocus
              />
            </div>
          )}

          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 py-5">
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-semibold text-foreground-subtle">$</span>
              <input
                value={amount}
                onChange={(event) => setAmount(sanitizeAmount(event.target.value))}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount in dollars"
                className="tabular w-[9ch] bg-transparent text-center text-[42px] font-bold leading-none text-foreground outline-none placeholder:text-foreground-subtle/30"
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 px-4">
              {PRESET_DOLLARS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="rounded-full border border-border px-3 py-1 text-[12.5px] font-medium text-foreground-muted transition-all duration-150 hover:border-border-strong hover:text-foreground active:scale-[0.94]"
                >
                  ${preset}
                </button>
              ))}
              {takeFirstCents && (
                <button
                  type="button"
                  onClick={() => setAmount((takeFirstCents / 100).toFixed(2))}
                  className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-[12.5px] font-medium accent-text transition-all duration-150 hover:brightness-95 active:scale-[0.94]"
                >
                  Take #1 — {formatCents(takeFirstCents)}
                </button>
              )}
            </div>
          </div>

          {error && <p className="text-[13px] text-negative">{error}</p>}

          <div className="flex items-center gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="flex-1">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!isValid || submitting} className="flex-1">
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing
                </>
              ) : (
                "Claim Rank"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
