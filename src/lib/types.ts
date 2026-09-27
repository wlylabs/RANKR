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
};

export type TrackResponse = {
  status: "created" | "existing";
  token: TokenView;
};

export type TokensResponse = {
  tokens: TokenView[];
  updatedAt: number;
};

export type TokenResponse = {
  token: TokenView | null;
  /** Live data for a token Rankr has not recorded yet. */
  preview: MarketSnapshot | null;
};
