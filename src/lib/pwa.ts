"use client";

// Installing Rankr as an app. Chromium browsers fire `beforeinstallprompt` once the page is installable;
// it is kept here so an "Install app" button can show the browser's own dialog later. Safari has no such
// event: on iPhone and iPad the app is added from the Share menu, so the button explains that instead.

import { useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * - `installed`: running as the installed app (or just installed from this page).
 * - `prompt`: the browser can show its install dialog, see `promptInstall`.
 * - `ios`: iPhone / iPad, installed from Share → Add to Home Screen.
 * - `manual`: anything else; the browser's menu has the install item, if it has one.
 */
export type InstallState = "installed" | "prompt" | "ios" | "manual";

let deferred: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function readState(): InstallState {
  if (justInstalled || isStandalone()) return "installed";
  if (deferred) return "prompt";
  return isIos() ? "ios" : "manual";
}

if (typeof window !== "undefined") {
  // Listen from the first script run: the event can fire before any button is on screen.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    justInstalled = true;
    emit();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", emit);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The install state, or null while server rendering / hydrating. */
export function useInstallState(): InstallState | null {
  return useSyncExternalStore(subscribe, readState, () => null);
}

/** Shows the browser's install dialog. Resolves true when the user installs. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // The event can only be used once.
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") justInstalled = true;
  emit();
  return outcome === "accepted";
}
