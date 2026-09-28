"use client";

// The minimums a token named after a story must meet to be listed under it, so dead ones stay out: market cap,
// 24h volume, liquidity and 24h transactions, as DexScreener's and GMGN's screeners filter. Picked on the news
// page and kept in this browser, the same for every story.

import { useSyncExternalStore } from "react";
import type { MarketSnapshot } from "./types";

export type TokenFilters = { mc: number; vol: number; liq: number; txns: number };

/** $1K market cap, volume and liquidity; any number of transactions. */
export const DEFAULT_FILTERS: TokenFilters = { mc: 1_000, vol: 1_000, liq: 1_000, txns: 0 };

/** The choices for each minimum; 0 is "any". */
export const USD_STEPS = [0, 1_000, 10_000, 100_000, 1_000_000] as const;
export const TXNS_STEPS = [0, 10, 100, 1_000] as const;

/**
 * Whether a token meets the minimums. A number the DEX doesn't give (a pump.fun token still on its bonding
 * curve has no liquidity figure) doesn't count against it: only a known number below a minimum does.
 */
export function passes(
  m: Pick<MarketSnapshot, "marketCap" | "fdv" | "volume24h" | "liquidityUsd" | "txns24h">,
  f: TokenFilters,
): boolean {
  const below = (value: number | null | undefined, min: number) =>
    min > 0 && value !== null && value !== undefined && value < min;
  return !(
    below(m.marketCap ?? m.fdv, f.mc) ||
    below(m.volume24h, f.vol) ||
    below(m.liquidityUsd, f.liq) ||
    below(m.txns24h, f.txns)
  );
}

const KEY = "rankr:news:token-filters";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: TokenFilters } = { raw: null, value: DEFAULT_FILTERS };

/** A saved choice, or the default for anything missing or not one of the steps. */
function read(): TokenFilters {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return DEFAULT_FILTERS;
  }
  if (raw !== cache.raw) {
    let value = DEFAULT_FILTERS;
    try {
      const saved = raw ? (JSON.parse(raw) as Partial<TokenFilters>) : {};
      const pick = (v: unknown, steps: readonly number[], fallback: number) =>
        typeof v === "number" && steps.includes(v) ? v : fallback;
      value = {
        mc: pick(saved.mc, USD_STEPS, DEFAULT_FILTERS.mc),
        vol: pick(saved.vol, USD_STEPS, DEFAULT_FILTERS.vol),
        liq: pick(saved.liq, USD_STEPS, DEFAULT_FILTERS.liq),
        txns: pick(saved.txns, TXNS_STEPS, DEFAULT_FILTERS.txns),
      };
    } catch {
      /* corrupted entry, use the defaults */
    }
    cache = { raw, value };
  }
  return cache.value;
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

export function useTokenFilters(): TokenFilters {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_FILTERS);
}

export function setTokenFilters(filters: TokenFilters) {
  try {
    localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    /* storage full or blocked */
  }
  listeners.forEach((l) => l());
}
