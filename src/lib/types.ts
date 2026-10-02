export type Link = { label: string; url: string };

/** Live market data for a token, taken from its most liquid DEX pair. */
export type MarketSnapshot = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  priceUsd: number;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  /** Buys and sells in the last 24 hours; null (or absent, in snapshots stored before it) when unknown. */
  txns24h?: number | null;
  pairAddress: string;
  dexId: string;
  url: string;
  pairCreatedAt: number | null;
  websites: Link[];
  socials: Link[];
  fetchedAt: number;
};

/** A token as recorded by Rankr. The entry is locked at the first paste. */
export type TokenRecord = {
  id: string;
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  imageUrl: string | null;

  entryPriceUsd: number;
  entryMarketCap: number | null;
  firstPastedAt: number;
  lastPastedAt: number;
  pasteCount: number;

  peakPriceUsd: number;
  peakAt: number;
  lowPriceUsd: number;
  lowAt: number;

  /** Last market data we saw, kept so lists render without a live fetch. */
  market: MarketSnapshot | null;
  lastCheckedAt: number;
};

export type TokenView = TokenRecord & {
  /** Current price / entry price. 2 = 2x, 0.5 = -50%. */
  multiple: number;
  peakMultiple: number;
  lowMultiple: number;
  /** Estimated current market cap (live value, or entry MC scaled by the multiple). */
  marketCap: number | null;
  /** True when the latest refresh failed and the numbers are from an older check. */
  stale: boolean;
  /** SHA-256 over the locked entry (chain, address, entry price, first paste time). */
  seal: string;
};

export type TrackResponse = {
  status: "created" | "existing";
  token: TokenView;
  /** The signed-in caller's call on the token (their own entry). */
  call?: { created: boolean; entryPriceUsd: number; calledAt: number } | null;
};

/** A caller's call: their own entry on a token. */
export type CallView = {
  tokenId: string;
  entryPriceUsd: number;
  entryMarketCap: number | null;
  calledAt: number;
  /** Token price now / this caller's entry. */
  multiple: number;
  token: TokenView;
};

export type MyCallsResponse = { calls: CallView[] };

export type CallerView = {
  userId: string;
  username: string;
  /** An official account: shown with a check badge. */
  official: boolean;
  calls: number;
  /** Calls at 2x or more right now. */
  hits: number;
  /** Calls above entry right now. */
  wins: number;
  avgMultiple: number;
  bestMultiple: number;
  bestToken: { id: string; address: string; symbol: string; name: string; chainId: string } | null;
};

export type CallersResponse = { enabled: boolean; total: number; callers: CallerView[]; updatedAt: number };

/** The signed-in caller's place on the caller board for one sort (rankr_caller_rank). */
export type MyRankResponse = {
  /** Callers on the board. */
  total: number;
  /** All of the caller's calls, on the board or not. */
  calls: number;
  /** From 1; null off the board (fewer calls than the sort needs), and then `caller` is null too. */
  rank: number | null;
  caller: CallerView | null;
  /** The caller one place up; null at #1. */
  ahead: CallerView | null;
};

/**
 * What a caller says about themselves (see src/lib/profile.ts). On a public profile `x` is there only once
 * verified; the account's own view has it either way.
 */
export type CallerAbout = {
  bio: string | null;
  x: string | null;
  xVerified: boolean;
  telegram: string | null;
  /** A full http(s) link. */
  website: string | null;
};

/** One caller's call on one token, from their own entry: its public page and share card. */
export type CallResponse = { caller: Pick<CallerView, "userId" | "username" | "official">; call: CallView; updatedAt: number };

/** A caller's public profile: board numbers, bio and links, and calls, newest first. */
export type CallerProfileResponse = { caller: CallerView; about: CallerAbout; calls: CallView[]; updatedAt: number };

/**
 * One entry of the feed: a new call ("@userx called $SHIB at $1.2B mc") or a call reaching a milestone
 * ("$PEPE hit 10x from @userx's call").
 */
