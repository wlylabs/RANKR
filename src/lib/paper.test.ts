import { describe, expect, it } from "vitest";
import { MAX_TRADES, buyWith, holdingsOf, paperBuy, paperSell, positionOf, remainingOf, sellFrom, summaryOf, type PaperTrade } from "./paper";
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

describe("the paper wallet", () => {
  const wallet = { cashUsd: 1000, depositedUsd: 1000 };

  it("pays a buy from the cash, and refuses one it can't cover", () => {
    const out = buyWith(wallet, [], pair(0.0001), 400, null, T0);
    if ("error" in out) throw new Error(out.error);
    expect(out.wallet).toEqual({ cashUsd: 600, depositedUsd: 1000 });
    expect(out.trades).toEqual([out.trade]);
    expect(buyWith(out.wallet, out.trades, pair(0.0001), 600.01, null, T0)).toEqual({ error: "balance" });
    expect(buyWith(wallet, [], pair(0), 100, null, T0)).toEqual({ error: "price" });
    // All of it, give or take a rounding error.
    const all = buyWith(out.wallet, out.trades, pair(0.0001), 600 + 1e-10, null, T0);
    expect("error" in all ? all.error : all.wallet.cashUsd).toBe(0);
  });

  it("sells across a token's trades oldest first, as one sale, into the cash", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    const b = paperBuy(pair(0.0002), 100, null, T0 + 1)!;
    const other = { ...paperBuy(pair(0.0001), 100, null, T0)!, tokenId: "solana:BBB" };
    const trades = [b, other, a]; // newest first, as kept
    const held = holdingsOf(trades, "solana:AAA");
    expect(held.tokens).toBeCloseTo(a.tokens + b.tokens, 6);
    expect(held.costUsd).toBeCloseTo(200, 9);
    expect(held.open.map((t) => t.id)).toEqual([a.id, b.id]);

    const now = pair(0.0003);
    const out = sellFrom({ cashUsd: 0, depositedUsd: 300 }, trades, "solana:AAA", a.tokens * 1.5, now, T0 + 2);
    if ("error" in out) throw new Error(out.error);
    const after = (id: string) => out.trades.find((t) => t.id === id)!;
    expect(remainingOf(after(a.id))).toBe(0); // the oldest, all of it
    expect(remainingOf(after(b.id))).toBeCloseTo(b.tokens - a.tokens * 0.5, 6);
    expect(after(other.id)).toBe(other); // another token: untouched
    expect(out.wallet!.cashUsd).toBeCloseTo(out.proceedsUsd, 9);
    const split = after(a.id).sales[0].proceedsUsd + after(b.id).sales[0].proceedsUsd;
    expect(split).toBeCloseTo(out.proceedsUsd, 9);
  });

  it("won't sell more than is held, and sells everything when asked for all of it", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    expect(sellFrom(null, [a], "solana:AAA", a.tokens * 1.01, pair(0.0001))).toEqual({ error: "holdings" });
    expect(sellFrom(null, [a], "solana:ZZZ", 1, pair(0.0001))).toEqual({ error: "holdings" });
    const out = sellFrom(null, [a], "solana:AAA", a.tokens, pair(0.0001));
    if ("error" in out) throw new Error(out.error);
    expect(out.wallet).toBeNull(); // trades from before the wallet: no cash to pay into
    expect(remainingOf(out.trades[0])).toBe(0);
  });

  it("keeps open trades when the list is full, dropping the oldest closed ones", () => {
    const open = paperBuy(pair(0.0001), 100, null, T0)!;
    const closed: PaperTrade[] = Array.from({ length: MAX_TRADES - 1 }, (_, i) => paperSell(paperBuy(pair(0.0001), 100, null, T0 + i)!, 1, pair(0.0001))!);
    const out = buyWith({ cashUsd: 1000, depositedUsd: 1000 }, [...closed, open], pair(0.0001), 100, null, T0 + 999);
    if ("error" in out) throw new Error(out.error);
    expect(out.trades).toHaveLength(MAX_TRADES);
    expect(out.trades.some((t) => t.id === open.id)).toBe(true);
  });
});
