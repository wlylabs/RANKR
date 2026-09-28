import { describe, expect, it } from "vitest";
import { passes } from "./token-filters";

const token = (mc: number | null, vol: number | null, liq: number | null) => ({
  marketCap: mc,
  fdv: null,
  volume24h: vol,
  liquidityUsd: liq,
});

describe("passes", () => {
  it("keeps a token with $1K market cap, volume and liquidity, drops one below any", () => {
    expect(passes(token(1_000, 1_000, 1_000))).toBe(true);
    expect(passes(token(999, 50_000, 50_000))).toBe(false); // market cap
    expect(passes(token(50_000, 12, 50_000))).toBe(false); // a dead token: no volume
    expect(passes(token(50_000, 50_000, 300))).toBe(false); // liquidity
  });

  it("doesn't count what the DEX doesn't give against a token", () => {
    // A pump.fun token on its bonding curve: no liquidity figure.
    expect(passes(token(20_000, 8_000, null))).toBe(true);
    expect(passes({ ...token(null, 5_000, 5_000), fdv: 400 })).toBe(false); // FDV stands in for market cap
  });
});
