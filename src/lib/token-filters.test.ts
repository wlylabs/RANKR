import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, passes } from "./token-filters";

const token = (mc: number | null, vol: number | null, liq: number | null, txns?: number | null) => ({
  marketCap: mc,
  fdv: null,
  volume24h: vol,
  liquidityUsd: liq,
  txns24h: txns,
});

describe("passes", () => {
  it("keeps a token at or above every minimum, drops one below any", () => {
    expect(passes(token(1_000, 1_000, 1_000), DEFAULT_FILTERS)).toBe(true);
    expect(passes(token(999, 50_000, 50_000), DEFAULT_FILTERS)).toBe(false); // market cap
    expect(passes(token(50_000, 12, 50_000), DEFAULT_FILTERS)).toBe(false); // a dead token: no volume
    expect(passes(token(50_000, 50_000, 300), DEFAULT_FILTERS)).toBe(false); // liquidity
    expect(passes(token(50_000, 50_000, 50_000, 4), { ...DEFAULT_FILTERS, txns: 10 })).toBe(false); // transactions
  });

  it("doesn't count what the DEX doesn't give against a token", () => {
    // A pump.fun token on its bonding curve: no liquidity figure; old snapshots: no transactions.
    expect(passes(token(20_000, 8_000, null, undefined), { mc: 1_000, vol: 1_000, liq: 1_000, txns: 100 })).toBe(true);
    expect(passes({ ...token(null, 5_000, 5_000), fdv: 400 }, DEFAULT_FILTERS)).toBe(false); // FDV stands in for market cap
  });

  it("lets everything through when every minimum is any", () => {
    expect(passes(token(0, 0, 0, 0), { mc: 0, vol: 0, liq: 0, txns: 0 })).toBe(true);
  });
});
