// Leaderboard query options shared by the client (URLs) and the server (parsing).

export const SORT_KEYS = ["top", "peak", "losers", "new", "hot"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const RANGES = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: null } as const;
export type RangeKey = keyof typeof RANGES;

export function parseSort(value: string | null | undefined): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "top";
}

export function parseRange(value: string | null | undefined): RangeKey {
  return value && value in RANGES ? (value as RangeKey) : "all";
}

/** Max rows per request, and max ids in one `ids` lookup. */
export const MAX_LIMIT = 100;

/**
 * Caller board sorts. "rate" (share of calls at 2x+) is the default: counting 2x calls alone rewards pasting
 * everything, while a rate rewards picking well.
 */
export const CALLER_SORTS = ["rate", "avg", "hits", "best", "calls"] as const;
export type CallerSort = (typeof CALLER_SORTS)[number];

export function parseCallerSort(value: string | null | undefined): CallerSort {
  return CALLER_SORTS.includes(value as CallerSort) ? (value as CallerSort) : "rate";
}

/** Hit rate and average x only count callers with this many calls, so one lucky call can't top the board. */
export const MIN_CALLS_RANKED = 5;

/**
 * Paste limits: a burst limit per IP, and a daily one per account (a guest gets fewer than an account with a
 * saved key; official accounts have none). Kept in Postgres when Supabase is set up (src/lib/rate-limit.ts).
 */
export const PASTE_LIMITS = { ipPerMinute: 20, guestPerDay: 30, keyedPerDay: 200 } as const;
