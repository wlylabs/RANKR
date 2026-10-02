// What a shared trail says (a post on X, the phone's share sheet), next to its link and image. Facts only, as
// on the case file: where the money went, named as the public lists name it, never an accusation.
import type { CaseExit } from "./case";

/**
 * "Following the money from 7xKX…9f2a on Rankr. It reached Binance deposit (2 hops) and OKX." Without an
 * exchange, bridge or mixer reached yet, just the first sentence.
 */
export function traceShareText(name: string, exits: CaseExit[]): string {
  const base = `Following the money from ${name} on Rankr.`;
  const [a, b] = exits;
  if (!a) return base;
  const first = `${a.name}${a.hops > 1 ? ` (${a.hops} hops)` : ""}`;
  return `${base} It reached ${b ? `${first} and ${b.name}` : first}.`;
}

/** The image's file name when saved: rankr-trace-GBERmTgu.png (the tall card), rankr-trace-GBERmTgu-wide.png. */
export function traceImageFile(address: string, wide = false): string {
  const clean = address.replace(/[^\w]/g, "");
  const id = clean.length > 8 ? `${clean.slice(0, 4)}${clean.slice(-4)}` : clean;
  return `rankr-trace-${id}${wide ? "-wide" : ""}.png`;
}
