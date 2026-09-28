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
