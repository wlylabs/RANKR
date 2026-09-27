"use client";

import { addMyCall, refreshBoards } from "./hooks";
import { apiFetch, ensureSession } from "./supabase-browser";
import type { TrackResponse } from "./types";

/** Sends a paste to Rankr, saves it to "My calls" and refreshes the board. */
export async function trackPaste(input: string, chain?: string): Promise<TrackResponse & { firstCallByYou: boolean }> {
  await ensureSession(); // first paste gets an anonymous id, so the paste counts as your call
  const res = await apiFetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, chain }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Try again.");
  const result = body as TrackResponse;
  const firstCallByYou = addMyCall(result.token);
  void refreshBoards();
  return { ...result, firstCallByYou };
}
