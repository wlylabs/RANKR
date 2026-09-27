"use client";

// Milestone alerts: a notification when one of your calls or a watched token reaches a new milestone
// (2x, 3x, 5x, 10x...). Checked on every live refresh while Rankr is open; opt-in from the settings menu.

import { useSyncExternalStore } from "react";
import { milestoneOf } from "./metrics";

export type AlertItem = { key: string; symbol: string; multiple: number; href: string; kind: "call" | "watch" };
export type Alert = { item: AlertItem; milestone: number };

/**
 * New milestones since last time. The first sighting of an item only records where it stands (no alert
 * for a call that was already 5x before alerts were on); after that, each higher milestone alerts once.
 */
export function milestoneAlerts(items: AlertItem[], seen: Record<string, number>) {
  const next = { ...seen };
  const alerts: Alert[] = [];
  for (const item of items) {
    const reached = milestoneOf(item.multiple) ?? 0;
    const before = next[item.key];
    if (before === undefined) next[item.key] = reached;
    else if (reached > before) {
      alerts.push({ item, milestone: reached });
      next[item.key] = reached;
    }
  }
  return { alerts, seen: next };
}

const ON_KEY = "rankr:alerts:on";
const SEEN_KEY = "rankr:alerts:seen:v1";
const listeners = new Set<() => void>();

export function alertsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function readOn(): boolean {
  try {
    return alertsSupported() && Notification.permission === "granted" && localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Alerts are on: switched on here and allowed by the browser. */
export function useAlertsOn(): boolean {
  return useSyncExternalStore(subscribe, readOn, () => false);
}

/** Turns alerts on (asking the browser first) or off. Resolves to the new state. */
export async function setAlerts(on: boolean): Promise<boolean> {
  if (on && alertsSupported() && Notification.permission !== "granted") {
    await Notification.requestPermission();
  }
  try {
    if (on) localStorage.setItem(ON_KEY, "1");
    else localStorage.removeItem(ON_KEY);
  } catch {
    /* storage blocked: alerts stay off */
  }
  listeners.forEach((l) => l());
  return readOn();
}

export function readSeen(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function writeSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage full or blocked */
  }
}

/** Shows the alert through the service worker (works in the installed app and background tabs). */
export async function notify({ item, milestone }: Alert) {
  const title = `$${item.symbol} hit ${milestone}x`;
  const options: NotificationOptions = {
    body: item.kind === "call" ? "Your call, measured from your entry." : "On your watchlist, since its first paste.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `${item.key}:${milestone}`,
    data: { url: item.href },
  };
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options); // no service worker (dev)
}
