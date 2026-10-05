"use client";

// Paper trades: simulated swaps of any amount, kept on this device (newest first), no account and no real
// money. A paper wallet holds the cash (a balance you pick, topped up whenever): a buy takes from it, a sale
// pays into it. Each trade keeps what the buy filled at (src/lib/sim.ts) and every sale since, so its profit
// and loss is known whatever happens to the token: tokens Rankr no longer tracks (after the monthly reset) are
// priced from live DEX data, like the watchlist.

import { useSyncExternalStore } from "react";
import { tokenId } from "./address";
import { SIM_MODEL, grossSell, isFresh, poolOf, quoteBuy, quoteSell, type Quality, type SellFill } from "./sim";
import type { MarketSnapshot } from "./types";

export type Sale = {
  at: number;
  tokens: number;
  /** What the sale brought in, all costs out. */
  proceedsUsd: number;
  /** The market price it was priced on. */
  priceUsd: number;
  /** The quote it was priced on ("<pair>:<fetchedAt>"), or "write-off" for one written off at nothing. */
  quote?: string;
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

/** Which quote a fill is on: the pair, and when its data was read. */
const quoteOf = (m: MarketSnapshot) => `${m.pairAddress}:${m.fetchedAt}`;

/**
 * A paper buy of `spendUsd` at the pair's price now, or null when it can't be filled (no price, a drained pool,
 * or a quote too old to fill at). Pure: nothing is saved.
 */
export function paperBuy(m: MarketSnapshot, spendUsd: number, usdIdr: number | null, now = Date.now()): PaperTrade | null {
  if (!isFresh(m, now)) return null;
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

/**
 * The list with `trade` first, keeping MAX_TRADES: the oldest closed trades make room. Null when every one is
 * still open: an open trade is never dropped.
 */
function withTrade(trades: PaperTrade[], trade: PaperTrade): PaperTrade[] | null {
  const list = [trade, ...trades];
  while (list.length > MAX_TRADES) {
    let drop = -1;
    for (let i = list.length - 1; i > 0 && drop < 0; i--) if (remainingOf(list[i]) === 0) drop = i;
    if (drop < 0) return null;
    list.splice(drop, 1);
  }
  return list;
}

/**
 * Why a paper swap didn't go through: not enough balance or tokens, no price, a quote too old to fill at, a
 * drained pool, or MAX_TRADES trades all still open.
 */
export type SwapError = "balance" | "holdings" | "price" | "stale" | "drained" | "full";

/** Why `m` can't be filled at right now, if it can't. */
function unfillable(m: MarketSnapshot, now: number): SwapError | null {
  if (!(m.priceUsd > 0)) return "price";
  if (!isFresh(m, now)) return "stale";
  if (poolOf(m).drained) return "drained";
  return null;
}

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
  const why = unfillable(m, now);
  if (why) return { error: why };
  const trade = paperBuy(m, Math.min(spendUsd, wallet.cashUsd), usdIdr, now);
  if (!trade) return { error: "price" };
  const list = withTrade(trades, trade);
  if (!list) return { error: "full" };
  return { wallet: { ...wallet, cashUsd: Math.max(0, wallet.cashUsd - trade.spentUsd) }, trades: list, trade };
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

/** Tokens of a token already sold on this very quote, across its trades. */
function soldOnQuote(trades: PaperTrade[], id: string, quote: string): number {
  let n = 0;
  for (const t of trades) if (t.tokenId === id) for (const s of t.sales) if (s.quote === quote) n += s.tokens;
  return n;
}

/**
 * What selling `tokens` brings in on top of `prior` already sold on the same quote, all costs out. A paper sale
 * doesn't move the real pool, so pieces sold on one quote are priced as what each adds to the whole: selling in
 * pieces never beats selling at once.
 */
function proceedsAfter(m: MarketSnapshot, prior: number, tokens: number): number {
  return Math.max(0, grossSell(m, prior + tokens) - grossSell(m, prior) - poolOf(m).networkUsd);
}

/**
 * `fraction` (0.25, 0.5, 1) of what's left sold at the pair's price now, `prior` tokens of it already sold on
 * this quote. Pure: the trade with the sale, or null when it can't be filled.
 */
export function paperSell(t: PaperTrade, fraction: number, m: MarketSnapshot, now = Date.now(), prior = 0): PaperTrade | null {
  const left = remainingOf(t);
  if (!(left > 0) || !(fraction > 0) || !(m.priceUsd > 0) || !isFresh(m, now)) return null;
  const tokens = fraction >= 1 ? left : left * fraction;
  return {
    ...t,
    sales: [...t.sales, { at: now, tokens, proceedsUsd: proceedsAfter(m, prior, tokens), priceUsd: m.priceUsd, quote: quoteOf(m) }],
  };
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
  if (!(m.priceUsd > 0)) return { error: "price" };
  if (!isFresh(m, now)) return { error: "stale" };
  const amount = Math.min(tokens, held.tokens);
  const quote = quoteOf(m);
  const proceeds = proceedsAfter(m, soldOnQuote(trades, tokenId, quote), amount);
  const sales = new Map<string, Sale>();
  let left = amount;
  for (const t of held.open) {
    if (left <= amount * 1e-12) break;
    const take = Math.min(remainingOf(t), left);
    // The last one takes what's left of the trade outright, so no dust stays behind.
    const all = take >= remainingOf(t) * (1 - 1e-9);
    sales.set(t.id, { at: now, tokens: all ? remainingOf(t) : take, proceedsUsd: (proceeds * take) / amount, priceUsd: m.priceUsd, quote });
    left -= take;
  }
  return {
    wallet: wallet && { ...wallet, cashUsd: wallet.cashUsd + proceeds },
    trades: trades.map((t) => (sales.has(t.id) ? { ...t, sales: [...t.sales, sales.get(t.id)!] } : t)),
    proceedsUsd: proceeds,
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

/**
 * Sells part or all of one paper trade, into the wallet. `sales`: how many sales the trade had when the button
 * was pressed, so a second click (a double-click, or a click on a row that moved) sells nothing. Returns the
 * updated trade, or null when nothing was sold.
 */
export function sellPaperTrade(id: string, fraction: number, m: MarketSnapshot, sales?: number): PaperTrade | null {
  const list = read();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0 || (sales !== undefined && list[i].sales.length !== sales)) return null;
  const next = paperSell(list[i], fraction, m, Date.now(), soldOnQuote(list, list[i].tokenId, quoteOf(m)));
  if (!next) return null;
  const wallet = readWallet();
  const proceeds = next.sales[next.sales.length - 1].proceedsUsd;
  commit(
    list.map((t, j) => (j === i ? next : t)),
    wallet && { ...wallet, cashUsd: wallet.cashUsd + proceeds },
  );
  return next;
}

/** What's left of a trade written off at nothing (a token with no market left): it closes, at a loss. */
export function writeOff(t: PaperTrade, now = Date.now()): PaperTrade {
  const left = remainingOf(t);
  return left > 0 ? { ...t, sales: [...t.sales, { at: now, tokens: left, proceedsUsd: 0, priceUsd: 0, quote: "write-off" }] } : t;
}

export function writeOffPaperTrade(id: string) {
  write(read().map((t) => (t.id === id ? writeOff(t) : t)));
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
  /** Selling what's left now, when there's fresh live data: its value at the market price and what it would bring in. */
  now: SellFill | null;
  /** What the sales brought in, less what the sold tokens cost. */
  realizedUsd: number;
  /** What selling the rest now would bring in, less what it cost; null without fresh live data. */
  unrealizedUsd: number | null;
  /** Everything back (sold, plus selling the rest now) over what went in; null without fresh live data while open. */
  multiple: number | null;
};

/** Where a paper trade stands, sold on its own, given the pair's live data (null, or too old, counts as none). */
export function positionOf(t: PaperTrade, m: MarketSnapshot | null, at = Date.now()): Position {
  const remaining = remainingOf(t);
  const sold = t.tokens - remaining;
  const proceeds = t.sales.reduce((n, s) => n + s.proceedsUsd, 0);
  const realizedUsd = proceeds - (t.spentUsd * sold) / t.tokens;
  const costUsd = (t.spentUsd * remaining) / t.tokens;
  const now = remaining > 0 && m && isFresh(m, at) ? quoteSell(m, remaining) : null;
  const unrealizedUsd = remaining > 0 ? (now ? now.proceedsUsd - costUsd : null) : 0;
  const back = remaining > 0 ? (now ? proceeds + now.proceedsUsd : null) : proceeds;
  return { remaining, costUsd, now, realizedUsd, unrealizedUsd, multiple: back === null ? null : back / t.spentUsd };
}

export type PaperSummary = {
  trades: number;
  open: number;
  /** Everything that went in. */
  investedUsd: number;
  /** What the open trades' tokens would bring in now, each token's sold together (those with fresh live data). */
  openValueUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  /** Open trades without fresh live data right now: left out of the open value and unrealized. */
  unpriced: number;
};

/** Every trade together: a token held in several trades is valued as one sale of all of it, as it would sell. */
export function summaryOf(
  trades: PaperTrade[],
  marketOf: (tokenId: string) => MarketSnapshot | null,
  at = Date.now(),
): PaperSummary {
  const out: PaperSummary = { trades: trades.length, open: 0, investedUsd: 0, openValueUsd: 0, realizedUsd: 0, unrealizedUsd: 0, unpriced: 0 };
  const held = new Map<string, { tokens: number; costUsd: number; trades: number }>();
  for (const t of trades) {
    const p = positionOf(t, null, at);
    out.investedUsd += t.spentUsd;
    out.realizedUsd += p.realizedUsd;
    if (p.remaining > 0) {
      out.open++;
      const h = held.get(t.tokenId) ?? { tokens: 0, costUsd: 0, trades: 0 };
      held.set(t.tokenId, { tokens: h.tokens + p.remaining, costUsd: h.costUsd + p.costUsd, trades: h.trades + 1 });
    }
  }
  for (const [id, h] of held) {
    const m = marketOf(id);
    if (!m || !isFresh(m, at) || !(m.priceUsd > 0)) {
      out.unpriced += h.trades;
      continue;
    }
    const proceeds = Math.max(0, grossSell(m, h.tokens) - poolOf(m).networkUsd);
    out.openValueUsd += proceeds;
    out.unrealizedUsd += proceeds - h.costUsd;
  }
  return out;
}
