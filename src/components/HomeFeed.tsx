"use client";

import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useStats, useTokens } from "@/lib/hooks";
import { ListSkeleton, TokenRow } from "./TokenList";

/** "● 128 tokens tracked" above the hero headline. */
export function LiveStatus() {
  const { stats } = useStats();
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-50" />
        <span className="relative inline-flex size-1.5 rounded-full bg-up" />
      </span>
      <span className="tabular">{stats ? stats.total.toLocaleString("en-US") : "…"}</span>
      tokens tracked live
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border-border px-4 py-5 sm:px-6">
      <div className="label text-subtle">{label}</div>
      <div className="tabular mt-2 truncate font-mono text-2xl font-medium tracking-tight sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <Link href={href} className="text-xs text-muted hover:text-fg">
          View all
        </Link>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="px-4 py-12 text-center text-sm text-muted">Nothing here yet. Paste the first CA above.</div>;
}

/** Tracked / hit 2x+ / best run / in the red, for the whole board. */
function StatsGrid() {
  const { stats } = useStats();
  const best = stats?.best ?? null;
  const pct = (n: number) => (stats?.total ? `${Math.round((n / stats.total) * 100)}% of all pastes` : "—");

  return (
    <div className="grid grid-cols-2 divide-border rounded-lg border border-border max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x">
      <Stat label="Tracked" value={stats ? stats.total.toLocaleString("en-US") : "…"} hint="tokens since first paste" />
      <Stat
        label="Hit 2x+"
        value={stats ? stats.doubled.toLocaleString("en-US") : "…"}
        hint={stats ? pct(stats.doubled) : "—"}
      />
      <Stat
        label="Best run"
        value={
          best ? (
            <Link href={tokenHref(best)} className="text-up hover:underline">
              {formatMultiple(best.peakMultiple)}
            </Link>
          ) : (
            "—"
          )
        }
        hint={best ? `$${best.symbol} peak since paste` : "no tokens yet"}
      />
      <Stat
        label="In the red"
        value={stats ? <span className={clsx(stats.inRed && "text-down")}>{stats.inRed.toLocaleString("en-US")}</span> : "…"}
        hint="below entry right now"
      />
    </div>
  );
}

export function HomeFeed() {
  const { stats, error } = useStats();
  const top = useTokens({ sort: "top", limit: 6 });
  const latest = useTokens({ sort: "new", limit: 6 });

  return (
    <div className="space-y-6">
      {error && !stats && (
        <p className="flex items-center gap-2 text-sm text-down">
          <TriangleAlert className="size-4" /> Couldn&apos;t load the board. Retrying…
        </p>
      )}

      <StatsGrid />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top runners" href="/leaderboard">
          {top.isLoading ? (
            <ListSkeleton />
          ) : top.tokens.length ? (
            top.tokens.map((t, i) => <TokenRow key={t.id} token={t} rank={i + 1} meta="peak" />)
          ) : (
            <Empty />
          )}
        </Panel>
        <Panel title="Just pasted" href="/leaderboard?sort=new">
          {latest.isLoading ? (
            <ListSkeleton />
          ) : latest.tokens.length ? (
            latest.tokens.map((t) => <TokenRow key={t.id} token={t} />)
          ) : (
            <Empty />
          )}
        </Panel>
      </div>
    </div>
  );
}
