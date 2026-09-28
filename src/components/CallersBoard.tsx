"use client";

import clsx from "clsx";
import Link from "next/link";
import { behind } from "@/lib/caller-stats";
import { callerHref, formatMultiple, tokenHref } from "@/lib/format";
import { useCallerPages, useMyRank } from "@/lib/hooks";
import { MIN_CALLS_RANKED, minCallsFor, type CallerSort } from "@/lib/params";
import type { CallerView, MyRankResponse } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Avatar";
import { MultipleBadge } from "./MultipleBadge";
import { OfficialBadge } from "./OfficialBadge";
import { ListSkeleton } from "./TokenList";

export const CALLER_SORT_LABELS: Record<CallerSort, string> = {
  rate: "Hit rate",
  avg: "Avg x",
  hits: "2x hits",
  best: "Best call",
  calls: "Most calls",
};

/** Share of a caller's calls at 2x or more right now. */
function hitRate(c: Pick<CallerView, "calls" | "hits">) {
  return `${Math.round((c.hits / Math.max(c.calls, 1)) * 100)}%`;
}

const PAGE = 50;

function winRate(c: CallerView) {
  return `${Math.round((c.wins / Math.max(c.calls, 1)) * 100)}%`;
}

function Caller({ c, me }: { c: Pick<CallerView, "userId" | "username" | "official">; me: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link href={callerHref(c.username)} className="flex min-w-0 items-center gap-1 hover:underline">
        <Avatar userId={c.userId} size={20} className="mr-1" />
        <span className="truncate font-mono text-[13px]">@{c.username}</span>
        {c.official && <OfficialBadge />}
      </Link>
      {me && <span className="rounded border border-border px-1 font-mono text-[10px] text-muted">you</span>}
    </span>
  );
}

function BestCall({ c }: { c: CallerView }) {
  if (!c.bestToken) return <span className="text-subtle">—</span>;
  return (
    <Link href={tokenHref(c.bestToken)} className="hover:underline">
      <span className="font-sans font-medium">${c.bestToken.symbol}</span> <MultipleBadge multiple={c.bestMultiple} className="min-w-0" />
    </Link>
  );
}

const rankLabel = (rank: number) => String(rank).padStart(2, "0");

/** A compact caller row by hit rate: rank, name, and share of calls at 2x+ (last month's board, the home page). */
export function CallerRateRow({
  c,
  rank,
}: {
  c: Pick<CallerView, "userId" | "username" | "official" | "calls" | "hits">;
  rank: number;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="tabular w-5 shrink-0 font-mono text-xs text-subtle">{rankLabel(rank)}</span>
      <Link href={callerHref(c.username)} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
        <Avatar userId={c.userId} size={20} />
        <span className="truncate font-mono text-[13px]">@{c.username}</span>
        {c.official && <OfficialBadge />}
      </Link>
      <span className="text-right">
        <span className="tabular block font-mono text-[13px] font-medium">{hitRate(c)}</span>
        <span className="tabular block font-mono text-[10px] text-subtle">
          {c.hits}/{c.calls} at 2x+
        </span>
      </span>
    </div>
  );
}

/** The number on the right of a compact row. */
function SortValue({ sort, c }: { sort: CallerSort; c: CallerView }) {
  if (sort === "rate") return <span className="tabular font-mono text-[13px] font-medium">{hitRate(c)}</span>;
  return <MultipleBadge multiple={sort === "best" ? c.bestMultiple : c.avgMultiple} />;
}

/**
 * What to tell a caller about their place on the board for `sort`: how far the caller one place up is, or
 * what they still need to get on it. Null when there is nothing to say.
 */
export function rankLine(sort: CallerSort, { rank, caller, ahead, calls, total }: MyRankResponse): string | null {
  if (rank && caller) {
    if (!ahead) return `top of the board · ${total} ${total === 1 ? "caller" : "callers"}`;
    const gap = behind(sort, caller, ahead);
    return `${gap ? `${gap} behind` : "level with"} @${ahead.username} at #${rank - 1}`;
  }
  if (calls === 0) return "no calls this month yet · paste a CA to get on the board";
  const need = minCallsFor(sort) - calls;
  if (need <= 0) return null;
  return `${calls} ${calls === 1 ? "call" : "calls"} · ${need} more to be ranked by ${CALLER_SORT_LABELS[sort].toLowerCase()}`;
}

/**
 * The signed-in caller's place on the board, pinned to the bottom of the screen (above the bottom nav on
 * phones) while the board scrolls under it: their rank, and how far the caller one place up is.
 */
