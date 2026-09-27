"use client";

import { addMyCall, refreshBoards } from "./hooks";
import { accountsAvailable, apiFetch } from "./supabase-browser";
import type { LookupResponse, TrackResponse } from "./types";

/** A paste that failed. `code` says when the fix is to sign in or pick a username first. */
export class PasteError extends Error {
  constructor(
    message: string,
    readonly code?: "signin" | "username",
  ) {
    super(message);
  }
}

/** Sends a paste to Rankr, records it as your call and refreshes the boards. */
export async function trackPaste(input: string, chain?: string): Promise<TrackResponse & { firstCallByYou: boolean }> {
  const res = await apiFetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, chain }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body?.code === "signin" || body?.code === "username" ? body.code : undefined;
    throw new PasteError(body?.error ?? "Something went wrong. Try again.", code);
  }
  const result = body as TrackResponse;
  // With accounts, your calls live on your account. Without (local dev), on this device.
  const firstCallByYou = accountsAvailable ? !!result.call?.created : addMyCall(result.token);
  void refreshBoards();
  return { ...result, firstCallByYou };
}

/** Looks a paste up (live data, and Rankr's record if it has one) before it's called or watched. */
export async function lookupPaste(input: string): Promise<LookupResponse> {
  const res = await fetch(`/api/lookup?input=${encodeURIComponent(input)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body as LookupResponse;
}

// A paste that had to go through sign-in first. Kept in localStorage so that coming back to /?ca=...
// tracks it, while a /?ca=... link from someone else only fills the box.
const PENDING_KEY = "rankr:pending-paste";
const PENDING_MS = 60 * 60_000;

export function rememberPendingPaste(ca: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ca: ca.trim(), at: Date.now() }));
  } catch {
    /* storage blocked: the CA is still pre-filled after sign-in */
  }
}

/** True (once) when `ca` is the paste this browser sent through sign-in in the last hour. */
export function takePendingPaste(ca: string): boolean {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as { ca: string; at: number } | null;
    localStorage.removeItem(PENDING_KEY);
    return !!pending && pending.ca === ca.trim() && Date.now() - pending.at < PENDING_MS;
  } catch {
    return false;
  }
}
