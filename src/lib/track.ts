"use client";

import { mutate } from "swr";
import { TOKENS_KEY, addMyCall } from "./hooks";
import type { TrackResponse } from "./types";

/** Sends a paste to Rankr, saves it to "My calls" and refreshes the board. */
export async function trackPaste(input: string, chain?: string): Promise<TrackResponse & { firstCallByYou: boolean }> {
  const res = await fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, chain }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Try again.");
  const result = body as TrackResponse;
  const firstCallByYou = addMyCall(result.token);
  void mutate(TOKENS_KEY);
  return { ...result, firstCallByYou };
}
