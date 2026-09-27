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
