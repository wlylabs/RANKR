"use client";

import clsx from "clsx";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useTokens } from "@/lib/hooks";
import type { TokenView } from "@/lib/types";
import { ListSkeleton, TokenRow } from "./TokenList";

/** "● 128 tokens tracked" above the hero headline. */
export function LiveStatus() {
  const { tokens, isLoading } = useTokens();
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-50" />
        <span className="relative inline-flex size-1.5 rounded-full bg-up" />
      </span>
      <span className="tabular">{isLoading && !tokens.length ? "…" : tokens.length.toLocaleString("en-US")}</span>
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
        <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          View all <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="px-4 py-12 text-center text-sm text-muted">Nothing here yet. Paste the first CA above.</div>;
}

export function HomeFeed() {
  const { tokens, isLoading, error } = useTokens();

  const top = [...tokens].sort((a, b) => b.multiple - a.multiple).slice(0, 6);
  const latest = [...tokens].sort((a, b) => b.firstPastedAt - a.firstPastedAt).slice(0, 6);
  const best = tokens.reduce<TokenView | null>((acc, t) => (!acc || t.peakMultiple > acc.peakMultiple ? t : acc), null);
  const hit2x = tokens.filter((t) => t.peakMultiple >= 2).length;
  const red = tokens.filter((t) => t.multiple < 1).length;
  const loading = isLoading && !tokens.length;

  return (
    <div className="space-y-6">
      {error && !tokens.length && (
        <p className="flex items-center gap-2 text-sm text-down">
          <TriangleAlert className="size-4" /> Couldn&apos;t load the board. Retrying…
        </p>
      )}

      <div className="grid grid-cols-2 divide-border rounded-lg border border-border max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x">
        <Stat label="Tracked" value={loading ? "…" : tokens.length.toLocaleString("en-US")} hint="tokens since first paste" />
        <Stat
          label="Hit 2x+"
          value={loading ? "…" : hit2x.toLocaleString("en-US")}
          hint={tokens.length ? `${Math.round((hit2x / tokens.length) * 100)}% of all pastes` : "—"}
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
          value={loading ? "…" : <span className={clsx(red && "text-down")}>{red.toLocaleString("en-US")}</span>}
          hint="below entry right now"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top runners" href="/leaderboard">
          {loading ? <ListSkeleton /> : top.length ? top.map((t, i) => <TokenRow key={t.id} token={t} rank={i + 1} meta="peak" />) : <Empty />}
        </Panel>
        <Panel title="Just pasted" href="/leaderboard?sort=new">
          {loading ? <ListSkeleton /> : latest.length ? latest.map((t) => <TokenRow key={t.id} token={t} />) : <Empty />}
        </Panel>
      </div>
    </div>
  );
}
