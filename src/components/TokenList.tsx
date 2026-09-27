import clsx from "clsx";
import Link from "next/link";
import { formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import type { TokenView } from "@/lib/types";
import { ChainTag } from "./Chain";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";

function Rank({ rank }: { rank: number }) {
  return (
    <span className={clsx("tabular w-6 shrink-0 font-mono text-xs", rank <= 3 ? "text-fg" : "text-subtle")}>
      {String(rank).padStart(2, "0")}
    </span>
  );
}

/** Ticker + name, the only identity a token gets (no logos). */
export function TokenName({ symbol, name, className }: { symbol: string; name: string; className?: string }) {
  return (
    <span className={clsx("flex min-w-0 items-baseline gap-2", className)}>
      <span className="shrink-0 font-medium">${symbol}</span>
      <span className="truncate text-sm text-muted">{name}</span>
    </span>
  );
}

/**
 * Compact row used on the home page and on mobile leaderboards. The meta line stays short enough for a
 * phone: chain, market cap now, and age (or peak); the entry is on the token page.
 */
export function TokenRow({ token: t, rank, meta = "pasted" }: { token: TokenView; rank?: number; meta?: "pasted" | "peak" }) {
  return (
    <Link href={tokenHref(t)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
      {rank !== undefined && <Rank rank={rank} />}
      <div className="min-w-0 flex-1">
        <TokenName symbol={t.symbol} name={t.name} />
        <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
          <ChainTag chainId={t.chainId} /> · mc {formatUsd(t.marketCap)} ·{" "}
          {meta === "peak" ? `peak ${formatMultiple(t.peakMultiple)}` : <TimeAgo at={t.firstPastedAt} compact />}
        </div>
      </div>
      <MultipleBadge multiple={t.multiple} />
    </Link>
  );
}

/** Full table for md+ screens. */
export function TokenTable({ tokens, startRank = 1 }: { tokens: TokenView[]; startRank?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="label border-b border-border text-left text-subtle">
            <th className="w-14 py-2.5 pl-4 font-normal">#</th>
            <th className="py-2.5 font-normal">Token</th>
            <th className="py-2.5 font-normal">Chain</th>
            <th className="py-2.5 text-right font-normal">Entry MC</th>
            <th className="py-2.5 text-right font-normal">MC now</th>
            <th className="hidden py-2.5 text-right font-normal lg:table-cell">Peak</th>
            <th className="hidden py-2.5 text-right font-normal lg:table-cell">Liquidity</th>
            <th className="py-2.5 text-right font-normal">Pasted</th>
            <th className="py-2.5 pr-4 text-right font-normal">Since paste</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[13px]">
          {tokens.map((t, i) => (
            <tr key={t.id} className="relative border-b border-border transition-colors last:border-0 hover:bg-surface-2">
              <td className="py-3 pl-4">
                <Rank rank={startRank + i} />
              </td>
              <td className="max-w-[18rem] py-3 font-sans">
                <Link href={tokenHref(t)} className="block after:absolute after:inset-0">
                  <TokenName symbol={t.symbol} name={t.name} />
                </Link>
              </td>
              <td className="py-3">
                <ChainTag chainId={t.chainId} />
              </td>
              <td className="tabular py-3 text-right text-muted">{formatUsd(t.entryMarketCap)}</td>
              <td className="tabular py-3 text-right">{formatUsd(t.marketCap)}</td>
              <td className="tabular hidden py-3 text-right text-muted lg:table-cell">{formatMultiple(t.peakMultiple)}</td>
              <td className="tabular hidden py-3 text-right text-muted lg:table-cell">{formatUsd(t.market?.liquidityUsd)}</td>
              <td className="py-3 text-right text-muted">
                <TimeAgo at={t.firstPastedAt} />
              </td>
              <td className="py-3 pr-4 text-right">
                <MultipleBadge multiple={t.multiple} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-surface-2" />
            <div className="h-2.5 w-28 rounded bg-surface-2" />
          </div>
          <div className="h-3 w-12 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
