import type { CallerSort } from "./params";
import type { CallView, CallerView } from "./types";

type Stats = Pick<CallerView, "calls" | "hits" | "wins" | "avgMultiple" | "bestMultiple" | "bestToken">;

/**
 * A caller's numbers from their calls, the same way the caller board counts them (rankr_callers):
 * hits are calls at 2x or more right now, wins are calls above entry right now, each measured from
 * the caller's own entry.
 */
export function callerStats(calls: CallView[]): Stats {
  let hits = 0;
  let wins = 0;
  let sum = 0;
  let best: CallView | null = null;
  for (const c of calls) {
    if (c.multiple >= 2) hits++;
    if (c.multiple > 1.005) wins++;
    sum += c.multiple;
    if (!best || c.multiple > best.multiple) best = c;
  }
  return {
    calls: calls.length,
    hits,
    wins,
    avgMultiple: calls.length ? sum / calls.length : 1,
    bestMultiple: best?.multiple ?? 1,
    bestToken: best
      ? {
          id: best.token.id,
          address: best.token.address,
          symbol: best.token.symbol,
          name: best.token.name,
          chainId: best.token.chainId,
        }
      : null,
  };
}

type Ranked = Pick<CallerView, "calls" | "hits" | "avgMultiple" | "bestMultiple">;

const rate = (c: Ranked) => c.hits / Math.max(c.calls, 1);

function gapX(d: number): string | null {
  return d >= 0.005 ? `${d.toFixed(d >= 100 ? 0 : d >= 10 ? 1 : 2)}x` : null;
}

/**
 * How far `me` is behind `ahead` in the number the caller board sorts by: "6 pts" (of hit rate), "2 hits",
 * "0.35x", "3 calls". Null when they are level as shown (the board's tie-breaks put `ahead` first).
 */
export function behind(sort: CallerSort, me: Ranked, ahead: Ranked): string | null {
  switch (sort) {
    case "rate": {
      const pts = Math.round(rate(ahead) * 100) - Math.round(rate(me) * 100);
      return pts > 0 ? `${pts} ${pts === 1 ? "pt" : "pts"}` : null;
    }
    case "hits": {
      const n = ahead.hits - me.hits;
      return n > 0 ? `${n} ${n === 1 ? "hit" : "hits"}` : null;
    }
    case "calls": {
      const n = ahead.calls - me.calls;
      return n > 0 ? `${n} ${n === 1 ? "call" : "calls"}` : null;
    }
    case "avg":
      return gapX(ahead.avgMultiple - me.avgMultiple);
    case "best":
      return gapX(ahead.bestMultiple - me.bestMultiple);
  }
}

/** Where a caller's calls are now: a loss (below entry), under 2x, or a hit, bucketed by size. */
export const SPREAD = [
  { key: "loss", label: "loss", min: 0, tone: "down" },
  { key: "1x", label: "1-2x", min: 1, tone: "mid" },
  { key: "2x", label: "2-5x", min: 2, tone: "up" },
  { key: "5x", label: "5-10x", min: 5, tone: "up" },
  { key: "10x", label: "10-100x", min: 10, tone: "up" },
  { key: "100x", label: "100x+", min: 100, tone: "up" },
] as const;

export type SpreadBucket = (typeof SPREAD)[number] & { count: number };

/** How many calls sit in each SPREAD bucket right now, measured from each call's own entry. */
export function callSpread(multiples: number[]): SpreadBucket[] {
  const out: SpreadBucket[] = SPREAD.map((b) => ({ ...b, count: 0 }));
  for (const m of multiples) {
    if (!Number.isFinite(m)) continue;
    // The last bucket whose floor the multiple reaches.
    let i = out.length - 1;
    while (i > 0 && m < out[i].min) i--;
    out[i].count++;
  }
  return out;
}

/**
 * Recent form: the newest `n` calls (newest first), how many of them are above entry and at 2x+ right now,
 * and the streak of calls above entry counting back from the newest. Same lines as the caller board.
 */
export function recentForm<T extends { calledAt: number; multiple: number }>(calls: T[], n = 10) {
  const recent = [...calls].sort((a, b) => b.calledAt - a.calledAt).slice(0, n);
  const up = recent.filter((c) => c.multiple > 1.005).length;
  const hits = recent.filter((c) => c.multiple >= 2).length;
  let streak = 0;
  while (streak < recent.length && recent[streak].multiple > 1.005) streak++;
  return { recent, up, hits, streak };
}
