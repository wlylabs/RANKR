"use client";

import clsx from "clsx";
import { ChevronDown, RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { chainMeta } from "@/lib/chains";
import { useNow, useStats, useTokenPages } from "@/lib/hooks";
import { parseCallerSort, parseRange, parseSort, type RangeKey, type SortKey } from "@/lib/params";
import { nextResetAt, resetDay, untilLabel } from "@/lib/season";
import { accountsAvailable } from "@/lib/supabase-browser";
import { CALLER_SORT_LABELS, CallersBoard } from "./CallersBoard";
import { StageLights } from "./Backdrops";
import { Cascade } from "./Cinema";
import { LastMonth } from "./LastMonth";
import { PageHeader } from "./PageHeader";
import { Segmented, TabBar } from "./Tabs";
import { ListSkeleton, TokenRow, TokenTable } from "./TokenList";

const SORT_LABELS: Record<SortKey, string> = {
  top: "Top gainers",
  peak: "Peak x",
  losers: "Biggest dumps",
  new: "Newest",
  hot: "Most pasted",
};

// With the monthly reset, everything on the board is from this month.
const RANGE_LABELS: Record<RangeKey, string> = { "24h": "24h", "7d": "7d", all: accountsAvailable ? "month" : "all" };

const PAGE = 50;

const BOARDS = { tokens: "Tokens", callers: "Callers" } as const;
type Board = keyof typeof BOARDS;

// The boards reset on the 1st (see season.ts): this month is live, last month is its kept top 10.
const MONTHS = { this: "This month", last: "Last month" } as const;
type Month = keyof typeof MONTHS;

const DESCRIPTIONS: Record<Month, Record<Board, string>> = {
  this: {
    tokens: "Every token ranked by how it moved since its first paste on Rankr.",
    callers: "Callers ranked by how often their calls hit 2x, each from the caller's own entry.",
  },
  last: {
    tokens: "Last month's top 10 tokens by peak x, kept when the boards reset.",
    callers: "Last month's top 10 callers by hit rate, kept when the boards reset.",
  },
};

export function Leaderboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow(15_000);

  // Boards and months need accounts (callers, and the reset runs in Supabase). "view=last" is the old link
  // to last month.
  const view = params.get("view");
  const board: Board = accountsAvailable && view === "callers" ? "callers" : "tokens";
  const month: Month = accountsAvailable && (params.get("month") === "last" || view === "last") ? "last" : "this";
  const resetsAt = nextResetAt(now);
  const sort = parseSort(params.get("sort"));
  const callerSort = parseCallerSort(params.get("by"));
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

  /** Another board or month starts from its default sort and filters. */
  function go(to: { board?: Board; month?: Month }) {
    const next = new URLSearchParams();
    if ((to.board ?? board) !== "tokens") next.set("view", to.board ?? board);
    if ((to.month ?? month) !== "this") next.set("month", to.month ?? month);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const loading = isLoading && !tokens.length;

  return (
    <div className="pt-10 sm:pt-14">
      <PageHeader title="Leaderboard" backdrop={<StageLights />}>
        {DESCRIPTIONS[month][board]}
      </PageHeader>

      {accountsAvailable && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Month" options={MONTHS} value={month} onChange={(m) => go({ month: m })} />
          <Segmented label="Board" options={BOARDS} value={board} onChange={(b) => go({ board: b })} />
        </div>
      )}
      {month === "this" && (
        <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-subtle">
          {/* Resets run in Supabase (rankr_end_month), so only where accounts are on. */}
          {accountsAvailable && (
            <p>
              resets {resetDay(resetsAt)}, 00:00 UTC · in <span className="text-fg">{untilLabel(resetsAt, now)}</span>
            </p>
          )}
          {board === "tokens" && (
            <button
              type="button"
              onClick={() => mutate()}
              className="ml-auto inline-flex items-center gap-1.5 hover:text-fg"
              title="Refresh now"
            >
              <RefreshCw className={clsx("size-3", isValidating && "animate-spin")} />
              {updatedAt ? `updated ${Math.max(0, Math.round((now - updatedAt) / 1000))}s ago` : "loading"}
            </button>
          )}
        </div>
      )}

      {month === "last" ? (
        <LastMonth board={board} />
      ) : board === "callers" ? (
        <>
          <TabBar
            label="Sort callers"
            options={CALLER_SORT_LABELS}
            value={callerSort}
            onChange={(key) => setParam("by", key, "rate")}
            className="mt-6"
          />
          <CallersBoard sort={callerSort} />
        </>
      ) : (
        <>
          <TabBar
            label="Sort tokens"
            options={SORT_LABELS}
            value={sort}
            onChange={(key) => setParam("sort", key, "top")}
            className="mt-6"
          />

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
              <Segmented
                label="Range"
                pressed
                options={RANGE_LABELS}
                value={range}
                onChange={(key) => setParam("range", key, "all")}
                className="h-9"
                optionClassName="px-2.5 font-mono text-[11px] uppercase"
              />
              {/* The native picker (best on phones), styled like the other controls. */}
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <select
                  value={chain}
                  onChange={(e) => setParam("chain", e.target.value, "all")}
                  aria-label="Chain"
                  className="h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-bg pr-8 pl-3 text-sm text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:border-border-strong sm:w-auto"
                >
                  <option value="all">All chains</option>
                  {chains.map((c) => (
                    <option key={c} value={c}>
                      {chainMeta(c).name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle" />
              </div>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="card">
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
                <Cascade className="divide-y divide-border overflow-hidden card md:hidden">
                  {tokens.map((t, i) => (
                    <TokenRow key={t.id} token={t} rank={i + 1} meta={sort === "peak" ? "peak" : "pasted"} />
                  ))}
                </Cascade>
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
            {!q && (
              <p className="mt-3 font-mono text-[11px] text-subtle">
                tokens down 70%+ from their first paste are left off the board · search still finds them
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
