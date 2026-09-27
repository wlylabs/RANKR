"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import useSWR, { mutate } from "swr";
import useSWRInfinite from "swr/infinite";
import type { CallerSort, RangeKey, SortKey } from "./params";
import { authedFetcher } from "./supabase-browser";
import type { CallerProfileResponse, CallersResponse, MyCallsResponse, StatsResponse, TokenView, TokensResponse } from "./types";

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export type TokensParams = {
  sort?: SortKey;
  range?: RangeKey;
  chain?: string | null;
  q?: string | null;
  ids?: string[];
  limit?: number;
  offset?: number;
};

/** SWR key for a token query, or null when there is nothing to ask for. */
export function tokensKey(p: TokensParams): string | null {
  if (p.ids && !p.ids.length) return null;
  const qs = new URLSearchParams();
  if (p.sort) qs.set("sort", p.sort);
  if (p.range && p.range !== "all") qs.set("range", p.range);
  if (p.chain) qs.set("chain", p.chain);
  if (p.q) qs.set("q", p.q);
  if (p.ids) qs.set("ids", p.ids.join(","));
  if (p.limit) qs.set("limit", String(p.limit));
  if (p.offset) qs.set("offset", String(p.offset));
  return `/api/tokens?${qs}`;
}

const LIVE = { refreshInterval: 20_000, keepPreviousData: true } as const;

export function useTokens(params: TokensParams) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<TokensResponse>(tokensKey(params), fetcher, LIVE);
  return {
    tokens: data?.tokens ?? [],
    total: data?.total ?? 0,
    updatedAt: data?.updatedAt ?? null,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}

/** A leaderboard read in pages of `pageSize`; `loadMore` fetches the next one. */
export function useTokenPages(params: Omit<TokensParams, "limit" | "offset" | "ids">, pageSize = 50) {
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<TokensResponse>(
    (i, prev: TokensResponse | null) =>
      prev && prev.tokens.length < pageSize ? null : tokensKey({ ...params, limit: pageSize, offset: i * pageSize }),
    fetcher,
    // revalidateAll: every loaded page refreshes on the live interval. (revalidateFirstPage: false, used
    // before, stopped the interval from fetching anything, so the board never moved on its own.)
    { ...LIVE, revalidateAll: true },
  );
  const tokens = data?.flatMap((p) => p.tokens) ?? [];
  return {
    tokens,
    total: data?.[0]?.total ?? 0,
    updatedAt: data?.[0]?.updatedAt ?? null,
    error,
    isLoading,
    isValidating,
    loadMore: () => setSize(size + 1),
    mutate,
  };
}

/** A caller's public profile, refreshed like the boards. */
export function useCallerProfile(username: string, enabled = true) {
  return useSWR<CallerProfileResponse>(
    enabled ? `/api/callers/${encodeURIComponent(username)}` : null,
    fetcher,
    { ...LIVE, keepPreviousData: false },
  );
}

/** Caller leaderboard in pages of `pageSize`. */
export function useCallerPages(sort: CallerSort, pageSize = 50) {
  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<CallersResponse>(
    (i, prev: CallersResponse | null) =>
      prev && prev.callers.length < pageSize ? null : `/api/callers?sort=${sort}&limit=${pageSize}&offset=${i * pageSize}`,
    fetcher,
    // revalidateAll: every loaded page refreshes on the live interval. (revalidateFirstPage: false, used
    // before, stopped the interval from fetching anything, so the board never moved on its own.)
    { ...LIVE, revalidateAll: true },
  );
  return {
    callers: data?.flatMap((p) => p.callers) ?? [],
    total: data?.[0]?.total ?? 0,
    enabled: data?.[0]?.enabled ?? true,
    error,
    isLoading,
    isValidating,
    loadMore: () => setSize(size + 1),
  };
}

export function useStats() {
  const { data, error, isLoading } = useSWR<StatsResponse>("/api/stats", fetcher, LIVE);
  return { stats: data ?? null, error, isLoading };
}

/** The signed-in account's calls (none when `userId` is null). */
export function useAccountCalls(userId: string | null) {
  // No keepPreviousData: after switching accounts, never show the last one's calls.
  return useSWR<MyCallsResponse>(userId ? `/api/me/calls?u=${userId}` : null, authedFetcher, { refreshInterval: 20_000 });
}

/** Revalidates every board and stat on the page, e.g. after a paste. */
export function refreshBoards() {
  // `includes` also matches the "$inf$..." keys of paged boards.
  return mutate(
    (key) => typeof key === "string" && ["/api/tokens", "/api/stats", "/api/me/calls", "/api/callers"].some((p) => key.includes(p)),
  );
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

// ---- Device calls: without accounts (local dev), "My calls" are the tokens this browser pasted,
// with the entry at the moment of *your* paste.

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
