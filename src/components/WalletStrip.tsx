"use client";

import clsx from "clsx";
import { useMemo } from "react";
import { useMoney } from "@/lib/currency";
import { formatChange, formatMultiple } from "@/lib/format";
import { marketOf, useWatchlistMarkets } from "@/lib/hooks";
import { holdingsList, remainingOf, summaryOf, usePaperTrades, usePaperWallet, type Holding } from "@/lib/paper";
import { LiveDot } from "./PageHeader";
import { PaperBalance } from "./PaperBalance";
import { SharePnl } from "./SharePnl";
import { RollingNumber } from "./SwapCinema";

function tone(multiple: number | null) {
  return multiple === null ? "text-subtle" : multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : "text-muted";
}

/**
 * The top of Swap, as a wallet opens: the paper wallet's worth now (cash, plus selling what's held at the live
 * price), how far that is from what was put in, the tokens held (one tap to sell one: `onSell`), and the cash
 * with a way to add to it. Nothing before there's a wallet: Swap asks for a balance itself.
 */
export function WalletStrip({ current, onSell, className }: { current: string | null; onSell: (h: Holding) => void; className?: string }) {
  const trades = usePaperTrades();
  const wallet = usePaperWallet();
  const money = useMoney();
  const ids = useMemo(() => [...new Set(trades.filter((t) => remainingOf(t) > 0).map((t) => t.tokenId))], [trades]);
  const { items, isLoading } = useWatchlistMarkets(ids);
  const market = (id: string) => marketOf(items.get(id));

  if (!wallet) return null;

  const s = summaryOf(trades, market);
  const holdings = holdingsList(trades, market);
  const total = wallet.cashUsd + s.openValueUsd;
  // Waiting on live data for what's held: the total would read as if it were worth nothing.
  const pending = isLoading && s.unpriced > 0;
  const multiple = wallet.depositedUsd > 0 ? total / wallet.depositedUsd : null;

  return (
    <section aria-label="Paper wallet" className={clsx("card p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-muted">
          Paper balance
          <span className="rounded border border-border px-1 py-px font-mono text-[10px] tracking-[0.12em] text-subtle">PAPER</span>
          {ids.length > 0 && <LiveDot />}
        </span>
        {trades.length > 0 && multiple !== null && !pending && (
          <SharePnl
            href="/swap"
            card={{
              kind: "wallet",
              // What's held first, most worth first, then what was traded.
              tickers: [...new Set([...holdings.map((h) => h.symbol), ...trades.map((t) => t.symbol)])],
              tokens: new Set(trades.map((t) => t.tokenId)).size,
              trades: trades.length,
              multiple,
              amounts: { inUsd: wallet.depositedUsd, backUsd: total, currency: money.shown, usdIdr: money.rate?.usdIdr ?? null },
            }}
          />
        )}
      </div>

      <div className="tabular mt-2 font-mono text-4xl font-medium tracking-tight" title="Cash, plus selling everything held now">
        {pending ? <span className="text-shimmer">{money.format(wallet.cashUsd)}</span> : <RollingNumber text={money.format(total)} />}
      </div>
      <div className="tabular mt-1.5 truncate font-mono text-xs">
        {multiple === null || pending ? (
          <span className="text-subtle">{pending ? "pricing what you hold…" : "—"}</span>
        ) : (
          <>
            <span className={tone(multiple)}>
              {money.format(total - wallet.depositedUsd, { signed: true })} ({formatChange(multiple)})
            </span>
            <span className="text-subtle"> since the start</span>
            {s.unpriced > 0 && <span className="text-subtle"> · {s.unpriced} without live data</span>}
          </>
        )}
      </div>

      {holdings.length > 0 && (
        <ul aria-label="Held" className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
          {holdings.map((h) => {
            const m = h.valueUsd === null || !(h.costUsd > 0) ? null : h.valueUsd / h.costUsd;
            const active = h.tokenId === current;
            return (
              <li key={h.tokenId} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSell(h)}
                  aria-pressed={active}
                  title={`Sell $${h.symbol}${h.valueUsd !== null ? `: ${money.format(h.valueUsd)} if sold now` : ""}`}
                  className={clsx(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] transition-colors hover:bg-surface-2",
                    active ? "border-fg text-fg" : "border-border text-muted hover:text-fg",
                  )}
                >
                  ${h.symbol}
                  <span className={clsx("tabular", tone(m))}>{m === null ? (isLoading ? "…" : "—") : formatMultiple(m)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <PaperBalance label="Cash" className="mt-3 border-t border-border pt-3" />
    </section>
  );
}
