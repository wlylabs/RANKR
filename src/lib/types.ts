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

/** A caller's public profile: board numbers and calls, newest first. */
export type CallerProfileResponse = { caller: CallerView; calls: CallView[]; updatedAt: number };

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

export type MeResponse = { account: { id: string; username: string | null; hasKey: boolean; official: boolean } };

/** A new sign-in key, returned once. */
export type KeyResponse = MeResponse & { key: string };
