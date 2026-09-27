"use client";

// The watchlist: tokens saved on this device (newest first), without a call. Private: nothing is sent to
// Rankr, the token doesn't join the boards, and it needs no account. Each entry keeps the price when it was
// saved, so the list shows the x since then. Tokens Rankr doesn't track can be watched too.

import { useSyncExternalStore } from "react";
import { tokenId } from "./address";
import type { MarketSnapshot, TokenView } from "./types";

export type Watched = {
  /** Token id, "<chain>:<address>" (see tokenId). */
  id: string;
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  /** Price and market cap when saved. Null for a token starred before these were kept, until filled in. */
  priceUsd: number | null;
  marketCap: number | null;
  /** When saved (ms). */
  at: number;
};

const KEY = "rankr:watch:v2";
/** Before v2: token ids only, of tokens on Rankr. */
const OLD_KEY = "rankr:watch:v1";
const EMPTY: Watched[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Watched[] } = { raw: null, value: EMPTY };

function fromId(id: string): Watched | null {
  const at = id.indexOf(":");
  if (at < 1) return null;
  return { id, chainId: id.slice(0, at), address: id.slice(at + 1), symbol: "", name: "", priceUsd: null, marketCap: null, at: 0 };
}

function isWatched(x: unknown): x is Watched {
  const w = x as Watched;
  return !!w && typeof w.id === "string" && typeof w.chainId === "string" && typeof w.address === "string" && typeof w.at === "number";
}

function load(): string | null {
  let raw = localStorage.getItem(KEY);
  if (raw === null) {
    // First read since v2: bring the starred ids over.
    const old = localStorage.getItem(OLD_KEY);
    if (old === null) return null;
    try {
      const ids: unknown = JSON.parse(old);
      raw = JSON.stringify(Array.isArray(ids) ? ids.flatMap((id) => (typeof id === "string" ? (fromId(id) ?? []) : [])) : []);
      localStorage.setItem(KEY, raw);
      localStorage.removeItem(OLD_KEY);
    } catch {
      return null;
    }
  }
  return raw;
}

function read(): Watched[] {
  let raw: string | null = null;
  try {
    raw = load();
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) {
    let value = EMPTY;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      value = Array.isArray(parsed) ? parsed.filter(isWatched) : EMPTY;
    } catch {
      /* corrupted entry, start over */
    }
    cache = { raw, value };
  }
  return cache.value;
}

function write(list: Watched[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
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

export function useWatchlist(): Watched[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** A watchlist entry at the price now, for a token on Rankr or from live data for one that isn't. */
export function watchedFrom(t: TokenView | MarketSnapshot, now = Date.now()): Watched {
  const tracked = "seal" in t;
  return {
    id: tracked ? t.id : tokenId(t.chainId, t.address),
    chainId: t.chainId,
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    priceUsd: tracked ? t.entryPriceUsd * t.multiple : t.priceUsd,
    marketCap: tracked ? t.marketCap : (t.marketCap ?? t.fdv),
    at: now,
  };
}

/** Saves a token (first in the list); a token already on it stays as it is. */
export function watch(entry: Watched) {
  const list = read();
  if (!list.some((w) => w.id === entry.id)) write([entry, ...list]);
}

export function unwatch(id: string) {
  write(read().filter((w) => w.id !== id));
}

/** Fills in what an entry starred before v2 is missing (price, name), measured from the token's first paste. */
export function settle(id: string, t: TokenView) {
  const list = read();
  const i = list.findIndex((w) => w.id === id && w.priceUsd == null);
  if (i < 0) return;
  const next = [...list];
  next[i] = { ...list[i], symbol: t.symbol, name: t.name, priceUsd: t.entryPriceUsd, marketCap: t.entryMarketCap, at: t.firstPastedAt };
  write(next);
}
