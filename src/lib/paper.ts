"use client";

// Paper trades: simulated buys and sells of any amount, kept on this device (newest first), no account and
// no real money. Each keeps what the buy filled at (src/lib/sim.ts) and every sale since, so its profit and
// loss is known whatever happens to the token: tokens Rankr no longer tracks (after the monthly reset) are
// priced from live DEX data, like the watchlist.

import { useSyncExternalStore } from "react";
import { tokenId } from "./address";
import { SIM_MODEL, quoteBuy, quoteSell, type Quality, type SellFill } from "./sim";
import type { MarketSnapshot } from "./types";

export type Sale = {
  at: number;
  tokens: number;
  /** What the sale brought in, all costs out. */
  proceedsUsd: number;
  /** The market price it was priced on. */
  priceUsd: number;
};

export type PaperTrade = {
  id: string;
  /** Token id, "<chain>:<address>" (see tokenId). */
  tokenId: string;
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  openedAt: number;
  /** What went in, all costs included. */
  spentUsd: number;
  tokens: number;
  /** The market price the buy was priced on, and what it filled at (spent / tokens). */
  priceUsd: number;
  fillPriceUsd: number;
  feeUsd: number;
  networkUsd: number;
  impact: number;
  quality: Quality;
  dexId: string;
  model: string;
  /** Rupiah per dollar when bought, when known: the buy in rupiah, as it was then. */
  usdIdr: number | null;
  sales: Sale[];
};

const KEY = "rankr:paper:v1";
/** Trades kept: the newest. */
export const MAX_TRADES = 100;
const EMPTY: PaperTrade[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: PaperTrade[] } = { raw: null, value: EMPTY };
// The list as last written, when the browser wouldn't store it (full or blocked): it still works until the
// page closes.
let memory: PaperTrade[] | null = null;

function isTrade(x: unknown): x is PaperTrade {
  const t = x as PaperTrade;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.tokenId === "string" &&
    typeof t.chainId === "string" &&
    typeof t.address === "string" &&
    Number.isFinite(t.spentUsd) &&
    t.spentUsd > 0 &&
    Number.isFinite(t.tokens) &&
    t.tokens > 0 &&
    Array.isArray(t.sales) &&
    t.sales.every((s) => !!s && Number.isFinite(s.tokens) && s.tokens > 0 && Number.isFinite(s.proceedsUsd))
  );
}

function read(): PaperTrade[] {
  if (memory) return memory;
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) {
    let value = EMPTY;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      value = Array.isArray(parsed) ? parsed.filter(isTrade) : EMPTY;
    } catch {
      /* corrupted entry, start over */
    }
    cache = { raw, value };
  }
  return cache.value;
}

