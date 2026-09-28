import { describe, expect, it } from "vitest";
import { behind, callSpread, callerStats, recentForm } from "./caller-stats";
import type { CallView, TokenView } from "./types";

function call(symbol: string, multiple: number): CallView {
  const token = { id: `solana:${symbol}`, address: symbol, symbol, name: symbol, chainId: "solana" } as TokenView;
  return { tokenId: token.id, entryPriceUsd: 1, entryMarketCap: 1_000, calledAt: 0, multiple, token };
}

describe("callerStats", () => {
  it("counts like the caller board: 2x hits, wins above entry, average and best", () => {
    const s = callerStats([call("A", 3), call("B", 0.5), call("C", 1.002), call("D", 2)]);
    expect(s.calls).toBe(4);
    expect(s.hits).toBe(2);
    expect(s.wins).toBe(2); // 1.002x is flat, not a win
    expect(s.avgMultiple).toBeCloseTo((3 + 0.5 + 1.002 + 2) / 4);
    expect(s.bestMultiple).toBe(3);
    expect(s.bestToken?.symbol).toBe("A");
  });

  it("has neutral numbers without calls", () => {
    expect(callerStats([])).toEqual({ calls: 0, hits: 0, wins: 0, avgMultiple: 1, bestMultiple: 1, bestToken: null });
  });
});

describe("callSpread", () => {
  it("buckets calls by where they are now", () => {
    const spread = callSpread([0.1, 0.99, 1, 1.99, 2, 4.9, 5, 12, 99.9, 100, 2500, Number.NaN]);
    expect(Object.fromEntries(spread.map((b) => [b.label, b.count]))).toEqual({
      loss: 2,
      "1-2x": 2,
      "2-5x": 2,
      "5-10x": 1,
      "10-100x": 2,
      "100x+": 2,
    });
    expect(spread.map((b) => b.tone)).toEqual(["down", "mid", "up", "up", "up", "up"]);
  });
});

describe("recentForm", () => {
  const c = (calledAt: number, multiple: number) => ({ calledAt, multiple });

  it("takes the newest calls and counts the streak above entry from the newest", () => {
    const form = recentForm([c(1, 3), c(5, 1.5), c(4, 2.2), c(3, 0.4), c(2, 1.2), c(6, 1.001)], 5);
    expect(form.recent.map((r) => r.calledAt)).toEqual([6, 5, 4, 3, 2]);
    expect(form.up).toBe(3); // 1.5, 2.2, 1.2
    expect(form.hits).toBe(1);
    expect(form.streak).toBe(0); // the newest is flat
    expect(recentForm([c(3, 2), c(2, 1.1), c(1, 0.5)]).streak).toBe(2);
    expect(recentForm([])).toEqual({ recent: [], up: 0, hits: 0, streak: 0 });
  });
});

describe("behind", () => {
  const c = (calls: number, hits: number, avgMultiple = 1, bestMultiple = 1) => ({ calls, hits, avgMultiple, bestMultiple });

  it("gives the gap in the number the board sorts by", () => {
    expect(behind("rate", c(10, 4), c(10, 5))).toBe("10 pts");
    expect(behind("rate", c(3, 1), c(100, 34))).toBe("1 pt"); // 33% vs 34%
    expect(behind("hits", c(9, 2), c(4, 3))).toBe("1 hit");
    expect(behind("hits", c(9, 2), c(4, 5))).toBe("3 hits");
    expect(behind("calls", c(7, 0), c(9, 0))).toBe("2 calls");
    expect(behind("avg", c(5, 0, 1.4), c(5, 0, 1.75))).toBe("0.35x");
    expect(behind("best", c(1, 0, 1, 12), c(1, 0, 1, 40))).toBe("28.0x");
    expect(behind("best", c(1, 0, 1, 12), c(1, 0, 1, 512))).toBe("500x");
  });

  it("is null when level as the board shows it (tie-breaks put the other first)", () => {
    expect(behind("rate", c(5, 2), c(10, 4))).toBeNull(); // 40% each
    expect(behind("rate", c(1000, 400), c(1000, 401))).toBeNull(); // 40.0% vs 40.1%
    expect(behind("hits", c(10, 3), c(5, 3))).toBeNull();
    expect(behind("avg", c(5, 0, 2), c(5, 0, 2.001))).toBeNull();
  });
});
