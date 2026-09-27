import { describe, expect, it } from "vitest";
import { callerStats } from "./caller-stats";
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
