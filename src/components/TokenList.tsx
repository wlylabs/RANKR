import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import type { TokenView } from "@/lib/types";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainBadge, TokenAvatar } from "./TokenAvatar";

function RankNumber({ rank }: { rank: number }) {
  return (
    <span
      className={clsx(
        "tabular grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
        rank === 1 && "bg-gold-soft text-gold",
        rank === 2 && "bg-surface-2 text-fg",
        rank === 3 && "bg-surface-2 text-fg",
        rank > 3 && "text-subtle",
      )}
    >
      {rank}
    </span>
  );
}

/** Compact row used on the home page and on mobile leaderboards. */
export function TokenRow({ token: t, rank, meta = "pasted" }: { token: TokenView; rank?: number; meta?: "pasted" | "peak" }) {
  return (
    <Link
      href={tokenHref(t)}
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-2/70 sm:px-3"
    >
      {rank !== undefined && <RankNumber rank={rank} />}
      <TokenAvatar symbol={t.symbol} imageUrl={t.imageUrl} chainId={t.chainId} seed={t.id} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold">${t.symbol}</span>
          <ChainBadge chainId={t.chainId} className="hidden min-[380px]:inline-flex" />
        </div>
        <div className="tabular mt-0.5 truncate text-xs text-muted">
          {formatUsd(t.entryMarketCap)} → {formatUsd(t.marketCap)}
          <span className="text-subtle">
            {" · "}
            {meta === "peak" ? `peak ${formatMultiple(t.peakMultiple)}` : <TimeAgo at={t.firstPastedAt} />}
          </span>
        </div>
      </div>
      <MultipleBadge multiple={t.multiple} />
    </Link>
  );
}

/** Full table for md+ screens. */
export function TokenTable({ tokens, startRank = 1 }: { tokens: TokenView[]; startRank?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-subtle">
            <th className="w-12 py-3 pl-4 font-medium">#</th>
            <th className="py-3 font-medium">Token</th>
            <th className="py-3 text-right font-medium">Entry MC</th>
            <th className="py-3 text-right font-medium">MC now</th>
            <th className="hidden py-3 text-right font-medium lg:table-cell">Peak</th>
            <th className="hidden py-3 text-right font-medium lg:table-cell">Liquidity</th>
            <th className="py-3 text-right font-medium">First pasted</th>
            <th className="py-3 pr-4 text-right font-medium">Since paste</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => (
            <tr key={t.id} className="group relative border-b border-border/60 last:border-0 hover:bg-surface-2/60">
              <td className="py-3 pl-4">
                <RankNumber rank={startRank + i} />
              </td>
              <td className="py-3">
                <Link href={tokenHref(t)} className="flex items-center gap-3 after:absolute after:inset-0">
                  <TokenAvatar symbol={t.symbol} imageUrl={t.imageUrl} chainId={t.chainId} seed={t.id} size={34} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="max-w-[10rem] truncate font-semibold">${t.symbol}</span>
                      <ChainBadge chainId={t.chainId} />
                    </span>
                    <span className="block max-w-[14rem] truncate text-xs text-muted">{t.name}</span>
                  </span>
                </Link>
              </td>
              <td className="tabular py-3 text-right text-muted">{formatUsd(t.entryMarketCap)}</td>
              <td className="tabular py-3 text-right font-medium">{formatUsd(t.marketCap)}</td>
              <td className="tabular hidden py-3 text-right lg:table-cell">
                <span className={t.peakMultiple >= 2 ? "font-semibold text-up" : "text-muted"}>
                  {formatMultiple(t.peakMultiple)}
                </span>
              </td>
              <td className="tabular hidden py-3 text-right text-muted lg:table-cell">
                {formatUsd(t.market?.liquidityUsd)}
              </td>
              <td className="py-3 text-right text-muted">
                <TimeAgo at={t.firstPastedAt} />
              </td>
              <td className="py-3 pr-4 text-right">
                <span className="inline-flex items-center gap-1">
                  <MultipleBadge multiple={t.multiple} />
                  <ChevronRight className="size-4 text-subtle opacity-0 transition group-hover:opacity-100" />
                </span>
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
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 px-2 py-2.5 sm:px-3">
          <div className="size-[38px] rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-surface-2" />
            <div className="h-2.5 w-36 rounded bg-surface-2" />
          </div>
          <div className="h-7 w-16 rounded-lg bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
