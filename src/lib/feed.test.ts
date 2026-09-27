import { describe, expect, it } from "vitest";
import { pasteEvents } from "./feed";
import type { TokenView } from "./types";

const token = (id: string, firstPastedAt: number, peakMultiple: number, peakAt: number) =>
  ({ id, chainId: "solana", address: id, symbol: id, name: id, entryMarketCap: 1000, multiple: 1, firstPastedAt, peakMultiple, peakAt }) as TokenView;

describe("pasteEvents", () => {
  const tokens = [token("A", 100, 1.5, 150), token("B", 200, 12, 300)];

  it("turns pastes into calls and peaks into their highest milestone, newest first", () => {
    const items = pasteEvents(tokens, null);
    expect(items.map((i) => [i.kind, i.token.id, i.tier, i.at])).toEqual([
      ["milestone", "B", 10, 300],
      ["call", "B", null, 200],
      ["call", "A", null, 100],
    ]);
    expect(items.every((i) => i.username === null && i.caller === null)).toBe(true);
  });

  it("filters by kind", () => {
    expect(pasteEvents(tokens, "call").map((i) => i.kind)).toEqual(["call", "call"]);
    expect(pasteEvents(tokens, "milestone").map((i) => i.id)).toEqual(["milestone:B:10"]);
  });
});
