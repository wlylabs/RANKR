import { describe, expect, it } from "vitest";
import { caseFile, DAY } from "./case";
import type { TraceFlow, TraceLabel, TraceResponse } from "./types";

const NOW = Date.UTC(2026, 9, 2);
const label = (kind: TraceLabel["kind"], name: string): TraceLabel => ({ kind, name, source: "test list" });
const flow = (address: string, usd: number, l: TraceLabel | null = null): TraceFlow => ({
  address,
  label: l,
  terminal: !!l && ["cex", "bridge", "mixer", "dex", "contract"].includes(l.kind),
  usd,
  assets: [{ symbol: "SOL", amount: 1, usd }],
  txs: 1,
  first: NOW - DAY,
  last: NOW - DAY,
  tx: "t",
});
const wallet = (address: string, over: Partial<TraceResponse> = {}): TraceResponse => ({
  chain: "solana",
  address,
  label: null,
  balance: null,
  firstSeen: null,
  funder: null,
  inflows: [],
  outflows: [],
  more: { in: 0, out: 0 },
  swaps: null,
  scanned: { txs: 10, from: null, to: null, complete: true },
  updatedAt: NOW,
  ...over,
});

describe("caseFile", () => {
  it("says where the money ended up, merging one exchange's wallets, with the hop it took", () => {
    const root = wallet("T", {
      outflows: [
        flow("X", 1000),
        flow("CB1", 300, label("cex", "Coinbase")),
        flow("BR", 200, label("bridge", "Wormhole")),
      ],
    });
    const x = wallet("X", {
      outflows: [flow("CB2", 900, label("cex", "Coinbase")), flow("TC", 50, label("mixer", "Tornado Cash"))],
    });
    const c = caseFile(root, new Map([["X", x]]), NOW);
    expect(c.exits).toEqual([
      { address: "CB1", name: "Coinbase", kind: "cex", usd: 1200, hops: 1 },
      { address: "BR", name: "Wormhole", kind: "bridge", usd: 200, hops: 1 },
      { address: "TC", name: "Tornado Cash", kind: "mixer", usd: 50, hops: 2 },
    ]);
    expect(c.flags.map((f) => [f.id, f.danger])).toEqual([
      ["out:TC", true],
      ["bridge", false],
      ["cex", false],
    ]);
    expect(c.flags[0].text).toBe("Sent to Tornado Cash, 2 hops away (test list)");
    expect(c.outUsd).toBe(1500);
  });

  it("flags a fresh wallet, one funded by a sanctioned address, one that spread its money out and emptied", () => {
    const root = wallet("T", {
      firstSeen: NOW - 2 * DAY,
      balance: { symbol: "SOL", amount: 0.001, usd: 0.15 },
      funder: flow("OFAC", 100, label("sanctioned", "OFAC sanctioned")),
      outflows: ["A", "B", "C", "D"].map((a) => flow(a, 10)),
      more: { in: 0, out: 2 },
    });
    const ids = caseFile(root, new Map(), NOW).flags.map((f) => f.id);
    expect(ids).toEqual(["fresh", "in:OFAC", "spread", "empty"]);
  });
});
