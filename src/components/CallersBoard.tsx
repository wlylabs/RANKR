"use client";

import clsx from "clsx";
import Link from "next/link";
import { formatMultiple, tokenHref } from "@/lib/format";
import { useCallerPages } from "@/lib/hooks";
import { MIN_CALLS_FOR_AVG, type CallerSort } from "@/lib/params";
import type { CallerView } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { MultipleBadge } from "./MultipleBadge";
import { ListSkeleton } from "./TokenList";

export const CALLER_SORT_LABELS: Record<CallerSort, string> = {
  hits: "2x hits",
  avg: "Avg x",
  best: "Best call",
  calls: "Most calls",
};

const PAGE = 50;

function winRate(c: CallerView) {
  return `${Math.round((c.wins / Math.max(c.calls, 1)) * 100)}%`;
}

function Caller({ c, me }: { c: CallerView; me: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-mono text-[13px]">@{c.username}</span>
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

export function CallersBoard({ sort }: { sort: CallerSort }) {
  const { userId } = useAuth();
  const { callers, total, isLoading, isValidating, loadMore } = useCallerPages(sort, PAGE);
  const loading = isLoading && !callers.length;

  return (
    <div className="mt-4">
      {sort === "avg" && (
        <p className="mb-3 font-mono text-[11px] text-subtle">avg x counts callers with {MIN_CALLS_FOR_AVG}+ calls</p>
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
                  <th className="py-2.5 text-right font-normal">Win rate</th>
                  <th className="py-2.5 text-right font-normal">Avg x</th>
                  <th className="py-2.5 pr-4 text-right font-normal">Best call</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {callers.map((c, i) => (
                  <tr key={c.userId} className={clsx("border-b border-border last:border-0", c.userId === userId && "bg-surface-2")}>
                    <td className={clsx("tabular py-3 pl-4 text-xs", i < 3 ? "text-fg" : "text-subtle")}>
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="py-3">
                      <Caller c={c} me={c.userId === userId} />
                    </td>
                    <td className="tabular py-3 text-right text-muted">{c.calls}</td>
                    <td className={clsx("tabular py-3 text-right", c.hits ? "text-up" : "text-muted")}>{c.hits}</td>
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
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <Caller c={c} me={c.userId === userId} />
                  <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
                    {c.calls} {c.calls === 1 ? "call" : "calls"} · {c.hits} at 2x+ · {winRate(c)} win
                    {c.bestToken && ` · best $${c.bestToken.symbol} ${formatMultiple(c.bestMultiple)}`}
                  </div>
                </div>
                <MultipleBadge multiple={sort === "best" ? c.bestMultiple : c.avgMultiple} />
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
    </div>
  );
}

