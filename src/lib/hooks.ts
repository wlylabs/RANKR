"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import type { TokenView, TokensResponse } from "./types";

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const TOKENS_KEY = "/api/tokens";

export function useTokens() {
  const { data, error, isLoading, mutate } = useSWR<TokensResponse>(TOKENS_KEY, fetcher, {
    refreshInterval: 20_000,
    keepPreviousData: true,
  });
  return { tokens: data?.tokens ?? [], updatedAt: data?.updatedAt ?? null, error, isLoading, mutate };
}

/** Re-renders every `ms` so relative times stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// ---- "My calls": the tokens this browser pasted, with the entry at the moment of *your* paste.

export type MyCall = {
  id: string;
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  entryPriceUsd: number;
  entryMarketCap: number | null;
  pastedAt: number;
};

const CALLS_KEY = "rankr:calls:v1";
const EMPTY: MyCall[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: MyCall[] } = { raw: null, value: EMPTY };

function readCalls(): MyCall[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CALLS_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) {
    let value = EMPTY;
    try {
      value = raw ? (JSON.parse(raw) as MyCall[]) : EMPTY;
    } catch {
      /* corrupted entry, start over */
    }
    cache = { raw, value };
  }
  return cache.value;
}

function writeCalls(calls: MyCall[]) {
  try {
    localStorage.setItem(CALLS_KEY, JSON.stringify(calls));
  } catch {
    /* storage full or blocked; the call still exists on the global board */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === CALLS_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Saves the paste as your call. A token you already called keeps your original entry. */
export function addMyCall(token: TokenView, now = Date.now()): boolean {
  const calls = readCalls();
  if (calls.some((c) => c.id === token.id)) return false;
  const priceNow = token.market?.priceUsd || token.entryPriceUsd;
  writeCalls([
    {
      id: token.id,
      chainId: token.chainId,
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      imageUrl: token.imageUrl,
      entryPriceUsd: priceNow,
      entryMarketCap: token.marketCap,
      pastedAt: now,
    },
    ...calls,
  ]);
  return true;
}

export function removeMyCall(id: string) {
  writeCalls(readCalls().filter((c) => c.id !== id));
}

export function useMyCalls(): MyCall[] {
  return useSyncExternalStore(subscribe, readCalls, () => EMPTY);
}