function write(list: PaperTrade[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    memory = null;
  } catch {
    memory = list;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePaperTrades(): PaperTrade[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** A paper buy of `spendUsd` at the pair's price now, or null when it can't be priced. Pure: nothing is saved. */
export function paperBuy(m: MarketSnapshot, spendUsd: number, usdIdr: number | null, now = Date.now()): PaperTrade | null {
  const fill = quoteBuy(m, spendUsd);
  if (!fill) return null;
  return {
    id: newId(),
    tokenId: tokenId(m.chainId, m.address),
    chainId: m.chainId,
    address: m.address,
    symbol: m.symbol,
    name: m.name,
    openedAt: now,
    spentUsd: fill.spentUsd,
    tokens: fill.tokens,
    priceUsd: fill.priceUsd,
    fillPriceUsd: fill.fillPriceUsd,
    feeUsd: fill.feeUsd,
    networkUsd: fill.networkUsd,
    impact: fill.impact,
    quality: fill.quality,
    dexId: m.dexId,
    model: SIM_MODEL,
    usdIdr: usdIdr && usdIdr > 0 ? usdIdr : null,
    sales: [],
  };
}

/** Opens a paper trade (first in the list). Returns it, or null when the pair can't be priced. */
export function openPaperTrade(m: MarketSnapshot, spendUsd: number, usdIdr: number | null): PaperTrade | null {
  const trade = paperBuy(m, spendUsd, usdIdr);
  if (trade) write([trade, ...read()].slice(0, MAX_TRADES));
  return trade;
}

/** Tokens not sold yet (none once what's left is a rounding error). */
export function remainingOf(t: PaperTrade): number {
  const left = t.tokens - t.sales.reduce((n, s) => n + s.tokens, 0);
  return left > t.tokens * 1e-9 ? left : 0;
}

/** `fraction` (0.25, 0.5, 1) of what's left sold at the pair's price now. Pure: the trade with the sale, or null. */
export function paperSell(t: PaperTrade, fraction: number, m: MarketSnapshot, now = Date.now()): PaperTrade | null {
  const left = remainingOf(t);
  if (!(left > 0) || !(fraction > 0)) return null;
  const tokens = fraction >= 1 ? left : left * fraction;
  const fill = quoteSell(m, tokens);
  if (!fill) return null;
  return { ...t, sales: [...t.sales, { at: now, tokens, proceedsUsd: fill.proceedsUsd, priceUsd: m.priceUsd }] };
}

/** Sells part or all of a paper trade. Returns the updated trade, or null when it can't be priced. */
export function sellPaperTrade(id: string, fraction: number, m: MarketSnapshot): PaperTrade | null {
  const list = read();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const next = paperSell(list[i], fraction, m);
  if (!next) return null;
  write(list.map((t, j) => (j === i ? next : t)));
  return next;
}

export function removePaperTrade(id: string) {
  write(read().filter((t) => t.id !== id));
}

export function clearPaperTrades() {
  write(EMPTY);
}

export type Position = {
  /** Tokens left, and what they cost (their share of what went in). */
  remaining: number;
  costUsd: number;
  /** Selling what's left now, when there's live data: its value at the market price and what it would bring in. */
  now: SellFill | null;
  /** What the sales brought in, less what the sold tokens cost. */
  realizedUsd: number;
  /** What selling the rest now would bring in, less what it cost; null without live data. */
  unrealizedUsd: number | null;
  /** Everything back (sold, plus selling the rest now) over what went in; null without live data while open. */
  multiple: number | null;
};

/** Where a paper trade stands, given the pair's live data (null when there is none). */
export function positionOf(t: PaperTrade, m: MarketSnapshot | null): Position {
  const remaining = remainingOf(t);
  const sold = t.tokens - remaining;
  const proceeds = t.sales.reduce((n, s) => n + s.proceedsUsd, 0);
  const realizedUsd = proceeds - (t.spentUsd * sold) / t.tokens;
  const costUsd = (t.spentUsd * remaining) / t.tokens;
  const now = remaining > 0 && m ? quoteSell(m, remaining) : null;
  const unrealizedUsd = remaining > 0 ? (now ? now.proceedsUsd - costUsd : null) : 0;
  const back = remaining > 0 ? (now ? proceeds + now.proceedsUsd : null) : proceeds;
  return { remaining, costUsd, now, realizedUsd, unrealizedUsd, multiple: back === null ? null : back / t.spentUsd };
}

export type PaperSummary = {
  trades: number;
  open: number;
  /** Everything that went in. */
  investedUsd: number;
  /** What the open trades' tokens would bring in now (those with live data). */
  openValueUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  /** Open trades without live data right now: left out of the open value and unrealized. */
  unpriced: number;
};

export function summaryOf(trades: PaperTrade[], marketOf: (tokenId: string) => MarketSnapshot | null): PaperSummary {
  const out: PaperSummary = { trades: trades.length, open: 0, investedUsd: 0, openValueUsd: 0, realizedUsd: 0, unrealizedUsd: 0, unpriced: 0 };
  for (const t of trades) {
    const p = positionOf(t, marketOf(t.tokenId));
    out.investedUsd += t.spentUsd;
    out.realizedUsd += p.realizedUsd;
    if (p.remaining > 0) {
      out.open++;
      if (p.now && p.unrealizedUsd !== null) {
        out.openValueUsd += p.now.proceedsUsd;
        out.unrealizedUsd += p.unrealizedUsd;
      } else out.unpriced++;
    }
  }
  return out;
}
