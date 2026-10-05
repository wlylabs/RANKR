"use client";

// The currency paper trades are shown in: US dollars or Indonesian rupiah, picked in the settings menu and
// kept in the browser (rupiah by default where the browser speaks Indonesian). Every amount is kept in USD;
// rupiah is for showing it, at the day's rate (/api/fx). Without a rate, amounts stay in dollars.

import { useSyncExternalStore } from "react";
import useSWR from "swr";
import { fetcher } from "./hooks";
import { formatMoney, type Currency } from "./money";
import type { FxResponse } from "./types";

export { formatMoney, type Currency };

export type FxRate = NonNullable<FxResponse["rate"]>;

const KEY = "rankr:currency";
const listeners = new Set<() => void>();

function read(): Currency {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "usd" || v === "idr") return v;
    return navigator.language?.toLowerCase().startsWith("id") ? "idr" : "usd";
  } catch {
    return "usd";
  }
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

export function useCurrency(): Currency {
  return useSyncExternalStore(subscribe, read, () => "usd");
}

export function setCurrency(currency: Currency) {
  try {
    localStorage.setItem(KEY, currency);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

/** Rupiah per dollar, once an hour at most: null until known, or when no source answers (`loading` tells which). */
export function useUsdIdr(enabled = true): { rate: FxRate | null; loading: boolean } {
  const { data, error, isLoading } = useSWR<FxResponse>(enabled ? "/api/fx" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3_600_000,
  });
  return { rate: data?.rate ?? null, loading: enabled && isLoading && !data && !error };
}

/** What to show amounts in, with what: rupiah only once its rate is known. */
export function useMoney() {
  const currency = useCurrency();
  const { rate, loading } = useUsdIdr(currency === "idr");
  const shown: Currency = currency === "idr" && rate ? "idr" : "usd";
  return {
    /** Picked in the settings. */
    currency,
    /** Actually shown (dollars while the rupiah rate isn't known). */
    shown,
    rate,
    /** Rupiah picked, but no rate to show them at: none of the sources answered. */
    rateMissing: currency === "idr" && !rate && !loading,
    format: (usd: number, opts?: { signed?: boolean; short?: boolean }) => formatMoney(usd, shown, rate?.usdIdr ?? null, opts),
  };
}

/** Shortcuts for a paper buy, round in each currency; any other amount can be typed. */
const IDR_PRESETS = [500_000, 1_000_000, 5_000_000, 10_000_000];
const USD_PRESETS = [50, 100, 500, 1000];

/** The amounts offered for a paper buy, in USD, with how each reads in the currency shown. */
export function spendPresets(shown: Currency, usdIdr: number | null): { usd: number; label: string }[] {
  if (shown === "idr" && usdIdr) {
    return IDR_PRESETS.map((idr) => ({ usd: idr / usdIdr, label: formatMoney(idr / usdIdr, "idr", usdIdr, { short: true }) }));
  }
  return USD_PRESETS.map((usd) => ({ usd, label: `$${usd.toLocaleString("en-US")}` }));
}

// What a typed amount can end in: "2,5 jt", "500rb", "10k", "1.5m". In rupiah "m" is a miliar, as Indonesians
// write it; in dollars, a million.
const IDR_SUFFIXES: Record<string, number> = { k: 1e3, rb: 1e3, ribu: 1e3, jt: 1e6, juta: 1e6, m: 1e9, miliar: 1e9, b: 1e9, t: 1e12, triliun: 1e12 };
const USD_SUFFIXES: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9, t: 1e12 };

/**
 * A number typed with separators either way. Both kinds: the last one marks decimals. One kind, more than once:
 * thousands. Once: the currency's own decimal mark ("." in dollars, "," in rupiah) is decimals; the other is
 * thousands when three digits follow ("1.500" rupiah, "1,500" dollars), else decimals ("1.5 jt", "2,5").
 */
function toNumber(s: string, decimal: "." | ","): number {
  const dot = s.split(".").length - 1;
  const comma = s.split(",").length - 1;
  let mark: "." | "," | null = null;
  if (dot && comma) mark = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dot + comma === 1) {
    const sep = dot ? "." : ",";
    mark = sep === decimal || !/^\d{3}$/.test(s.slice(s.indexOf(sep) + 1)) ? sep : null;
  }
  const whole = mark ? s.slice(0, s.lastIndexOf(mark)) : s;
  const frac = mark ? s.slice(s.lastIndexOf(mark) + 1) : "";
  return Number(`${whole.replace(/[.,]/g, "")}.${frac || "0"}`);
}

/**
 * An amount typed in the currency shown ("1.500.000", "Rp 2,5 jt", "250", "$1.2k"), in USD; null when it isn't
 * an amount.
 */
export function parseAmount(input: string, shown: Currency, usdIdr: number | null): number | null {
  const s = input
    .toLowerCase()
    .replace(/\b(rp|idr|usd)\b|rp(?=\d)|\$/g, "")
    .replace(/\s+/g, "");
  const m = /^(\d[\d.,]*)([a-z]*)$/.exec(s);
  if (!m) return null;
  const idr = shown === "idr";
  const unit = m[2] ? (idr ? IDR_SUFFIXES : USD_SUFFIXES)[m[2]] : 1;
  if (!unit) return null;
  const n = toNumber(m[1], idr ? "," : ".") * unit;
  if (!Number.isFinite(n) || n <= 0) return null;
  return idr && usdIdr ? n / usdIdr : n;
}
