"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import useSWR, { mutate } from "swr";
import useSWRInfinite from "swr/infinite";
import { MAX_LIMIT, type FeedKind, type FeedScope } from "./params";
import { authedFetcher } from "./supabase-browser";
import type {
  CallerProfileResponse,
  FeedResponse,
  MarketSnapshot,
  MyCallsResponse,
  MyRecapsResponse,
  StatsResponse,
  TokenView,
  TokensResponse,
  WatchlistResponse,
} from "./types";

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const LIVE = { refreshInterval: 20_000, keepPreviousData: true } as const;

/** Live data for the tracked tokens among `ids` (from tokenId), at most MAX_LIMIT of them. */
export function useTokens(ids: string[]) {
  const key = ids.length ? `/api/tokens?ids=${ids.slice(0, MAX_LIMIT).map(encodeURIComponent).join(",")}` : null;
  const { data, error, isLoading } = useSWR<TokensResponse>(key, fetcher, LIVE);
  return { tokens: data?.tokens ?? [], error, isLoading };
}

/** Live data for watched tokens (ids from tokenId), by id: Rankr's record when it tracks one, else the DEX's. */
export function useWatchlistMarkets(ids: string[]) {
  const key = ids.length ? `/api/watchlist?ids=${ids.slice(0, MAX_LIMIT).map(encodeURIComponent).join(",")}` : null;
  const { data, error, isLoading } = useSWR<WatchlistResponse>(key, fetcher, LIVE);
  const items = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  return { items, error, isLoading };
}

/** The live market of a watched token, whichever way it came. */
export function marketOf(item: WatchlistResponse["items"][number] | undefined): MarketSnapshot | null {
  return item?.token?.market ?? item?.market ?? null;
}

/** A caller's public profile, refreshed live. */
export function useCallerProfile(username: string, enabled = true) {
  return useSWR<CallerProfileResponse>(
    enabled ? `/api/callers/${encodeURIComponent(username)}` : null,
    fetcher,
    { ...LIVE, keepPreviousData: false },
  );
}

export type FeedParams = {
  scope?: FeedScope;
  kind?: FeedKind;
  chain?: string | null;
  /** The signed-in account, for scope "you" (nothing to ask for without one). */
  userId?: string | null;
};

/** SWR key for a feed query, or null when there is nothing to ask for. */
export function feedKey(p: FeedParams, limit: number, offset = 0): string | null {
  const qs = new URLSearchParams();
  if (p.scope && p.scope !== "all") qs.set("scope", p.scope);
  // Your own entries: keyed by account, so switching accounts never shows the last one's.
  if (p.scope === "you") {
    if (!p.userId) return null;
    qs.set("u", p.userId);
  }
  if (p.kind && p.kind !== "all") qs.set("kind", p.kind);
  if (p.chain) qs.set("chain", p.chain);
  qs.set("limit", String(limit));
  if (offset) qs.set("offset", String(offset));
  return `/api/feed?${qs}`;
}

/** The newest feed entries (the ticker). Sent with the session, which scope "you" needs. */
export function useFeed(params: FeedParams, limit = 20) {
  const { data, error, isLoading } = useSWR<FeedResponse>(feedKey(params, limit), authedFetcher, LIVE);
  return { items: data?.items ?? [], error, isLoading };
}

/**
 * The feed in pages of `pageSize`; an entry that slides onto the next page as new ones arrive shows once.
 * Other filters start empty rather than showing the last ones' entries (the page tells new from seen).
 */
export function useFeedPages(params: FeedParams, pageSize = 30) {
  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<FeedResponse>(
    (i, prev: FeedResponse | null) => (prev && prev.items.length < pageSize ? null : feedKey(params, pageSize, i * pageSize)),
    authedFetcher,
    { refreshInterval: LIVE.refreshInterval, revalidateAll: true },
  );
  const seen = new Set<string>();
  const items = (data?.flatMap((p) => p.items) ?? []).filter((i) => !seen.has(i.id) && !!seen.add(i.id));
  const last = data?.[data.length - 1];
  return {
    items,
    hasMore: !!last && last.items.length === pageSize && size * pageSize < 500,
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

/** The signed-in account's monthly recaps (none when `userId` is null). They change once a month. */
export function useRecaps(userId: string | null) {
  // No keepPreviousData: after switching accounts, never show the last one's recaps.
  return useSWR<MyRecapsResponse>(userId ? `/api/me/recaps?u=${userId}` : null, authedFetcher, { revalidateOnFocus: false });
}

/** The signed-in account's calls (none when `userId` is null). */
export function useAccountCalls(userId: string | null) {
  // No keepPreviousData: after switching accounts, never show the last one's calls.
  return useSWR<MyCallsResponse>(userId ? `/api/me/calls?u=${userId}` : null, authedFetcher, { refreshInterval: 20_000 });
}

/** Revalidates every live list and stat on the page, e.g. after a paste. */
export function refreshLive() {
  // `includes` also matches the "$inf$..." keys of paged lists.
  return mutate(
    (key) =>
      typeof key === "string" &&
      ["/api/tokens", "/api/stats", "/api/me/calls", "/api/callers", "/api/feed"].some((p) => key.includes(p)),
  );
}

const noSubscribe = () => () => {};

/**
 * False while the server renders and while the page hydrates, true after: for text that depends on the
 * visitor's clock (a countdown), which a prerendered page would otherwise have from its build.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
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
    /* storage full or blocked; the call is still recorded on Rankr */
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

export function useMyCalls(): MyCall[] {
  return useSyncExternalStore(subscribe, readCalls, () => EMPTY);
}
