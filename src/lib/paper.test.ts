import { describe, expect, it } from "vitest";
import { paperBuy, paperSell, positionOf, remainingOf, summaryOf } from "./paper";
import type { MarketSnapshot } from "./types";

const SOL_USD = 150;
const T0 = Date.parse("2026-10-10T12:00:00Z");

function pair(priceUsd: number, liquidityUsd: number | null = 30_000): MarketSnapshot {
  return {
    chainId: "solana",
    address: "AAA",
    name: "Alpha",
    symbol: "ALPHA",
    imageUrl: null,
    priceUsd,
    marketCap: priceUsd * 1e9,
    fdv: null,
    liquidityUsd,
    volume24h: null,
    priceChange24h: null,
    pairAddress: "pair",
    dexId: "raydium",
    quoteSymbol: "SOL",
    priceNative: priceUsd / SOL_USD,
    liquidityQuote: liquidityUsd === null ? null : liquidityUsd / 2 / SOL_USD,
    url: "",
    pairCreatedAt: null,
    websites: [],
    socials: [],
    fetchedAt: 0,
  };
}

describe("paper trades", () => {
  it("opens at the fill the model gives, keeping what it was priced on", () => {
    const t = paperBuy(pair(0.0001), 500, 16_400, T0)!;
    expect(t).toMatchObject({ tokenId: "solana:AAA", spentUsd: 500, priceUsd: 0.0001, usdIdr: 16_400, openedAt: T0, sales: [], model: "fill-v1" });
    expect(t.fillPriceUsd).toBeGreaterThan(0.0001);
    expect(t.tokens * t.fillPriceUsd).toBeCloseTo(500, 9);
    expect(paperBuy(pair(0), 500, null)).toBeNull();
    expect(paperBuy(pair(0.0001), 500, 0)!.usdIdr).toBeNull();
  });

  it("sells part of what's left, then the rest, and counts realized and unrealized apart", () => {
    const t0 = paperBuy(pair(0.0001), 1000, null, T0)!;
    const up = pair(0.0003, 90_000);
    const half = paperSell(t0, 0.5, up, T0 + 1)!;
    expect(remainingOf(half)).toBeCloseTo(t0.tokens / 2, 6);
    const mid = positionOf(half, up);
    expect(mid.costUsd).toBeCloseTo(500, 9);
    expect(mid.realizedUsd).toBeCloseTo(half.sales[0].proceedsUsd - 500, 9);
    expect(mid.realizedUsd).toBeGreaterThan(800); // about 3x on half
    expect(mid.unrealizedUsd!).toBeGreaterThan(800);

    const done = paperSell(half, 1, up, T0 + 2)!;
    expect(remainingOf(done)).toBe(0);
    const end = positionOf(done, null);
    expect(end).toMatchObject({ remaining: 0, costUsd: 0, now: null, unrealizedUsd: 0 });
    expect(end.multiple!).toBeCloseTo(done.sales.reduce((n, s) => n + s.proceedsUsd, 0) / 1000, 9);
    expect(paperSell(done, 1, up)).toBeNull(); // nothing left
  });

  it("has no unrealized number without live data, and says so in the summary", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    const b = { ...paperBuy(pair(0.0001), 200, null, T0)!, tokenId: "solana:BBB" };
    expect(positionOf(a, null)).toMatchObject({ unrealizedUsd: null, multiple: null });
    const s = summaryOf([a, b], (id) => (id === "solana:AAA" ? pair(0.0002) : null));
    expect(s).toMatchObject({ trades: 2, open: 2, investedUsd: 300, unpriced: 1 });
    expect(s.unrealizedUsd).toBeGreaterThan(80); // AAA doubled, less costs both ways
    expect(s.openValueUsd).toBeCloseTo(positionOf(a, pair(0.0002)).now!.proceedsUsd, 9);
  });

  it("marks a drained pool at what it would really pay, not at its last price", () => {
    const t = paperBuy(pair(0.0001), 500, null, T0)!;
    const p = positionOf(t, pair(0.0001, 2));
    expect(p.now!.valueUsd).toBeGreaterThan(400);
    expect(p.unrealizedUsd!).toBeLessThan(-495);
  });
});
