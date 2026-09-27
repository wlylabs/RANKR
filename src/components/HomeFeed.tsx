"use client";

import clsx from "clsx";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useTokens } from "@/lib/hooks";
import type { TokenView } from "@/lib/types";
import { ListSkeleton, TokenRow } from "./TokenList";

/** "● LIVE · 128 tokens tracked" pill above the hero headline. */
export function LiveStatus() {
  const { tokens, isLoading } = useTokens();
  return (
    <span className="label inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-muted">
      <span className="size-1.5 rounded-full bg-up" />
      Live
      <span className="text-subtle">/</span>
      <span className="tabular">{isLoading && !tokens.length ? "…" : tokens.length.toLocaleString("en-US")}</span>
      tokens tracked
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <div className="label text-subtle">{label}</div>
      <div className="tabular mt-2 truncate font-pixel text-3xl leading-none sm:text-4xl">{value}</div>
      {hint && <div className="mt-2 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="label text-muted">{title}</h2>
        <Link href={href} className="label inline-flex items-center gap-1 text-subtle hover:text-fg">
          See all <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="p-1.5">{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="px-3 py-10 text-center text-sm text-muted">Nothing here yet. Paste the first CA above.</div>;
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
    <div className="space-y-4">
      {error && !tokens.length && (
        <p className="flex items-center gap-2 rounded-lg bg-down-soft px-3 py-2.5 text-sm text-down">
          <TriangleAlert className="size-4" /> Couldn&apos;t load the board. Retrying…
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
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

      <div className="grid gap-4 lg:grid-cols-2">
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
