import { describe, expect, it } from "vitest";
import { atMultiple, poolOf, quoteBuy, quoteSell, whatIf } from "./sim";
import type { MarketSnapshot } from "./types";

const SOL_USD = 150;

function pair(extra: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const priceUsd = extra.priceUsd ?? 0.0001;
  return {
    chainId: "solana",
    address: "AAA",
    name: "Alpha",
    symbol: "ALPHA",
    imageUrl: null,
    priceUsd,
    marketCap: 100_000,
    fdv: 100_000,
    liquidityUsd: 30_000,
    volume24h: null,
    priceChange24h: null,
    pairAddress: "pair",
    dexId: "raydium",
    quoteSymbol: "SOL",
    priceNative: priceUsd / SOL_USD,
    liquidityQuote: 15_000 / SOL_USD,
    url: "",
    pairCreatedAt: null,
    websites: [],
    socials: [],
    fetchedAt: 0,
    ...extra,
  };
}

describe("poolOf", () => {
  it("takes half the TVL as depth, or the quote side when it holds less", () => {
    expect(poolOf(pair())).toMatchObject({ fee: 0.0025, depthUsd: 15_000, quality: "good", curve: false });
    expect(poolOf(pair({ liquidityQuote: 5_000 / SOL_USD })).depthUsd).toBeCloseTo(5_000, 6);
    // Snapshots stored before the quote side was kept: half the TVL.
    expect(poolOf(pair({ liquidityQuote: undefined, priceNative: undefined })).depthUsd).toBe(15_000);
    expect(poolOf(pair({ liquidityUsd: null }))).toMatchObject({ depthUsd: null, quality: "none" });
  });

  it("knows the fee by DEX and pool kind, and says when it is guessing", () => {
    expect(poolOf(pair({ dexId: "uniswap", chainId: "ethereum", labels: ["v2"] }))).toMatchObject({ fee: 0.003, quality: "good" });
    expect(poolOf(pair({ dexId: "uniswap", chainId: "base", labels: ["v3"] }))).toMatchObject({ fee: 0.01, quality: "rough" });
    expect(poolOf(pair({ dexId: "raydium", labels: ["CLMM"] }))).toMatchObject({ fee: 0.01, quality: "rough" });
    expect(poolOf(pair({ dexId: "meteora", labels: ["DLMM"] })).quality).toBe("rough");
    expect(poolOf(pair({ dexId: "somedex" }))).toMatchObject({ fee: 0.01, quality: "rough" });
  });

  it("lowers PumpSwap's fee as the market cap in SOL grows", () => {
    expect(poolOf(pair({ dexId: "pumpswap", marketCap: 100 * SOL_USD })).fee).toBe(0.0125);
    expect(poolOf(pair({ dexId: "pumpswap", marketCap: 500 * SOL_USD })).fee).toBe(0.012);
    expect(poolOf(pair({ dexId: "pumpswap", marketCap: 20_000 * SOL_USD })).fee).toBe(0.0095);
    expect(poolOf(pair({ dexId: "pumpswap", marketCap: 200_000 * SOL_USD })).fee).toBe(0.003);
    // Without the SOL price it can't tell the tier: the highest, and a guess.
    expect(poolOf(pair({ dexId: "pumpswap", priceNative: null }))).toMatchObject({ fee: 0.0125, quality: "rough" });
  });

  it("derives a pump.fun curve's depth from its market cap", () => {
    // At launch: 27.96 SOL of market cap is the curve's 30 virtual SOL.
    expect(poolOf(pair({ dexId: "pumpfun", marketCap: 27.96 * SOL_USD })).depthUsd).toBeCloseTo(30 * SOL_USD, 0);
    // $10K of market cap with SOL at $150: about $6.9K deep.
    const p = poolOf(pair({ dexId: "pumpfun", marketCap: 10_000 }));
    expect(p).toMatchObject({ fee: 0.0125, quality: "good", curve: true });
    expect(p.depthUsd!).toBeGreaterThan(6_900);
    expect(p.depthUsd!).toBeLessThan(7_000);
  });

  it("costs about 0.002 SOL a trade on Solana, a flat amount elsewhere", () => {
    expect(poolOf(pair()).networkUsd).toBeCloseTo(0.3, 9);
    expect(poolOf(pair({ chainId: "base", quoteSymbol: "WETH" })).networkUsd).toBe(0.05);
    expect(poolOf(pair({ chainId: "ethereum", quoteSymbol: "WETH" })).networkUsd).toBe(3);
  });
});

