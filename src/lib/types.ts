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

/**
 * What a caller says about themselves (see src/lib/profile.ts). On a public profile `x` is there only once
 * verified; the account's own view has it either way.
 */
export type CallerAbout = { bio: string | null; x: string | null; xVerified: boolean; telegram: string | null };

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
