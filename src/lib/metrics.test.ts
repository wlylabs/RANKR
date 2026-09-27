import { describe, expect, it } from "vitest";
import { bestPair, type Pair } from "./dexscreener";
import { applySnapshot, milestoneOf, milestonePrice, newRecord, tierOf, toView } from "./metrics";
import type { MarketSnapshot } from "./types";

function snap(priceUsd: number, marketCap: number | null = priceUsd * 1e9): MarketSnapshot {
  return {
    chainId: "solana",
    address: "Mint111111111111111111111111111111111111111",
    name: "Test",
    symbol: "TEST",
    imageUrl: null,
    priceUsd,
    marketCap,
    fdv: marketCap,
    liquidityUsd: 10_000,
    volume24h: 50_000,
    priceChange24h: 0,
    pairAddress: "pair",
    dexId: "raydium",
    url: "https://dexscreener.com/solana/pair",
    pairCreatedAt: null,
    websites: [],
    socials: [],
    fetchedAt: 0,
  };
}

describe("records", () => {
  it("locks the entry at first paste and tracks peak / low", () => {
    const rec = newRecord(snap(0.0001), "solana:x", 1_000);
    expect(toView(rec, 1_000).multiple).toBe(1);

    const pumped = applySnapshot(rec, snap(0.0005), 2_000);
    const dumped = applySnapshot(pumped, snap(0.00004), 3_000);
    const view = toView(dumped, 3_000);

    expect(view.entryPriceUsd).toBe(0.0001);
    expect(view.multiple).toBeCloseTo(0.4);
    expect(view.peakMultiple).toBeCloseTo(5);
    expect(view.peakAt).toBe(2_000);
    expect(view.lowMultiple).toBeCloseTo(0.4);
    expect(view.marketCap).toBeCloseTo(40_000);
  });

  it("estimates market cap from the multiple when the API has none", () => {
    const rec = newRecord(snap(0.001, 1_000_000), "solana:x", 0);
    const view = toView(applySnapshot(rec, { ...snap(0.003), marketCap: null, fdv: null }, 1));
    expect(view.marketCap).toBeCloseTo(3_000_000);
  });

  it("flags stale data", () => {
    const rec = newRecord(snap(1), "solana:x", 0);
    expect(toView(rec, 60_000).stale).toBe(false);
    expect(toView(rec, 10 * 60_000).stale).toBe(true);
  });
});

describe("tiers and milestones (1x = +100%)", () => {
  it("buckets multiples", () => {
    expect(tierOf(11)).toBe("moon"); // +1,000% = 10x
    expect(tierOf(10.9)).toBe("pump");
    expect(tierOf(2)).toBe("pump"); // doubled = 1x
    expect(tierOf(1.3)).toBe("up");
    expect(tierOf(1)).toBe("flat");
    expect(tierOf(0.6)).toBe("down");
    expect(tierOf(0.05)).toBe("rekt");
  });

  it("maps milestones to price multiples", () => {
    expect(milestonePrice(1)).toBe(2);
    expect(milestonePrice(10)).toBe(11);
    expect(milestoneOf(1.9)).toBeNull();
    expect(milestoneOf(2)).toBe(1);
    expect(milestoneOf(7.3)).toBe(5); // +630%
    expect(milestoneOf(120)).toBe(100);
  });
});

describe("bestPair", () => {
  const pair = (pairAddress: string, liq: number | undefined, vol = 0, priceUsd = "1"): Pair => ({
    chainId: "solana",
    dexId: "raydium",
    url: "",
    pairAddress,
    baseToken: { address: "A", name: "A", symbol: "A" },
    quoteToken: { address: "SOL", name: "SOL", symbol: "SOL" },
    priceUsd,
    liquidity: liq === undefined ? undefined : { usd: liq },
    volume: { h24: vol },
  });

  it("picks the most liquid priced pair", () => {
    expect(bestPair([pair("a", 5_000), pair("b", 90_000), pair("c", 20_000)])?.pairAddress).toBe("b");
    expect(bestPair([pair("a", undefined, 10), pair("b", undefined, 99)])?.pairAddress).toBe("b");
    expect(bestPair([pair("a", 1e9, 0, ""), pair("b", 1)])?.pairAddress).toBe("b");
    expect(bestPair([])).toBeNull();
  });
});
