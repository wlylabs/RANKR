"use client";

// Paper trades: simulated swaps of any amount, kept on this device (newest first), no account and no real
// money. A paper wallet holds the cash (a balance you pick, topped up whenever): a buy takes from it, a sale
// pays into it. Each trade keeps what the buy filled at (src/lib/sim.ts) and every sale since, so its profit
// and loss is known whatever happens to the token: tokens Rankr no longer tracks (after the monthly reset) are
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

/** Said wherever paper trades are: what they are, and what they leave out. */
export const PAPER_NOTE =
  "Simulated with public DexScreener data: no real money, no wallet, nothing is traded. Fills are estimated from the pool's liquidity (x·y = k), the DEX's fee and network costs; real trades can fill worse (bots, MEV, token taxes, launch fees, failed transactions, liquidity pulls). Not financial advice.";

const KEY = "rankr:paper:v1";
const WALLET_KEY = "rankr:paper:wallet:v1";
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
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === WALLET_KEY) && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePaperTrades(): PaperTrade[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** The paper cash: what's left to buy with, and everything ever put in (the start and every top-up). */
export type PaperWallet = { cashUsd: number; depositedUsd: number };

let walletCache: { raw: string | null; value: PaperWallet | null } = { raw: null, value: null };
// As last written, when the browser wouldn't store it; undefined when it did.
let walletMemory: PaperWallet | null | undefined;

function isWallet(x: unknown): x is PaperWallet {
  const w = x as PaperWallet;
  return !!w && Number.isFinite(w.cashUsd) && w.cashUsd >= 0 && Number.isFinite(w.depositedUsd) && w.depositedUsd >= 0;
}

function readWallet(): PaperWallet | null {
  if (walletMemory !== undefined) return walletMemory;
  let raw: string | null;
  try {
    raw = localStorage.getItem(WALLET_KEY);
  } catch {
    return null;
  }
  if (raw !== walletCache.raw) {
    let value: PaperWallet | null = null;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      value = isWallet(parsed) ? parsed : null;
    } catch {
      /* corrupted entry, start over */
    }
    walletCache = { raw, value };
  }
  return walletCache.value;
}

function writeWallet(w: PaperWallet | null) {
  try {
    if (w) localStorage.setItem(WALLET_KEY, JSON.stringify(w));
    else localStorage.removeItem(WALLET_KEY);
    walletMemory = undefined;
  } catch {
    walletMemory = w;
  }
}

/** Both at once, then one notice: a swap moves cash and tokens together. */
function commit(trades: PaperTrade[], wallet: PaperWallet | null) {
  writeWallet(wallet);
  write(trades);
}

/** The paper wallet, or null before a balance has been picked. */
export function usePaperWallet(): PaperWallet | null {
  return useSyncExternalStore(subscribe, readWallet, () => null);
}

