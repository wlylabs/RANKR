import { describe, expect, it } from "vitest";
import {
  MAX_TRADES,
  buyWith,
  holdingsList,
  holdingsOf,
  paperBuy,
  paperSell,
  pnlOf,
  positionOf,
  remainingOf,
  sellFrom,
  summaryOf,
  writeOff,
  type PaperTrade,
} from "./paper";
import { MAX_QUOTE_AGE_MS } from "./sim";
import type { MarketSnapshot } from "./types";

const SOL_USD = 150;
const T0 = Date.parse("2026-10-10T12:00:00Z");

/** A pair's data as read at `fetchedAt` (T0 by default: fresh for everything here at T0 + a few ms). */
function pair(priceUsd: number, liquidityUsd: number | null = 30_000, fetchedAt = T0): MarketSnapshot {
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
    fetchedAt,
  };
}

describe("paper trades", () => {
  it("opens at the fill the model gives, keeping what it was priced on", () => {
    const t = paperBuy(pair(0.0001), 500, 16_400, T0)!;
    expect(t).toMatchObject({ tokenId: "solana:AAA", spentUsd: 500, priceUsd: 0.0001, usdIdr: 16_400, openedAt: T0, sales: [], model: "fill-v1" });
    expect(t.fillPriceUsd).toBeGreaterThan(0.0001);
    expect(t.tokens * t.fillPriceUsd).toBeCloseTo(500, 9);
    expect(paperBuy(pair(0), 500, null, T0)).toBeNull();
    expect(paperBuy(pair(0.0001), 500, 0, T0)!.usdIdr).toBeNull();
    // A quote too old to fill at: the price may be long gone.
    expect(paperBuy(pair(0.0001), 500, null, T0 + MAX_QUOTE_AGE_MS + 1)).toBeNull();
  });

  it("sells part of what's left, then the rest, and counts realized and unrealized apart", () => {
    const t0 = paperBuy(pair(0.0001), 1000, null, T0)!;
    const up = pair(0.0003, 90_000, T0 + 1);
    const half = paperSell(t0, 0.5, up, T0 + 1)!;
    expect(remainingOf(half)).toBeCloseTo(t0.tokens / 2, 6);
    const mid = positionOf(half, up, T0 + 1);
    expect(mid.costUsd).toBeCloseTo(500, 9);
    expect(mid.realizedUsd).toBeCloseTo(half.sales[0].proceedsUsd - 500, 9);
    expect(mid.realizedUsd).toBeGreaterThan(800); // about 3x on half
    expect(mid.unrealizedUsd!).toBeGreaterThan(800);

    const done = paperSell(half, 1, pair(0.0003, 90_000, T0 + 2), T0 + 2)!;
    expect(remainingOf(done)).toBe(0);
    const end = positionOf(done, null, T0 + 2);
    expect(end).toMatchObject({ remaining: 0, costUsd: 0, now: null, unrealizedUsd: 0 });
    expect(end.multiple!).toBeCloseTo(done.sales.reduce((n, s) => n + s.proceedsUsd, 0) / 1000, 9);
    expect(paperSell(done, 1, up, T0 + 3)).toBeNull(); // nothing left
    expect(paperSell(t0, 1, up, T0 + MAX_QUOTE_AGE_MS + 2)).toBeNull(); // a quote too old
  });

  it("has no unrealized number without live data, and says so in the summary", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    const b = { ...paperBuy(pair(0.0001), 200, null, T0)!, tokenId: "solana:BBB" };
    expect(positionOf(a, null, T0)).toMatchObject({ unrealizedUsd: null, multiple: null });
    // Data too old to sell on counts as none.
    expect(positionOf(a, pair(0.0002), T0 + MAX_QUOTE_AGE_MS + 1)).toMatchObject({ now: null, unrealizedUsd: null });
    const s = summaryOf([a, b], (id) => (id === "solana:AAA" ? pair(0.0002) : null), T0);
    expect(s).toMatchObject({ trades: 2, open: 2, investedUsd: 300, unpriced: 1 });
    expect(s.unrealizedUsd).toBeGreaterThan(80); // AAA doubled, less costs both ways
    expect(s.openValueUsd).toBeCloseTo(positionOf(a, pair(0.0002), T0).now!.proceedsUsd, 9);
  });

  it("marks a drained pool at what it would really pay, not at its last price", () => {
    const t = paperBuy(pair(0.0001), 500, null, T0)!;
    const p = positionOf(t, pair(0.0001, 2), T0);
    expect(p.now!.valueUsd).toBeGreaterThan(400);
    expect(p.unrealizedUsd!).toBeLessThan(-495);
    // Rugged: the price stays behind, the pool is empty. Nothing to sell into.
    const rug = positionOf(t, pair(0.0001, 0), T0);
    expect(rug.now).toMatchObject({ proceedsUsd: 0, impact: 1 });
    expect(rug.unrealizedUsd).toBeCloseTo(-500, 9);
  });

  it("never pays more for selling in pieces on one quote than for selling at once", () => {
    const t = paperBuy(pair(0.0001), 2000, null, T0)!;
    const m = pair(0.0001, 30_000, T0 + 1);
    const once = paperSell(t, 1, m, T0 + 1)!.sales[0].proceedsUsd;
    // 25%, then 50% of the rest, then the rest, all on the same quote: each piece priced on what was sold before.
    let pieces = t;
    let prior = 0;
    for (const f of [0.25, 0.5, 1]) {
      pieces = paperSell(pieces, f, m, T0 + 1, prior)!;
      prior += pieces.sales[pieces.sales.length - 1].tokens;
    }
    const total = pieces.sales.reduce((n, s) => n + s.proceedsUsd, 0);
    expect(remainingOf(pieces)).toBe(0);
    expect(total).toBeLessThanOrEqual(once + 1e-9);
    // Only the network costs, paid once per sale, set them apart.
    expect(total).toBeCloseTo(once - 2 * 0.002 * SOL_USD, 6);
  });

  it("writes off what's left at nothing", () => {
    const t = paperSell(paperBuy(pair(0.0001), 100, null, T0)!, 0.5, pair(0.0001), T0)!;
    const gone = writeOff(t, T0 + 5);
    expect(remainingOf(gone)).toBe(0);
    expect(gone.sales.at(-1)).toMatchObject({ proceedsUsd: 0, priceUsd: 0, quote: "write-off" });
    const p = positionOf(gone, null, T0 + 5);
    expect(p.realizedUsd).toBeCloseTo(t.sales[0].proceedsUsd - 100, 9);
    expect(writeOff(gone)).toBe(gone);
  });

  it("values a token held in several trades as one sale of all of it", () => {
    const a = paperBuy(pair(0.0001), 3000, null, T0)!;
    const b = paperBuy(pair(0.0001), 3000, null, T0)!;
    const m = pair(0.0001);
    const s = summaryOf([a, b], () => m, T0);
    const apart = positionOf(a, m, T0).now!.proceedsUsd + positionOf(b, m, T0).now!.proceedsUsd;
    expect(s.openValueUsd).toBeLessThan(apart); // one bigger sale moves the pool more
    expect(s.unpriced).toBe(0);
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
    expect(buyWith(wallet, [], pair(0.0001), 100, null, T0 + MAX_QUOTE_AGE_MS + 1)).toEqual({ error: "stale" });
    expect(buyWith(wallet, [], pair(0.0001, 0), 100, null, T0)).toEqual({ error: "drained" });
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

    const now = pair(0.0003, 30_000, T0 + 2);
    const out = sellFrom({ cashUsd: 0, depositedUsd: 300 }, trades, "solana:AAA", a.tokens * 1.5, now, T0 + 2);
    if ("error" in out) throw new Error(out.error);
    const after = (id: string) => out.trades.find((t) => t.id === id)!;
    expect(remainingOf(after(a.id))).toBe(0); // the oldest, all of it
    expect(remainingOf(after(b.id))).toBeCloseTo(b.tokens - a.tokens * 0.5, 6);
    expect(after(other.id)).toBe(other); // another token: untouched
    expect(out.wallet!.cashUsd).toBeCloseTo(out.proceedsUsd, 9);
    const split = after(a.id).sales[0].proceedsUsd + after(b.id).sales[0].proceedsUsd;
    expect(split).toBeCloseTo(out.proceedsUsd, 9);
    expect(out.ids.sort()).toEqual([a.id, b.id].sort()); // the trades it sold from
    expect(sellFrom(null, trades, "solana:AAA", a.tokens, now, T0 + 2 + MAX_QUOTE_AGE_MS + 1)).toEqual({ error: "stale" });
  });

  it("won't sell more than is held, and sells everything when asked for all of it", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    expect(sellFrom(null, [a], "solana:AAA", a.tokens * 1.01, pair(0.0001), T0)).toEqual({ error: "holdings" });
    expect(sellFrom(null, [a], "solana:ZZZ", 1, pair(0.0001), T0)).toEqual({ error: "holdings" });
    const out = sellFrom(null, [a], "solana:AAA", a.tokens, pair(0.0001), T0);
    if ("error" in out) throw new Error(out.error);
    expect(out.wallet).toBeNull(); // trades from before the wallet: no cash to pay into
    expect(remainingOf(out.trades[0])).toBe(0);
  });

  it("keeps open trades when the list is full, dropping the oldest closed ones", () => {
    const open = paperBuy(pair(0.0001), 100, null, T0)!;
    const closed: PaperTrade[] = Array.from({ length: MAX_TRADES - 1 }, (_, i) => paperSell(paperBuy(pair(0.0001), 100, null, T0 + i)!, 1, pair(0.0001), T0 + i)!);
    const out = buyWith({ cashUsd: 1000, depositedUsd: 1000 }, [...closed, open], pair(0.0001), 100, null, T0 + 999);
    if ("error" in out) throw new Error(out.error);
    expect(out.trades).toHaveLength(MAX_TRADES);
    expect(out.trades.some((t) => t.id === open.id)).toBe(true);
  });

  it("refuses a buy when every kept trade is still open, rather than drop one", () => {
    const opens = Array.from({ length: MAX_TRADES }, (_, i) => paperBuy(pair(0.0001), 1, null, T0 + i)!);
    expect(buyWith({ cashUsd: 1000, depositedUsd: 1000 }, opens, pair(0.0001), 100, null, T0 + 999)).toEqual({ error: "full" });
  });

  it("lists what's held by token, valued as one sale of all of it, most worth first", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    const b = paperBuy(pair(0.0001), 50, null, T0)!;
    const other = { ...paperBuy(pair(0.0001), 300, null, T0)!, tokenId: "solana:BBB", address: "BBB", symbol: "BETA" };
    const closed = paperSell(paperBuy(pair(0.0001), 100, null, T0)!, 1, pair(0.0001), T0)!;
    const now = pair(0.0002, 30_000, T0 + 1);
    const list = holdingsList([a, b, other, closed], (id) => (id === "solana:AAA" ? now : null), T0 + 1);
    expect(list.map((h) => h.symbol)).toEqual(["BETA", "ALPHA"]); // no live data: by what it cost
    const alpha = list[1];
    expect(alpha.tokens).toBeCloseTo(a.tokens + b.tokens, 6);
    expect(alpha.costUsd).toBeCloseTo(150, 9);
    expect(alpha.valueUsd).toBeCloseTo(summaryOf([a, b], () => now, T0 + 1).openValueUsd, 9);
    expect(list[0].valueUsd).toBeNull();
    expect(alpha.marketUsd).toBeCloseTo(alpha.tokens * now.priceUsd, 9); // at the price, no impact
    expect(alpha.marketUsd!).toBeGreaterThan(alpha.valueUsd!);
    expect(list[0].marketUsd).toBeNull();
  });

  it("takes trades together for a PnL card", () => {
    const a = paperBuy(pair(0.0001), 100, null, T0)!;
    const sold = paperSell(paperBuy(pair(0.0001), 100, null, T0)!, 1, pair(0.0002), T0)!;
    const now = pair(0.0002, 30_000, T0 + 1);
    const pnl = pnlOf([a, sold], now, T0 + 1);
    expect(pnl.spentUsd).toBeCloseTo(200, 9);
    expect(pnl.backUsd).toBeCloseTo(positionOf(a, now, T0 + 1).multiple! * 100 + positionOf(sold, null).multiple! * 100, 9);
    expect(pnlOf([a, sold], null, T0 + 1).backUsd).toBeNull(); // the open one has no live data
  });
});