export type FeedItem = {
  /** Unique per entry. */
  id: string;
  kind: "call" | "milestone";
  /** The milestone reached (10 = 10x from the caller's entry); null for a call. */
  tier: number | null;
  /** When the call was made or the milestone reached. */
  at: number;
  /** Null when accounts are off: the entry is a plain paste, not someone's call. */
  username: string | null;
  official: boolean;
  /** The caller's board numbers: calls, and calls at 2x+ right now. */
  caller: { calls: number; hits: number } | null;
  token: { id: string; chainId: string; address: string; symbol: string; name: string };
  /** Market cap at this call's entry. */
  entryMarketCap: number | null;
  /** Price now / this call's entry. */
  multiple: number;
};

export type FeedResponse = { items: FeedItem[]; updatedAt: number };

export type TokensResponse = {
  tokens: TokenView[];
  /** Matching tokens in total (for paging). */
  total: number;
  updatedAt: number;
};

export type StatsResponse = {
  total: number;
  /** Tokens that peaked at 2x (price doubled) or more. */
  doubled: number;
  inRed: number;
  best: TokenView | null;
  chains: string[];
  updatedAt: number;
};

/** The news page's tabs: trending (what people search for and read right now, where memes come from), crypto. */
export type NewsCategory = "trending" | "crypto";

/** A headline (src/lib/news.ts): only the headline, the publisher and the link. */
export type NewsItem = {
  id: string;
  title: string;
  /** The article (through Google News). */
  url: string;
  /** The publisher, e.g. "Yonhap News Agency". */
  source: string | null;
  publishedAt: number;
  /** What a token named after the story would be called, best first: "Bukang-i", "Busan". */
  keywords: string[];
  category: NewsCategory;
  /**
   * Google searches for the story's topic in the last day, summed over the countries it trends in (Google Trends'
   * approx_traffic, a floor); null when it isn't a trending search.
   */
  searches: number | null;
};

export type NewsResponse = { items: NewsItem[]; updatedAt: number };

/**
 * Live tokens named after a story, most traded first, for the reader to pick from: DEX data, and Rankr's
 * multiple since the first paste for the ones it tracks.
 */
export type NamesakesResponse = { items: { market: MarketSnapshot; multiple: number | null }[]; updatedAt: number };

/** A month that ended: its top 10 callers and tokens, kept when the boards reset (public.seasons). */
export type Season = {
  /** The month's first day, "2026-09-01". */
  month: string;
  endedAt: number;
  counts: { tokens: number; calls: number; callers: number };
  /** By hit rate, callers with 5+ calls, as on the caller board then. Names as they are now. */
  callers: { userId: string; username: string; official: boolean; calls: number; hits: number; avgMultiple: number; bestMultiple: number }[];
  /** By peak x since the first paste. `firstCaller`: who called it first, by today's name. */
  tokens: {
    id: string;
    chainId: string;
    address: string;
    symbol: string;
    name: string;
    entryMarketCap: number | null;
    peakMultiple: number;
    firstCaller: string | null;
  }[];
};

export type SeasonResponse = { last: Season | null };

/** A paste looked up before it's called or watched: live data, and Rankr's record if it tracks the token. */
export type LookupResponse = { preview: MarketSnapshot; token: TokenView | null };

/** Live data for watched tokens: Rankr's record when it tracks one, else straight from the DEX. */
export type WatchlistResponse = {
  items: { id: string; token: TokenView | null; market: MarketSnapshot | null }[];
  updatedAt: number;
};

export type TokenResponse = {
  token: TokenView | null;
  /** Live data for a token Rankr has not recorded yet. */
  preview: MarketSnapshot | null;
};

export type MeResponse = {
  account: { id: string; username: string | null; hasKey: boolean; official: boolean; about: CallerAbout };
};

/** A new sign-in key, returned once. */
export type KeyResponse = MeResponse & { key: string };
