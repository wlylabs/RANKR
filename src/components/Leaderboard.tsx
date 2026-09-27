"use client";

import clsx from "clsx";
import { RefreshCw, Search, Trophy } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { chainMeta } from "@/lib/chains";
import { useNow, useTokens } from "@/lib/hooks";
import type { TokenView } from "@/lib/types";
import { ListSkeleton, TokenRow, TokenTable } from "./TokenList";

const SORTS = {
  top: { label: "Top gainers", fn: (a: TokenView, b: TokenView) => b.multiple - a.multiple },
  peak: { label: "Peak x", fn: (a: TokenView, b: TokenView) => b.peakMultiple - a.peakMultiple },
  losers: { label: "Biggest dumps", fn: (a: TokenView, b: TokenView) => a.multiple - b.multiple },
  new: { label: "Newest", fn: (a: TokenView, b: TokenView) => b.firstPastedAt - a.firstPastedAt },
  hot: { label: "Most pasted", fn: (a: TokenView, b: TokenView) => b.pasteCount - a.pasteCount || b.lastPastedAt - a.lastPastedAt },
} as const;
type SortKey = keyof typeof SORTS;

const RANGES = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: Infinity } as const;
type RangeKey = keyof typeof RANGES;

const PAGE = 50;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "h-8 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition",
        active ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function Leaderboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { tokens, isLoading, updatedAt, mutate } = useTokens();
  const now = useNow(15_000);

  const sort: SortKey = (params.get("sort") as SortKey) in SORTS ? (params.get("sort") as SortKey) : "top";
  const range: RangeKey = (params.get("range") as RangeKey) in RANGES ? (params.get("range") as RangeKey) : "all";
  const chain = params.get("chain") ?? "all";
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setLimit(PAGE);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const chains = useMemo(() => [...new Set(tokens.map((t) => t.chainId))].sort(), [tokens]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\$/, "");
    return tokens
      .filter((t) => now - t.firstPastedAt <= RANGES[range])
      .filter((t) => chain === "all" || t.chainId === chain)
      .filter(
        (t) =>
          !q ||
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      )
      .sort(SORTS[sort].fn);
  }, [tokens, now, range, chain, query, sort]);

  const visible = rows.slice(0, limit);
  const loading = isLoading && !tokens.length;

  return (
    <div className="pt-6 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Trophy className="size-6 text-gold sm:size-7" /> Leaderboard
          </h1>
          <p className="mt-1 text-sm text-muted">Every token ranked by how it moved since the first paste on Rankr.</p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-fg"
          title="Refresh now"
        >
          <RefreshCw className={clsx("size-3.5", isLoading && "animate-spin")} />
          {updatedAt ? `Updated ${Math.max(0, Math.round((now - updatedAt) / 1000))}s ago` : "Loading"}
        </button>
      </div>

      <div className="scrollbar-none -mx-4 mt-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <Chip key={key} active={sort === key} onClick={() => setParam("sort", key, "top")}>
            {SORTS[key].label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-ring/70 sm:max-w-xs">
          <Search className="size-4 text-subtle" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search $ticker, name or CA"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
        </label>
        <div className="flex items-center gap-2">
          <div className="flex h-10 items-center rounded-xl border border-border bg-surface p-1">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setParam("range", key, "all")}
                aria-pressed={range === key}
                className={clsx(
                  "h-full rounded-lg px-2.5 text-xs font-semibold uppercase transition",
                  range === key ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
                )}
              >
                {key}
              </button>
            ))}
          </div>
          <select
            value={chain}
            onChange={(e) => setParam("chain", e.target.value, "all")}
            aria-label="Chain"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none sm:flex-none"
          >
            <option value="all">All chains</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                {chainMeta(c).name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-2">
            <ListSkeleton rows={8} />
          </div>
        ) : !rows.length ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <p className="font-semibold">No tokens match</p>
            <p className="mt-1 text-sm text-muted">
              {tokens.length ? "Try another range, chain or search." : "Nobody has pasted a CA yet. Be the first."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <TokenTable tokens={visible} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-1.5 md:hidden">
              {visible.map((t, i) => (
                <TokenRow key={t.id} token={t} rank={i + 1} meta={sort === "peak" ? "peak" : "pasted"} />
              ))}
            </div>
            {rows.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="mt-4 h-11 w-full rounded-xl border border-border text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
              >
                Show more ({rows.length - limit} left)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
