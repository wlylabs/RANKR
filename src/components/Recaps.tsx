"use client";

import { CalendarDays, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useAccountCalls, useNow, useRecaps } from "@/lib/hooks";
import { monthLabel, nextResetAt, resetDay } from "@/lib/reset";
import type { Recap } from "@/lib/types";
import { ChainTag } from "./Chain";
import { Cascade } from "./Cinema";
import { toneOf } from "./MultipleBadge";
import { ListSkeleton, TokenName } from "./TokenList";

const pct = (n: number, of: number) => `${Math.round((n / Math.max(of, 1)) * 100)}%`;

/** Your past months, one recap each: kept when Rankr resets on the 1st, seen by you alone. */
export function Recaps({ userId }: { userId: string }) {
  const { data, error, isLoading, mutate } = useRecaps(userId);
  const recaps = data?.recaps ?? [];
  // This month, "2026-10-01": a recap of it was kept early, by a reset run by hand.
  const thisMonth = new Date(useNow(60_000)).toISOString().slice(0, 7) + "-01";

  // The reset clears the calls right after it writes the recaps: when yours go from some to none, ask again,
  // whenever that happens (on time, a little after midnight, or by hand later on).
  const calls = useAccountCalls(userId).data?.calls.length;
  const hadCalls = useRef(false);
  useEffect(() => {
    if (calls === undefined) return;
    if (hadCalls.current && calls === 0) void mutate();
    hadCalls.current = calls > 0;
  }, [calls, mutate]);

  return (
    <div className="mt-4">
      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-subtle" />
        <span>
          Only you see these. When Rankr resets on the 1st, your calls are cleared and the month is kept here: where
          your calls stood when it ended, each from your own entry, and the highest milestone one reached during it.
        </span>
      </p>
      {isLoading && !data ? (
        <div className="mt-6 card">
          <ListSkeleton rows={3} />
        </div>
      ) : error && !data ? (
        <p className="mt-6 text-sm text-down">Couldn&apos;t load your recaps. Try again in a moment.</p>
      ) : !recaps.length ? (
        <div className="mt-6 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <CalendarDays className="mx-auto size-5 text-subtle" />
          <p className="mt-3 font-medium">No recaps yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Your first is kept when Rankr resets on {resetDay(nextResetAt())}, 00:00 UTC, if you have calls this month.
          </p>
        </div>
      ) : (
        <Cascade className="mt-6 space-y-3">
          {recaps.map((r) => (
            <RecapCard key={r.month} recap={r} soFar={r.month === thisMonth} />
          ))}
        </Cascade>
      )}
    </div>
  );
}

/** `soFar`: the month isn't over (a reset run by hand kept it early), so its numbers are as of then. */
function RecapCard({ recap: r, soFar }: { recap: Recap; soFar: boolean }) {
  const when = soFar ? "when kept" : "at month end";
  return (
    <article className="overflow-hidden card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">{monthLabel(r.month)}</h2>
        <span className="tabular font-mono text-[11px] text-subtle">
          {soFar && "so far · "}
          {r.calls} {r.calls === 1 ? "call" : "calls"}
        </span>
      </header>
      <dl className="grid grid-cols-2 sm:grid-cols-4 max-sm:[&>*:nth-child(-n+2)]:border-b max-sm:[&>*:nth-child(even)]:border-l sm:divide-x sm:divide-border">
        <Stat label="Hit rate" value={pct(r.hits, r.calls)} hint={`${r.hits} of ${r.calls} at 2x+ ${when}`} />
        <Stat label="In profit" value={pct(r.wins, r.calls)} hint={`${r.wins} of ${r.calls} above entry ${when}`} />
        <Stat
          label="Average"
          value={<span className={toneOf(r.avgMultiple, "text-fg")}>{formatMultiple(r.avgMultiple)}</span>}
          hint={`per call, ${when}`}
        />
        <Stat
          label="Top milestone"
          value={r.topTier ? <span className="text-up">{r.topTier}x</span> : "—"}
          hint={r.topTier ? (soFar ? "peak so far" : "peak during the month") : "no call reached 2x"}
        />
      </dl>
      {r.bestToken && (
        <Link
          href={tokenHref(r.bestToken)}
          className="flex items-center gap-3 border-t border-border px-4 py-3 transition-colors hover:bg-surface-2"
        >
          <span className="label shrink-0 text-subtle" title={`The call furthest up from your entry ${when}`}>
            Best call
          </span>
          <TokenName symbol={r.bestToken.symbol} name={r.bestToken.name} className="min-w-0 flex-1" />
          <ChainTag chainId={r.bestToken.chainId} className="max-sm:hidden" />
          <span className={`tabular shrink-0 font-mono text-sm ${toneOf(r.bestMultiple, "text-fg")}`}>
            {formatMultiple(r.bestMultiple)}
          </span>
        </Link>
      )}
    </article>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="border-border px-4 py-4">
      <dt className="label text-subtle">{label}</dt>
      <dd className="tabular mt-1.5 font-mono text-xl font-medium tracking-tight">{value}</dd>
      <dd className="mt-0.5 text-xs text-pretty text-muted">{hint}</dd>
    </div>
  );
}
