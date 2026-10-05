"use client";

import clsx from "clsx";
import { FlaskConical, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMoney } from "@/lib/currency";
import { tokenHref } from "@/lib/format";
import { marketOf, useWatchlistMarkets } from "@/lib/hooks";
import {
  clearPaperTrades,
  positionOf,
  removePaperTrade,
  remainingOf,
  sellPaperTrade,
  summaryOf,
  usePaperTrades,
  usePaperWallet,
  writeOffPaperTrade,
  type PaperTrade,
} from "@/lib/paper";
import { isFresh } from "@/lib/sim";
import type { MarketSnapshot } from "@/lib/types";
import { ChainTag } from "./Chain";
import { PaperBalance } from "./PaperBalance";
import { Cascade } from "./Cinema";
import { RateNote } from "./RateNote";
import { SharePnl } from "./SharePnl";
import { TimeAgo } from "./TimeAgo";
import { TokenName } from "./TokenList";

const SELLS = [
  { fraction: 0.25, label: "25%" },
  { fraction: 0.5, label: "50%" },
  { fraction: 1, label: "All" },
];

function tone(n: number | null) {
  return n === null ? "text-muted" : n > 0.005 ? "text-up" : n < -0.005 ? "text-down" : "text-muted";
}

/** Paper trades on this device: the paper balance, what selling now would bring in, and selling them. */
export function PaperTrades() {
  const trades = usePaperTrades();
  const wallet = usePaperWallet();
  // Live data only for what's still held: a closed trade's numbers are settled.
  const ids = useMemo(() => [...new Set(trades.filter((t) => remainingOf(t) > 0).map((t) => t.tokenId))], [trades]);
  const { items, isLoading } = useWatchlistMarkets(ids);
  const market = (id: string) => marketOf(items.get(id));
  const money = useMoney();
  const [confirmClear, setConfirmClear] = useState(false);

  if (!trades.length) {
    return (
      <div className="mt-6 space-y-4">
        <PaperBalance />
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <FlaskConical className="mx-auto size-5 text-subtle" />
          <p className="mt-3 font-medium">No trades yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Paste a token, pick how much, swap.</p>
          <Link
            href="/swap"
            className="mt-5 inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85"
          >
            Swap
          </Link>
        </div>
      </div>
    );
  }

  const s = summaryOf(trades, market);
  const open = trades.filter((t) => remainingOf(t) > 0);
  const closed = trades.filter((t) => remainingOf(t) === 0);

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        Sold at the pool&apos;s price now, after the DEX fee and price impact.{" "}
        <Link href="/swap" className="text-fg underline-offset-4 hover:underline">
          Swap
        </Link>
      </p>
      <PaperBalance className="mt-4" />
      <div className="mt-4 grid grid-cols-2 card max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x lg:divide-border">
        {wallet ? (
          <Tile
            label="Total, if sold now"
            value={money.format(wallet.cashUsd + s.openValueUsd)}
            hint={`cash ${money.format(wallet.cashUsd, { short: true })} · put in ${money.format(wallet.depositedUsd, { short: true })}`}
          />
        ) : (
          <Tile label="Put in" value={money.format(s.investedUsd)} hint={`${s.trades} ${s.trades === 1 ? "trade" : "trades"}, ${s.open} open`} />
        )}
        <Tile
          label="Open, if sold now"
          value={money.format(s.openValueUsd)}
          hint={isLoading && s.unpriced ? "loading live data…" : s.unpriced ? `${s.unpriced} without live data` : "after fees and impact"}
        />
        <Tile
          label="Unrealized"
          value={<span className={tone(s.unrealizedUsd / Math.max(s.investedUsd, 1))}>{money.format(s.unrealizedUsd, { signed: true })}</span>}
          hint="open trades"
        />
        <Tile
          label="Realized"
          value={<span className={tone(s.realizedUsd / Math.max(s.investedUsd, 1))}>{money.format(s.realizedUsd, { signed: true })}</span>}
          hint="from sales"
        />
      </div>

      {open.length > 0 && (
        <List title="Open">
          {open.map((t) => (
            <TradeRow key={t.id} trade={t} market={market(t.tokenId)} loading={isLoading} />
          ))}
        </List>
      )}
      {closed.length > 0 && (
        <List title="Closed">
          {closed.map((t) => (
            <TradeRow key={t.id} trade={t} market={null} loading={false} />
          ))}
        </List>
      )}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <RateNote />
        </div>
        {confirmClear ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted">Clear every trade?</span>
            <button
              type="button"
              onClick={() => {
                clearPaperTrades();
                setConfirmClear(false);
              }}
              className="rounded-md border border-border px-2 py-1 text-down hover:bg-surface-2"
            >
              Clear
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="rounded-md px-2 py-1 text-muted hover:text-fg">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} className="text-xs text-muted hover:text-fg">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

function List({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="label mb-2 text-subtle">{title}</h2>
      <Cascade className="divide-y divide-border overflow-hidden card">{children}</Cascade>
    </section>
  );
}

function TradeRow({ trade: t, market: m, loading }: { trade: PaperTrade; market: MarketSnapshot | null; loading: boolean }) {
  const money = useMoney();
  const [confirmWriteOff, setConfirmWriteOff] = useState(false);
  const p = positionOf(t, m);
  const open = p.remaining > 0;
  // Fresh enough to sell on: what a sale would be priced on.
  const live = !!m && m.priceUsd > 0 && isFresh(m);
  const gain = p.multiple === null ? null : p.multiple - 1;
  const soldPart = 1 - p.remaining / t.tokens;
  const lastSale = t.sales[t.sales.length - 1];
  // Every amount at today's rate (so a profit doesn't move with the exchange rate); the rupiah it was that day
  // on hover.
  const thenTitle =
    money.shown === "idr" && t.usdIdr ? `Rp${Math.round(t.spentUsd * t.usdIdr).toLocaleString("id-ID")} at that day's rate` : undefined;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <Link href={tokenHref(t)} className="min-w-0 flex-1">
          <TokenName symbol={t.symbol} name={t.name} />
          <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
            <ChainTag chainId={t.chainId} /> · <span title={thenTitle}>{money.format(t.spentUsd)} in</span> ·{" "}
            <TimeAgo at={t.openedAt} compact />
            {t.quality !== "good" && <> · {t.quality === "none" ? "no depth" : "rough"}</>}
            {soldPart > 0 && open && <> · {Math.round(soldPart * 100)}% sold</>}
          </div>
        </Link>
        <div className="shrink-0 text-right font-mono">
          {/* Everything back: what the sales brought in, plus selling the rest now. */}
          <div className="tabular text-sm" title={open ? "Sold so far, plus selling the rest now" : "What the sales brought in"}>
            {p.multiple !== null ? money.format(p.multiple * t.spentUsd) : loading ? "…" : "no live data"}
          </div>
          <div className={clsx("tabular text-[11px]", tone(gain))}>
            {gain === null ? "—" : `${gain >= 0 ? "+" : ""}${(gain * 100).toFixed(1)}%`}
            {gain !== null && <span className="text-subtle"> · {money.format(p.realizedUsd + (p.unrealizedUsd ?? 0), { signed: true })}</span>}
          </div>
        </div>
        {p.multiple !== null && (
          <SharePnl
            variant="icon"
            href={tokenHref(t)}
            card={{
              kind: "trade",
              symbol: t.symbol,
              chainId: t.chainId,
              open,
              multiple: p.multiple,
              amounts: { inUsd: t.spentUsd, backUsd: p.multiple * t.spentUsd, currency: money.shown, usdIdr: money.rate?.usdIdr ?? null },
            }}
            className="-my-0.5"
          />
        )}
        {!open && (
          <button
            type="button"
            onClick={() => removePaperTrade(t.id)}
            aria-label={`Remove the $${t.symbol} trade`}
            title="Remove"
            className="-mr-1 shrink-0 rounded p-1 text-subtle hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="mr-1 text-[11px] text-subtle">Sell</span>
          {SELLS.map((x) => (
            <button
              key={x.label}
              type="button"
              disabled={!live}
              // The sale count it was pressed at, so a double-click (or a click on a row that just moved) sells once.
              onClick={(e) => e.detail <= 1 && m && sellPaperTrade(t.id, x.fraction, m, t.sales.length)}
              aria-label={`Sell ${x.fraction >= 1 ? "all" : x.label} of $${t.symbol}`}
              className="h-7 rounded-md border border-border px-2.5 font-mono text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            >
              {x.label}
            </button>
          ))}
          {p.now ? (
            <span className="ml-auto truncate font-mono text-[11px] text-subtle">
              {p.now.quality === "none"
                ? "impact unknown"
                : p.now.impact >= 0.001
                  ? `-${(p.now.impact * 100).toFixed(1)}% impact`
                  : "<0.1% impact"}
            </span>
          ) : (
            !loading &&
            // No market left to sell into (a rugged or delisted token): what's left can be closed at nothing.
            (confirmWriteOff ? (
              <span className="ml-auto flex items-center gap-1.5 text-[11px]">
                <span className="text-muted">Close at nothing?</span>
                <button
                  type="button"
                  onClick={() => writeOffPaperTrade(t.id)}
                  className="rounded-md border border-border px-2 py-0.5 text-down hover:bg-surface-2"
                >
                  Write off
                </button>
                <button type="button" onClick={() => setConfirmWriteOff(false)} className="rounded-md px-1.5 py-0.5 text-muted hover:text-fg">
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmWriteOff(true)}
                title="No live market to sell into: close what's left at nothing"
                className="ml-auto text-[11px] text-subtle hover:text-fg"
              >
                Write off
              </button>
            ))
          )}
        </div>
      ) : (
        lastSale && (
          <p className="mt-1 font-mono text-[11px] text-subtle">
            closed <TimeAgo at={lastSale.at} compact /> · {t.sales.length} {t.sales.length === 1 ? "sale" : "sales"}
          </p>
        )
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-border px-4 py-5 sm:px-6">
      <div className="label text-subtle">{label}</div>
      <div className="tabular mt-2 truncate font-mono text-xl font-medium tracking-tight sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** For the tab's count: open paper trades. */
export function useOpenPaperTrades(): number {
  return usePaperTrades().filter((t) => remainingOf(t) > 0).length;
}

