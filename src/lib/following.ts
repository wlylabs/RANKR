"use client";

// Callers followed on this device (newest first), for the feed's "Following" filter, and the feed filter
// the ticker shows. Kept in the browser like the watchlist, so following needs no account.

import { useSyncExternalStore } from "react";
import { parseFeedScope, type FeedScope } from "./params";

export type Followed = { userId: string; username: string };

const KEY = "rankr:following:v1";
const SCOPE_KEY = "rankr:feed:scope";
const EMPTY: Followed[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Followed[] } = { raw: null, value: EMPTY };

function read(): Followed[] {
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
      value = Array.isArray(parsed)
        ? parsed.filter(
            (f): f is Followed => !!f && typeof f.userId === "string" && typeof f.username === "string",
          )
        : EMPTY;
    } catch {
      /* corrupted entry, start over */
    }
    cache = { raw, value };
  }
  return cache.value;
}

function readScope(): FeedScope {
  try {
    return parseFeedScope(localStorage.getItem(SCOPE_KEY));
  } catch {
    return "all";
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === SCOPE_KEY) && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFollowing(): Followed[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Follows or unfollows a caller. Returns whether they are followed now. */
export function toggleFollow(caller: Followed): boolean {
  const list = read();
  const followed = list.some((f) => f.userId === caller.userId);
  set(KEY, JSON.stringify(followed ? list.filter((f) => f.userId !== caller.userId) : [caller, ...list]));
  return !followed;
}

/** The feed filter picked on the feed page; the ticker under the header follows it. */
export function useFeedScope(): FeedScope {
  return useSyncExternalStore(subscribe, readScope, () => "all");
}

export function setFeedScope(scope: FeedScope) {
  set(SCOPE_KEY, scope);
}
