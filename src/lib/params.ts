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

export const CALLER_SORTS = ["hits", "avg", "best", "calls"] as const;
export type CallerSort = (typeof CALLER_SORTS)[number];

export function parseCallerSort(value: string | null | undefined): CallerSort {
  return CALLER_SORTS.includes(value as CallerSort) ? (value as CallerSort) : "hits";
}

/** Average x is only meaningful with a few calls behind it. */
export const MIN_CALLS_FOR_AVG = 3;