function MyRank({ sort }: { sort: CallerSort }) {
  const { userId, username, official } = useAuth();
  const mine = useMyRank(sort, userId);
  const line = mine && rankLine(sort, mine);
  if (!userId || !username || !mine || !line) return null;
  const { rank, caller, total } = mine;

  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mt-3 md:bottom-4">
      <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-bg/90 px-4 py-3 shadow-lg backdrop-blur-md">
        <span className="tabular w-6 shrink-0 font-mono text-xs text-fg" title={rank ? `#${rank} of ${total}` : "not ranked yet"}>
          {rank ? rankLabel(rank) : "—"}
        </span>
        <div className="min-w-0 flex-1">
          <Caller c={{ userId, username, official }} me />
          <p className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">{line}</p>
        </div>
        {caller && <SortValue sort={sort} c={caller} />}
      </div>
    </div>
  );
}

export function CallersBoard({ sort }: { sort: CallerSort }) {
  const { userId } = useAuth();
  const { callers, total, isLoading, isValidating, loadMore } = useCallerPages(sort, PAGE);
  const loading = isLoading && !callers.length;

  return (
    <div className="mt-4">
      {(sort === "avg" || sort === "rate") && (
        <p className="mb-3 font-mono text-[11px] text-subtle">
          {sort === "rate" ? "share of calls at 2x+ right now" : "average x"}, callers with {MIN_CALLS_RANKED}+ calls
        </p>
      )}
      {loading ? (
        <div className="rounded-lg border border-border">
          <ListSkeleton rows={6} />
        </div>
      ) : !callers.length ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">No callers yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Sign in, paste a CA and you&apos;re on it. Every paste is your call, measured from your own entry.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="label border-b border-border text-left text-subtle">
                  <th className="w-14 py-2.5 pl-4 font-normal">#</th>
                  <th className="py-2.5 font-normal">Caller</th>
                  <th className="py-2.5 text-right font-normal">Calls</th>
                  <th className="py-2.5 text-right font-normal">2x hits</th>
                  <th className="py-2.5 text-right font-normal">Hit rate</th>
                  <th className="py-2.5 text-right font-normal">Win rate</th>
                  <th className="py-2.5 text-right font-normal">Avg x</th>
                  <th className="py-2.5 pr-4 text-right font-normal">Best call</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {callers.map((c, i) => (
                  <tr key={c.userId} className={clsx("border-b border-border last:border-0", c.userId === userId && "bg-surface-2")}>
                    <td className={clsx("tabular py-3 pl-4 text-xs", i < 3 ? "text-fg" : "text-subtle")}>{rankLabel(i + 1)}</td>
                    <td className="py-3">
                      <Caller c={c} me={c.userId === userId} />
                    </td>
                    <td className="tabular py-3 text-right text-muted">{c.calls}</td>
                    <td className={clsx("tabular py-3 text-right", c.hits ? "text-up" : "text-muted")}>{c.hits}</td>
                    <td className={clsx("tabular py-3 text-right", sort === "rate" ? "text-fg" : "text-muted")}>{hitRate(c)}</td>
                    <td className="tabular py-3 text-right text-muted">{winRate(c)}</td>
                    <td className="py-3 text-right">
                      <MultipleBadge multiple={c.avgMultiple} />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <BestCall c={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border md:hidden">
            {callers.map((c, i) => (
              <li key={c.userId} className={clsx("flex items-center gap-3 px-4 py-3", c.userId === userId && "bg-surface-2")}>
                <span className={clsx("tabular w-6 shrink-0 font-mono text-xs", i < 3 ? "text-fg" : "text-subtle")}>
                  {rankLabel(i + 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <Caller c={c} me={c.userId === userId} />
                  <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
                    {c.calls} {c.calls === 1 ? "call" : "calls"} · {c.hits} at 2x+ · {winRate(c)} win
                    {c.bestToken && ` · best $${c.bestToken.symbol} ${formatMultiple(c.bestMultiple)}`}
                  </div>
                </div>
                <SortValue sort={sort} c={c} />
              </li>
            ))}
          </ul>

          {total > callers.length && (
            <button
              type="button"
              onClick={() => loadMore()}
              disabled={isValidating}
              className="mt-4 h-10 w-full rounded-md border border-border text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Show more ({total - callers.length} left)
            </button>
          )}
        </>
      )}
      <MyRank sort={sort} />
    </div>
  );
}

