"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { formatUsd, tokenHref } from "@/lib/format";
import { useLastSeason, useNow } from "@/lib/hooks";
import { monthLabel, nextResetAt, resetDay } from "@/lib/season";
import { CallerRateRow } from "./CallersBoard";
import { ChainTag } from "./Chain";
import { Cascade } from "./Cinema";
import { MultipleBadge } from "./MultipleBadge";
import { ListSkeleton, TokenName } from "./TokenList";

const rank = (i: number) => String(i + 1).padStart(2, "0");

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="label text-subtle">{title}</h2>
      {children.length ? (
        <Cascade className="mt-2 divide-y divide-border overflow-hidden card">{children}</Cascade>
      ) : (
        <p className="mt-2 card px-4 py-6 text-center text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}

/** The last month's top 10 callers or tokens, kept when the boards reset on the 1st (see rankr_end_month). */
export function LastMonth({ board }: { board: "tokens" | "callers" }) {
  const { season, isLoading } = useLastSeason();
  const next = nextResetAt(useNow(60_000));

  if (isLoading) {
    return (
      <div className="mt-6 card">
        <ListSkeleton rows={6} />
      </div>
    );
  }
  if (!season) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Trophy className="mx-auto size-5 text-subtle" />
        <p className="mt-3 font-medium">No month has ended yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          On {resetDay(next)} at 00:00 UTC the boards start from zero, and the month&apos;s top 10 callers and tokens are
          kept here.
        </p>
      </div>
    );
  }

  const { counts } = season;
  return (
    <div className="mt-6">
      <p className="font-mono text-[11px] text-subtle">
        <span className="text-muted">{monthLabel(season.month)}</span> · {counts.calls.toLocaleString("en-US")} calls on{" "}
        {counts.tokens.toLocaleString("en-US")} tokens by {counts.callers.toLocaleString("en-US")} callers
      </p>
      <div className="mt-4">
        {board === "callers" ? (
          <List title="Top callers" empty="Nobody had the 5 calls a hit rate needs.">
            {season.callers.map((c, i) => (
              <CallerRateRow key={c.userId} c={c} rank={i + 1} />
            ))}
          </List>
        ) : (
          <List title="Top tokens" empty="No tokens that month.">
            {season.tokens.map((t, i) => (
              <Link key={t.id} href={tokenHref(t)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="tabular w-5 shrink-0 font-mono text-xs text-subtle">{rank(i)}</span>
                <div className="min-w-0 flex-1">
                  <TokenName symbol={t.symbol} name={t.name} />
                  <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
                    <ChainTag chainId={t.chainId} /> · entry {formatUsd(t.entryMarketCap)}
                    {t.firstCaller && <> · first call @{t.firstCaller}</>}
                  </div>
                </div>
                <span className="flex items-baseline gap-1">
                  <span className="font-mono text-[10px] text-subtle">peak</span>
                  <MultipleBadge multiple={t.peakMultiple} />
                </span>
              </Link>
            ))}
          </List>
        )}
      </div>
    </div>
  );
}