describe("quoteBuy", () => {
  it("matches Uniswap v2's getAmountOut", () => {
    // getAmountOut(a, Rin, Rout) = a·997·Rout / (Rin·1000 + a·997), here with the network cost taken first.
    const m = pair({ dexId: "uniswap", chainId: "base", labels: ["v2"], quoteSymbol: "WETH", priceNative: 0.0001 / 3000, liquidityQuote: 5 });
    const rin = 15_000; // USD on the quote side (5 WETH at $3,000)
    const rout = rin / m.priceUsd;
    const a = 500 - 0.05;
    const expected = (a * 997 * rout) / (rin * 1000 + a * 997);
    const fill = quoteBuy(m, 500)!;
    expect(fill.tokens / expected).toBeCloseTo(1, 12);
    expect(fill.fillPriceUsd).toBeCloseTo(500 / fill.tokens, 12);
  });

  it("moves the pool more the more goes in", () => {
    const small = quoteBuy(pair(), 100)!;
    const big = quoteBuy(pair(), 1000)!;
    expect(small.impact).toBeCloseTo(0.0066, 3); // $30K pool
    expect(big.impact).toBeCloseTo(0.0663, 3);
    expect(big.fillPriceUsd).toBeGreaterThan(small.fillPriceUsd);
    expect(small.fillPriceUsd).toBeGreaterThan(small.priceUsd);
    expect(small.feeUsd).toBeCloseTo((100 - 0.3) * 0.0025, 9);
  });

  it("says when a pump.fun buy would finish the curve", () => {
    const near = pair({ dexId: "pumpfun", marketCap: 400 * SOL_USD }); // ~113 virtual SOL of 115
    expect(quoteBuy(near, 1000)).toMatchObject({ completesCurve: true, quality: "rough" });
    expect(quoteBuy(pair({ dexId: "pumpfun", marketCap: 10_000 }), 1000)).toMatchObject({ completesCurve: false, quality: "good" });
  });

  it("has no fill without a price, and counts no impact without depth", () => {
    expect(quoteBuy(pair({ priceUsd: 0 }), 100)).toBeNull();
    expect(quoteBuy(pair(), 0)).toBeNull();
    expect(quoteBuy(pair({ liquidityUsd: null }), 100)).toMatchObject({ impact: 0, quality: "none" });
  });
});

describe("quoteSell", () => {
  it("loses fees and impact both ways on a round trip at the same price", () => {
    const buy = quoteBuy(pair(), 1000)!;
    const sell = quoteSell(pair(), buy.tokens)!;
    expect(sell.valueUsd).toBeLessThan(1000);
    expect(sell.proceedsUsd).toBeLessThan(sell.valueUsd);
    expect(sell.proceedsUsd).toBeGreaterThan(850);
    expect(sell.impact).toBeGreaterThan(0);
  });

  it("is worth nothing once the pool is drained, whatever the last price says", () => {
    const buy = quoteBuy(pair(), 500)!;
    const rugged = quoteSell(pair({ liquidityUsd: 2, liquidityQuote: 1 / SOL_USD }), buy.tokens)!;
    expect(rugged.valueUsd).toBeGreaterThan(400);
    expect(rugged.proceedsUsd).toBeLessThan(1); // the $1 left on its quote side, at most
  });

  it("follows the price up", () => {
    const buy = quoteBuy(pair(), 100)!;
    const later = pair({ priceUsd: 0.0005, priceNative: 0.0005 / SOL_USD, liquidityUsd: 150_000, liquidityQuote: 75_000 / SOL_USD });
    expect(quoteSell(later, buy.tokens)!.proceedsUsd / 100).toBeGreaterThan(4.8);
  });
});

describe("whatIf", () => {
  it("is what an amount put in at an earlier price would bring in now", () => {
    const now = pair({ priceUsd: 0.0003, priceNative: 0.0003 / SOL_USD });
    const out = whatIf(now, 100, 0.0001)!;
    expect(out.valueUsd).toBeCloseTo((100 - 0.3) * 0.9975 * 3, 6);
    expect(out.proceedsUsd).toBeLessThan(out.valueUsd);
    expect(whatIf(now, 100, 0)).toBeNull();
  });
});

describe("any amount", () => {
  it("fills small and huge amounts alike, the huge ones far above the market price", () => {
    expect(quoteBuy(pair(), 5)!.tokens).toBeGreaterThan(0);
    const whale = quoteBuy(pair(), 1_000_000)!;
    expect(whale.impact).toBeGreaterThan(60); // $1M into a $15K-deep pool
    expect(whale.fillPriceUsd).toBeGreaterThan(pair().priceUsd * 60);
    expect(quoteSell(pair(), whale.tokens)!.proceedsUsd).toBeLessThan(15_000); // no more than the pool holds
  });

  it("has nothing to fill when the network costs take it all", () => {
    expect(quoteBuy(pair(), 0.2)).toBeNull(); // network ≈ $0.30 on Solana
  });
});

describe("atMultiple", () => {
  it("moves the price k times and the pool's depth √k times", () => {
    const m = pair();
    const up = atMultiple(m, 4);
    expect(up.priceUsd).toBeCloseTo(m.priceUsd * 4, 12);
    expect(up.marketCap).toBeCloseTo(400_000, 6);
    expect(poolOf(up).depthUsd).toBeCloseTo(30_000, 6); // $15K deep at the start: twice as deep at 4x
    expect(atMultiple({ ...m, liquidityUsd: null }, 4).liquidityUsd).toBeNull();
  });

  it("prices a sell at 2x below twice what the tokens are worth now, and still above the round trip", () => {
    const buy = quoteBuy(pair(), 500)!;
    const at2 = quoteSell(atMultiple(pair(), 2), buy.tokens)!;
    expect(at2.valueUsd).toBeCloseTo(buy.tokens * pair().priceUsd * 2, 6);
    expect(at2.proceedsUsd).toBeLessThan(at2.valueUsd);
    expect(at2.proceedsUsd).toBeGreaterThan(900);
  });

  it("moves a pump.fun curve's depth with the root of its market cap", () => {
    const curve = pair({ dexId: "pumpfun", marketCap: 10_000 });
    expect(poolOf(atMultiple(curve, 4)).depthUsd! / poolOf(curve).depthUsd!).toBeCloseTo(2, 9);
  });
});
