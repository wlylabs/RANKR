"use client";

import { ArrowRight, Clock, Flame, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useTokens } from "@/lib/hooks";
import type { TokenView } from "@/lib/types";
import { ListSkeleton, TokenRow } from "./TokenList";

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-xs font-medium text-subtle">{label}</div>
      <div className="tabular mt-1.5 truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Panel({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon: ReactNode;
  href: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-2 sm:p-3">
      <div className="flex items-center justify-between px-2 pt-1 pb-2 sm:px-3">
        <h2 className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          See all <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <div className="px-3 py-10 text-center text-sm text-muted">
      Nothing here yet. Paste the first CA above.
    </div>
  );
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
        <p className="flex items-center gap-2 rounded-xl bg-down-soft px-3 py-2.5 text-sm text-down">
          <TriangleAlert className="size-4" /> Couldn&apos;t load the board. Retrying…
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tokens tracked" value={loading ? "…" : tokens.length.toLocaleString("en-US")} hint="since first paste" />
        <Stat
          label="Hit 2x or more"
          value={loading ? "…" : hit2x.toLocaleString("en-US")}
          hint={tokens.length ? `${Math.round((hit2x / tokens.length) * 100)}% of all pastes` : "—"}
        />
        <Stat
          label="Best run"
          value={
            best ? (
              <Link href={tokenHref(best)} className="text-gold hover:underline">
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
          value={loading ? "…" : <span className={red ? "text-down" : undefined}>{red.toLocaleString("en-US")}</span>}
          hint="below entry right now"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top runners" icon={<Flame className="size-4 text-gold" />} href="/leaderboard">
          {loading ? <ListSkeleton /> : top.length ? top.map((t, i) => <TokenRow key={t.id} token={t} rank={i + 1} meta="peak" />) : <Empty />}
        </Panel>
        <Panel title="Just pasted" icon={<Clock className="size-4 text-muted" />} href="/leaderboard?sort=new">
          {loading ? <ListSkeleton /> : latest.length ? latest.map((t) => <TokenRow key={t.id} token={t} />) : <Empty />}
        </Panel>
      </div>
    </div>
  );
}
