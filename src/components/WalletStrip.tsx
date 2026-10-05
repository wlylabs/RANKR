"use client";

import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, Share2, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { chainMeta } from "@/lib/chains";
import { useMoney } from "@/lib/currency";
import { formatAmount, formatChange } from "@/lib/format";
import { marketOf, useWatchlistMarkets } from "@/lib/hooks";
import { holdingsList, remainingOf, summaryOf, usePaperTrades, usePaperWallet, type Holding } from "@/lib/paper";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Avatar";
import { LiveDot } from "./PageHeader";
import { SharePnl, TILE, TILE_ICON } from "./SharePnl";
import { RollingNumber } from "./SwapCinema";

/** Tokens listed before "Show all". */
const SHOWN = 4;

function tone(multiple: number | null) {
  return multiple === null ? "text-subtle" : multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : "text-muted";
}

/** A change as a wallet shows it: in a soft pill of its color. */
function ChangePill({ multiple }: { multiple: number }) {
  const up = multiple > 1.005;
  const down = multiple < 0.995;
  return (
    <span
      className={clsx(
        "tabular rounded-md px-1.5 py-0.5 font-mono text-xs",
        up ? "bg-up-soft text-up" : down ? "bg-down-soft text-down" : "bg-surface-2 text-muted",
      )}
    >
      {formatChange(multiple)}
    </span>
  );
}

/** A token's logo, or its first letter on a tile when it has none (or it won't load). */
function TokenIcon({ symbol, src }: { symbol: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setFailed(true)} className="size-9 shrink-0 rounded-full bg-surface-2 object-cover" />;
  }
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-muted">
      {symbol.replace(/^\W+/, "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * The top of Swap, as a wallet's home screen opens (Phantom, Rainbow, Backpack): who it is, what it's worth now
 * (cash, plus selling what's held at the live price) and how far that is from what was put in, the actions, then
 * the cash and the tokens held, with what each is worth and has done (one tap to sell one: `onSell`). Funds are
 * added from the settings menu. Nothing before there's a wallet: Swap asks for a balance itself.
 */
export function WalletStrip({
  current,
  onBuy,
  onSell,
  className,
}: {
  current: string | null;
  onBuy: () => void;
  onSell: (h: Holding) => void;
  className?: string;
}) {
  const trades = usePaperTrades();
  const wallet = usePaperWallet();
  const money = useMoney();
  const { userId, username } = useAuth();
  const [all, setAll] = useState(false);
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
  // Sell: the token on screen when it's held, else the one worth most.
  const toSell = holdings.find((h) => h.tokenId === current) ?? holdings[0];
  const shown = all ? holdings : holdings.slice(0, SHOWN);
  const canShare = trades.length > 0 && multiple !== null && !pending;

  return (
    <section aria-label="Wallet" className={clsx("card overflow-hidden", className)}>
      <div className="px-4 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            {userId ? (
              <Avatar userId={userId} size={28} />
            ) : (
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[22%] bg-surface-2 text-muted">
                <Wallet className="size-3.5" />
              </span>
            )}
            <span className="truncate font-medium">{username ? `@${username}` : "Wallet"}</span>
          </span>
          {ids.length > 0 && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-subtle">
              <LiveDot /> live
            </span>
          )}
        </div>

        <div className="mt-5 text-center">
          <div className="tabular text-[2.75rem] leading-none font-semibold tracking-tight" title="Cash, plus selling everything held now">
            {pending ? <span className="text-shimmer">{money.format(wallet.cashUsd)}</span> : <RollingNumber text={money.format(total)} />}
          </div>
          <div className="mt-2.5 flex h-6 items-center justify-center gap-2 font-mono text-sm">
            {multiple === null || pending ? (
              <span className="text-xs text-subtle">{pending ? "pricing what you hold…" : ""}</span>
            ) : (
              <>
                <span className={clsx("tabular", tone(multiple))}>{money.format(total - wallet.depositedUsd, { signed: true })}</span>
                <ChangePill multiple={multiple} />
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4">
          <button type="button" onClick={onBuy} className={TILE}>
            <span className={TILE_ICON}>
              <ArrowDownLeft className="size-[18px]" />
            </span>
            Buy
          </button>
          <button type="button" onClick={() => toSell && onSell(toSell)} disabled={!toSell} className={TILE}>
            <span className={TILE_ICON}>
              <ArrowUpRight className="size-[18px]" />
            </span>
            Sell
          </button>
          {canShare ? (
            <SharePnl
              variant="tile"
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
          ) : (
            <button type="button" disabled className={TILE}>
              <span className={TILE_ICON}>
                <Share2 className="size-[18px]" />
              </span>
              Share
            </button>
          )}
          <Link href="/me?tab=paper" className={TILE}>
            <span className={TILE_ICON}>
              <History className="size-[18px]" />
            </span>
            Activity
          </Link>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="label px-4 pt-3 pb-1 text-subtle">Tokens</div>
        <ul>
          <li className="flex items-center gap-3 px-4 py-2.5">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-fg font-mono text-xs font-semibold text-bg">
              {money.shown === "idr" ? "Rp" : "$"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Cash</span>
              <span className="block font-mono text-[11px] text-subtle">{money.shown === "idr" ? "IDR" : "USD"}</span>
            </span>
            <span className="tabular font-mono text-sm">{money.format(wallet.cashUsd)}</span>
          </li>
          {shown.map((h) => {
            const m = h.valueUsd === null || !(h.costUsd > 0) ? null : h.valueUsd / h.costUsd;
            const active = h.tokenId === current;
            return (
              <li key={h.tokenId}>
                <button
                  type="button"
                  onClick={() => onSell(h)}
                  aria-pressed={active}
                  title={`Sell $${h.symbol}`}
                  className={clsx("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2", active && "bg-surface-2")}
                >
                  <TokenIcon symbol={h.symbol} src={market(h.tokenId)?.imageUrl ?? null} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">${h.symbol}</span>
                    <span className="tabular block truncate font-mono text-[11px] text-subtle">
                      {formatAmount(h.tokens)} · {chainMeta(h.chainId).short}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono">
                    <span className="tabular block text-sm">{h.valueUsd !== null ? money.format(h.valueUsd) : isLoading ? "…" : "—"}</span>
                    <span className={clsx("tabular block text-[11px]", tone(m))}>{m === null ? " " : formatChange(m)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {holdings.length > SHOWN && (
          <button
            type="button"
            onClick={() => setAll((a) => !a)}
            aria-expanded={all}
            className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-xs text-muted hover:bg-surface-2 hover:text-fg"
          >
            {all ? "Show less" : `Show all ${holdings.length}`}
            <ChevronDown className={clsx("size-3.5 transition-transform", all && "rotate-180")} />
          </button>
        )}
      </div>
    </section>
  );
}
