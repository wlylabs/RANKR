"use client";

// The feed filter picked on the feed page (everyone or top callers), kept in the browser; the ticker under
// the header shows the same one.

import { useSyncExternalStore } from "react";
import { parseFeedScope, type FeedScope } from "./params";

const KEY = "rankr:feed:scope";
const listeners = new Set<() => void>();

function read(): FeedScope {
  try {
    return parseFeedScope(localStorage.getItem(KEY));
  } catch {
    return "all";
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

export function useFeedScope(): FeedScope {
  return useSyncExternalStore(subscribe, read, () => "all");
}

export function setFeedScope(scope: FeedScope) {
  try {
    localStorage.setItem(KEY, scope);
  } catch {
    /* storage full or blocked */
  }
  listeners.forEach((l) => l());
}
