"use client";

import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useFeed, useStats } from "@/lib/hooks";
import { useAuth } from "./AuthProvider";
import { Cascade, HashField } from "./Cinema";
import { CountUp } from "./CountUp";
import { FeedRow } from "./Feed";
import { LiveDot } from "./PageHeader";
import { PasteBox } from "./PasteBox";
import { ListSkeleton } from "./TokenList";

const PANEL_ROWS = 5;

/**
 * The top of the app's home. Signed out: the hero (`hero`). Signed in: the paste box. Until the session is
 * read it isn't known which, and a returning caller shouldn't see the hero flash, so the paste box shows (it
 * works either way).
 */
export function HomeTop({ hero }: { hero: ReactNode }) {
  const { ready, userId } = useAuth();
  if (ready && !userId) return hero;
  return (
    <section className="relative isolate mx-auto max-w-2xl pt-8 pb-10 sm:pt-12 sm:pb-12">
      <HashField />
      <div id="paste">
        <PasteBox resumeFromUrl />
      </div>
    </section>
  );
}

/** "● 128 tokens tracked" above the hero headline. */
export function LiveStatus() {
  const { stats } = useStats();
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted">
      <LiveDot />
      <span className="tabular">{stats ? <CountUp value={stats.total} /> : "…"}</span>
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
    <section className="min-w-0 overflow-hidden card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <Link href={href} className="text-xs text-muted hover:text-fg">
          View all
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ children = "Nothing here yet. Paste the first CA above." }: { children?: ReactNode }) {
  return <div className="px-4 py-12 text-center text-sm text-muted">{children}</div>;
}

/** Tracked / hit 2x+ / best run / in the red, over every token tracked. */
function StatsGrid() {
  const { stats } = useStats();
  const best = stats?.best ?? null;
  const pct = (n: number) => (stats?.total ? `${Math.round((n / stats.total) * 100)}% of all pastes` : "—");

  return (
    <div className="grid grid-cols-2 divide-border card max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x">
      <Stat label="Tracked" value={stats ? <CountUp value={stats.total} /> : "…"} hint="tokens since first paste" />
      <Stat
        label="Hit 2x+"
        value={stats ? <CountUp value={stats.doubled} /> : "…"}
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
        value={
          stats ? (
            <span className={clsx(stats.inRed && "text-down")}>
              <CountUp value={stats.inRed} />
            </span>
          ) : (
            "…"
          )
        }
        hint="below entry right now"
      />
    </div>
  );
}

/** The newest feed entries of one kind, calls or milestones. */
function FeedPanel({ kind, title, empty }: { kind: "call" | "milestone"; title: string; empty?: ReactNode }) {
  const { items, isLoading } = useFeed({ kind }, PANEL_ROWS);
  return (
    <Panel title={title} href={`/feed?kind=${kind}`}>
      {isLoading ? (
        <ListSkeleton rows={PANEL_ROWS} />
      ) : items.length ? (
        <Cascade className="divide-y divide-border">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </Cascade>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Panel>
  );
}

export function HomeFeed() {
  const { stats, error } = useStats();

  return (
    <div className="space-y-6">
      {error && !stats && (
        <p className="flex items-center gap-2 text-sm text-down">
          <TriangleAlert className="size-4" /> Couldn&apos;t load the stats. Retrying…
        </p>
      )}

      <StatsGrid />

      <div className="grid gap-6 lg:grid-cols-2">
        <FeedPanel kind="call" title="Latest calls" />
        <FeedPanel kind="milestone" title="Milestones" empty="No call has hit 2x yet." />
      </div>
    </div>
  );
}
