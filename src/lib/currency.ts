"use client";

// The currency paper trades are shown in: US dollars or Indonesian rupiah, picked in the settings menu and
// kept in the browser (rupiah by default where the browser speaks Indonesian). Every amount is kept in USD;
// rupiah is for showing it, at the day's rate (/api/fx). Without a rate, amounts stay in dollars.

import { useSyncExternalStore } from "react";
import useSWR from "swr";
import { formatUsd } from "./format";
import { fetcher } from "./hooks";
import { SIM_MAX_USD, SIM_MIN_USD } from "./sim";
import type { FxResponse } from "./types";

export type Currency = "usd" | "idr";
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

/** Rupiah per dollar, once an hour at most; null until known, or when no source answers. */
export function useUsdIdr(enabled = true): FxRate | null {
  const { data } = useSWR<FxResponse>(enabled ? "/api/fx" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3_600_000,
  });
  return data?.rate ?? null;
}

const IDR = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
// From a billion, written out ("miliar"): the short "M" reads as million in English.
const IDR_LONG = new Intl.NumberFormat("id-ID", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });
const IDR_SHORT = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const USD = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * An amount in USD, shown in `currency`: "$1,234.56" (from $100K: "$1.23M"), or "Rp1.650.000" (from a billion:
 * "Rp1,6 miliar"). `signed`: "+" before a gain, "-" before a loss. Rupiah needs `usdIdr`; without it, dollars.
 * Rupiah are at one rate, today's, for every amount: a paper trade's profit doesn't move with the exchange rate.
 * `short`, for tight spots: "$140", "$1.2K"; "Rp2,7 jt", "Rp740 rb".
 */
export function formatMoney(
  usd: number,
  currency: Currency,
  usdIdr: number | null,
  { signed = false, short = false } = {},
): string {
  if (!Number.isFinite(usd)) return "—";
  const sign = signed && usd > 0 ? "+" : usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (currency === "idr" && usdIdr) {
    const idr = abs * usdIdr;
    if (short && idr < 1e9) return `${sign}Rp${IDR_SHORT.format(idr).replace(/\u00a0/g, " ")}`;
    return `${sign}Rp${(idr >= 1e9 ? IDR_LONG : IDR).format(idr).replace(/\u00a0/g, " ")}`;
  }
  return abs >= 100_000 || (short && abs >= 1) ? `${sign}${formatUsd(abs)}` : `${sign}$${USD.format(abs)}`;
}

/** What to show amounts in, with what: rupiah only once its rate is known. */
export function useMoney() {
  const currency = useCurrency();
  const rate = useUsdIdr(currency === "idr");
  const shown: Currency = currency === "idr" && rate ? "idr" : "usd";
  return {
    /** Picked in the settings. */
    currency,
    /** Actually shown (dollars while the rupiah rate isn't known). */
    shown,
    rate,
    format: (usd: number, opts?: { signed?: boolean; short?: boolean }) => formatMoney(usd, shown, rate?.usdIdr ?? null, opts),
  };
}

/** Round rupiah amounts for the paper presets, kept inside $100-$1000 at the day's rate. */
const IDR_PRESETS = [2_000_000, 5_000_000, 10_000_000, 15_000_000];
const USD_PRESETS = [100, 250, 500, 1000];

/** The amounts offered for a paper buy, in USD, with how each reads in the currency shown. */
export function spendPresets(shown: Currency, usdIdr: number | null): { usd: number; label: string }[] {
  if (shown === "idr" && usdIdr) {
    const fits = IDR_PRESETS.map((idr) => idr / usdIdr).filter((usd) => usd >= SIM_MIN_USD && usd <= SIM_MAX_USD);
    if (fits.length >= 2) return fits.map((usd) => ({ usd, label: formatMoney(usd, "idr", usdIdr, { short: true }) }));
  }
  return USD_PRESETS.map((usd) => ({ usd, label: `$${usd.toLocaleString("en-US")}` }));
}

/** An amount typed in the currency shown ("1.500.000", "250", "2,5"), in USD; null when it isn't a number. */
export function parseAmount(input: string, shown: Currency, usdIdr: number | null): number | null {
  const s = input.replace(/[^\d.,]/g, "");
  if (!s) return null;
  // Rupiah: dots group thousands and a comma marks decimals. Dollars: the other way round.
  const n = shown === "idr" ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return shown === "idr" && usdIdr ? n / usdIdr : n;
}
