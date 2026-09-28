// The minimums a token named after a story must meet to be listed under it, so dead ones stay out: market
// cap, 24h volume and liquidity, as DexScreener's and GMGN's screeners filter.

import type { MarketSnapshot } from "./types";

/** $1K market cap (FDV when there's none), 24h volume and liquidity. */
export const MINIMUMS = { mc: 1_000, vol: 1_000, liq: 1_000 } as const;

/**
 * Whether a token meets the minimums. A number the DEX doesn't give (a pump.fun token still on its bonding
 * curve has no liquidity figure) doesn't count against it: only a known number below a minimum does.
 */
export function passes(m: Pick<MarketSnapshot, "marketCap" | "fdv" | "volume24h" | "liquidityUsd">): boolean {
  const below = (value: number | null | undefined, min: number) => value !== null && value !== undefined && value < min;
  return !(
    below(m.marketCap ?? m.fdv, MINIMUMS.mc) ||
    below(m.volume24h, MINIMUMS.vol) ||
    below(m.liquidityUsd, MINIMUMS.liq)
  );
}

export type CapTier = "high" | "mid" | "low";

/**
 * A memecoin's tier by market cap (FDV when there's none), on pump.fun's milestones: a token "graduates" from
 * its bonding curve to a DEX at about $69K, and few ever reach $1M. High: $1M and up; mid: $69K to $1M; low:
 * under $69K. Null when the market cap isn't known.
 */
export function capTier(m: Pick<MarketSnapshot, "marketCap" | "fdv">): CapTier | null {
  const mc = m.marketCap ?? m.fdv;
  if (mc === null || mc === undefined) return null;
  return mc >= 1_000_000 ? "high" : mc >= 69_000 ? "mid" : "low";
}