/** Starts the paper wallet with `usd` (any amount), or adds `usd` to it. */
export function addPaperFunds(usd: number) {
  if (!(usd > 0) || !Number.isFinite(usd)) return;
  const w = readWallet();
  commit(read(), w ? { cashUsd: w.cashUsd + usd, depositedUsd: w.depositedUsd + usd } : { cashUsd: usd, depositedUsd: usd });
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

/** The list with `trade` first, keeping MAX_TRADES: the oldest closed trades go first, open ones last. */
function withTrade(trades: PaperTrade[], trade: PaperTrade): PaperTrade[] {
  const list = [trade, ...trades];
  while (list.length > MAX_TRADES) {
    let drop = -1;
    for (let i = list.length - 1; i > 0 && drop < 0; i--) if (remainingOf(list[i]) === 0) drop = i;
    list.splice(drop < 0 ? list.length - 1 : drop, 1);
  }
  return list;
}

/** Why a paper swap didn't go through. */
export type SwapError = "balance" | "holdings" | "price";

/** A paper buy paid from the wallet. Pure: the wallet and trades after it, or why not. */
export function buyWith(
  wallet: PaperWallet,
  trades: PaperTrade[],
  m: MarketSnapshot,
  spendUsd: number,
  usdIdr: number | null,
  now = Date.now(),
): { wallet: PaperWallet; trades: PaperTrade[]; trade: PaperTrade } | { error: SwapError } {
  if (spendUsd > wallet.cashUsd * (1 + 1e-9)) return { error: "balance" };
  const trade = paperBuy(m, Math.min(spendUsd, wallet.cashUsd), usdIdr, now);
  if (!trade) return { error: "price" };
  return { wallet: { ...wallet, cashUsd: Math.max(0, wallet.cashUsd - trade.spentUsd) }, trades: withTrade(trades, trade), trade };
}

/** A paper buy from the wallet, saved. The trade, or why not. */
export function swapBuy(m: MarketSnapshot, spendUsd: number, usdIdr: number | null): PaperTrade | SwapError {
  const wallet = readWallet();
  if (!wallet) return "balance";
  const out = buyWith(wallet, read(), m, spendUsd, usdIdr);
  if ("error" in out) return out.error;
  commit(out.trades, out.wallet);
  return out.trade;
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

/** A token's open paper trades, oldest first, with what they hold together and what it cost. */
export function holdingsOf(trades: PaperTrade[], tokenId: string): { tokens: number; costUsd: number; open: PaperTrade[] } {
  const open = trades.filter((t) => t.tokenId === tokenId && remainingOf(t) > 0).sort((a, b) => a.openedAt - b.openedAt);
  let tokens = 0;
  let costUsd = 0;
  for (const t of open) {
    const left = remainingOf(t);
    tokens += left;
    costUsd += (t.spentUsd * left) / t.tokens;
  }
  return { tokens, costUsd, open };
}

/**
 * Sells `tokens` of a token in one go (priced as one sale, so its price impact is the whole amount's), taken
 * from its open trades oldest first; each gets its share of what it brought in, and the wallet the whole of it.
 * Pure: the wallet and trades after it, or why not.
 */
export function sellFrom(
  wallet: PaperWallet | null,
  trades: PaperTrade[],
  tokenId: string,
  tokens: number,
  m: MarketSnapshot,
  now = Date.now(),
): { wallet: PaperWallet | null; trades: PaperTrade[]; proceedsUsd: number; tokens: number } | { error: SwapError } {
  const held = holdingsOf(trades, tokenId);
  if (!(tokens > 0) || !(held.tokens > 0) || tokens > held.tokens * (1 + 1e-9)) return { error: "holdings" };
  const amount = Math.min(tokens, held.tokens);
  const fill = quoteSell(m, amount);
  if (!fill) return { error: "price" };
  const sales = new Map<string, Sale>();
  let left = amount;
  for (const t of held.open) {
    if (left <= amount * 1e-12) break;
    const take = Math.min(remainingOf(t), left);
    // The last one takes what's left of the trade outright, so no dust stays behind.
    const all = take >= remainingOf(t) * (1 - 1e-9);
    sales.set(t.id, { at: now, tokens: all ? remainingOf(t) : take, proceedsUsd: (fill.proceedsUsd * take) / amount, priceUsd: m.priceUsd });
    left -= take;
  }
  return {
    wallet: wallet && { ...wallet, cashUsd: wallet.cashUsd + fill.proceedsUsd },
    trades: trades.map((t) => (sales.has(t.id) ? { ...t, sales: [...t.sales, sales.get(t.id)!] } : t)),
    proceedsUsd: fill.proceedsUsd,
    tokens: amount,
  };
}

/** Sells `tokens` of a token from your paper trades, into the wallet. What it brought in, or why not. */
export function swapSell(tokenId: string, tokens: number, m: MarketSnapshot): { proceedsUsd: number; tokens: number } | SwapError {
  const out = sellFrom(readWallet(), read(), tokenId, tokens, m);
  if ("error" in out) return out.error;
  commit(out.trades, out.wallet);
  return { proceedsUsd: out.proceedsUsd, tokens: out.tokens };
}

/** Sells part or all of one paper trade, into the wallet. Returns the updated trade, or null when it can't be priced. */
export function sellPaperTrade(id: string, fraction: number, m: MarketSnapshot): PaperTrade | null {
  const list = read();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const next = paperSell(list[i], fraction, m);
  if (!next) return null;
  const wallet = readWallet();
  const proceeds = next.sales[next.sales.length - 1].proceedsUsd;
  commit(
    list.map((t, j) => (j === i ? next : t)),
    wallet && { ...wallet, cashUsd: wallet.cashUsd + proceeds },
  );
  return next;
}

export function removePaperTrade(id: string) {
  write(read().filter((t) => t.id !== id));
}

/** Every paper trade and the wallet: a fresh start. */
export function clearPaperTrades() {
  commit(EMPTY, null);
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
