"use client";

import clsx from "clsx";
import { RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { chainMeta } from "@/lib/chains";
import { useNow, useStats, useTokenPages } from "@/lib/hooks";
import { parseRange, parseSort, RANGES, SORT_KEYS, type RangeKey, type SortKey } from "@/lib/params";
import { ListSkeleton, TokenRow, TokenTable } from "./TokenList";

const SORT_LABELS: Record<SortKey, string> = {
  top: "Top gainers",
  peak: "Peak x",
  losers: "Biggest dumps",
  new: "Newest",
  hot: "Most pasted",
};

const PAGE = 50;

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={clsx(
        "relative h-10 shrink-0 text-sm whitespace-nowrap transition-colors",
        active ? "text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-fg" : "text-muted hover:text-fg",
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
  const now = useNow(15_000);

  const sort = parseSort(params.get("sort"));
  const range = parseRange(params.get("range"));
  const chain = params.get("chain") ?? "all";
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");

  // Search waits for a pause in typing before hitting the server.
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim().replace(/^\$/, "")), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { tokens, total, isLoading, isValidating, updatedAt, loadMore, mutate } = useTokenPages(
    { sort, range, chain: chain === "all" ? null : chain, q: q || null },
    PAGE,
  );
  const chains = useStats().stats?.chains ?? [];

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const loading = isLoading && !tokens.length;

  return (
    <div className="pt-10 sm:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Leaderboard</h1>
          <p className="mt-1.5 text-sm text-muted">Every token ranked by how it moved since its first paste on Rankr.</p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-subtle hover:text-fg"
          title="Refresh now"
        >
          <RefreshCw className={clsx("size-3", isValidating && "animate-spin")} />
          {updatedAt ? `updated ${Math.max(0, Math.round((now - updatedAt) / 1000))}s ago` : "loading"}
        </button>
      </div>

      <div className="scrollbar-none -mx-4 mt-6 flex gap-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0" role="tablist">
        {SORT_KEYS.map((key) => (
          <Tab key={key} active={sort === key} onClick={() => setParam("sort", key, "top")}>
            {SORT_LABELS[key]}
          </Tab>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex h-9 w-full items-center gap-2 rounded-md border border-border px-3 transition-colors focus-within:border-border-strong sm:max-w-xs">
          <Search className="size-3.5 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker, name or address"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="flex h-9 items-center rounded-md border border-border p-0.5">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setParam("range", key, "all")}
                aria-pressed={range === key}
                className={clsx(
                  "h-full rounded px-2.5 font-mono text-[11px] uppercase transition-colors",
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
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 text-sm outline-none sm:flex-none"
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
          <div className="rounded-lg border border-border">
            <ListSkeleton rows={8} />
          </div>
        ) : !tokens.length ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <p className="font-medium">No tokens match</p>
            <p className="mt-1 text-sm text-muted">
              {q || range !== "all" || chain !== "all"
                ? "Try another range, chain or search."
                : "Nobody has pasted a CA yet. Be the first."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <TokenTable tokens={tokens} />
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border md:hidden">
              {tokens.map((t, i) => (
                <TokenRow key={t.id} token={t} rank={i + 1} meta={sort === "peak" ? "peak" : "pasted"} />
              ))}
            </div>
            {total > tokens.length && (
              <button
                type="button"
                onClick={() => loadMore()}
                disabled={isValidating}
                className="mt-4 h-10 w-full rounded-md border border-border text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Show more ({total - tokens.length} left)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
