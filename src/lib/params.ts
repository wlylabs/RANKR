// Query options and limits shared by the client (URLs) and the server (parsing).

/**
 * A token at this multiple or below (−70% or worse from its first paste) is dead: the background refresh
 * checks it hourly instead of every minute (every minute again if it recovers). Calls on it stay.
 */
export const DEAD_MULTIPLE = 0.3;
export const DEAD_REFRESH_MS = 3_600_000;

/** Max rows per request, and max ids in one `ids` lookup. */
export const MAX_LIMIT = 100;

/** A caller's hit rate is only shown once they have this many calls, so one lucky call doesn't read as 100%. */
export const MIN_CALLS_RATED = 5;

/**
 * Paste limits: a burst limit per IP, and a daily one per account (a guest gets fewer than an account with a
 * saved key; official accounts have none). Kept in Postgres when Supabase is set up (src/lib/rate-limit.ts).
 */
export const PASTE_LIMITS = { ipPerMinute: 20, guestPerDay: 30, keyedPerDay: 200 } as const;

/** Feed filters. "you": the signed-in caller's own. */
export const FEED_SCOPES = ["all", "you"] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

export const FEED_KINDS = ["all", "call", "milestone"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export function parseFeedScope(value: string | null | undefined): FeedScope {
  return FEED_SCOPES.includes(value as FeedScope) ? (value as FeedScope) : "all";
}

export function parseFeedKind(value: string | null | undefined): FeedKind {
  return FEED_KINDS.includes(value as FeedKind) ? (value as FeedKind) : "all";
}
