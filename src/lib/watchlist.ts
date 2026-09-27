"use client";

// The watchlist: tokens starred on this device (newest first), tracked like calls but without an entry of
// your own. Kept in the browser, so it needs no account.

import { useSyncExternalStore } from "react";

const KEY = "rankr:watch:v1";
const EMPTY: string[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) {
    let value = EMPTY;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      value = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : EMPTY;
    } catch {
      /* corrupted entry, start over */
    }
    cache = { raw, value };
  }
  return cache.value;
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
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

export function useWatchlist(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Stars or unstars a token. Returns whether it is watched now. */
export function toggleWatch(id: string): boolean {
  const ids = read();
  const watched = ids.includes(id);
  write(watched ? ids.filter((x) => x !== id) : [id, ...ids]);
  return !watched;
}
