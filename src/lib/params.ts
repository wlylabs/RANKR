// Leaderboard query options shared by the client (URLs) and the server (parsing).

export const SORT_KEYS = ["top", "peak", "losers", "new", "hot"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

// No 30d: the boards reset monthly, so "all" is already this month (see season.ts).
export const RANGES = { "24h": 86_400_000, "7d": 7 * 86_400_000, all: null } as const;
export type RangeKey = keyof typeof RANGES;

export function parseSort(value: string | null | undefined): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "top";
}

export function parseRange(value: string | null | undefined): RangeKey {
  return value && value in RANGES ? (value as RangeKey) : "all";
}

/**
 * A token at this multiple or below (−70% or worse from its first paste) is dead: it leaves the token boards
 * (it's back if it recovers) and the background refresh checks it hourly instead of every minute. Calls on it
 * stay and still count on the caller board, and it still shows in searches, watchlists and callers' calls.
 */
export const DEAD_MULTIPLE = 0.3;
export const DEAD_REFRESH_MS = 3_600_000;

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

/** Calls a caller needs to be on the caller board for `sort`. */
export function minCallsFor(sort: CallerSort): number {
  return sort === "avg" || sort === "rate" ? MIN_CALLS_RANKED : 1;
}

/**
 * Paste limits: a burst limit per IP, and a daily one per account (a guest gets fewer than an account with a
 * saved key; official accounts have none). Kept in Postgres when Supabase is set up (src/lib/rate-limit.ts).
 */
export const PASTE_LIMITS = { ipPerMinute: 20, guestPerDay: 30, keyedPerDay: 200 } as const;

/** Feed filters. "top": callers on the first page of the caller board. */
export const FEED_SCOPES = ["all", "top"] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

export const FEED_KINDS = ["all", "call", "milestone"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export function parseFeedScope(value: string | null | undefined): FeedScope {
  return FEED_SCOPES.includes(value as FeedScope) ? (value as FeedScope) : "all";
}

export function parseFeedKind(value: string | null | undefined): FeedKind {
  return FEED_KINDS.includes(value as FeedKind) ? (value as FeedKind) : "all";
}

/** "Top callers" in the feed: this many from the top of the caller board (by hit rate). */
export const FEED_TOP_CALLERS = 25;
