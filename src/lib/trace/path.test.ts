import { describe, expect, it } from "vitest";
import { fold, trailPath, type PathStep } from "./path";
import { buildTree, type TreeState } from "./tree";
import type { TraceFlow, TraceLabel, TraceResponse } from "./types";

const label = (kind: TraceLabel["kind"], name: string): TraceLabel => ({ kind, name, source: "test" });
const flow = (address: string, usd: number, l: TraceLabel | null = null): TraceFlow => ({
  address,
  label: l,
  terminal: !!l && ["cex", "bridge", "mixer", "dex", "contract"].includes(l.kind),
  usd,
  assets: [{ symbol: "SOL", amount: usd / 150, usd }],
  txs: 1,
  first: 0,
  last: 0,
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
  scanned: { txs: 0, from: null, to: null, complete: true },
  updatedAt: 0,
  ...over,
});
const tree = (data: TraceResponse[], expanded: string[] = []) =>
  buildTree({
    root: "T",
    data: new Map(data.map((d) => [d.address, d])),
    errors: new Map(),
    expanded: new Set(expanded),
    showAll: new Set(),
  } satisfies TreeState);
const stops = (steps: PathStep[]) =>
  steps.map((s) => (s.stop.type === "gap" ? `…${s.stop.count}` : `${s.stop.role}:${s.stop.address}`));

describe("trailPath", () => {
  const root = wallet("T", {
    funder: flow("F", 10, label("cex", "Binance")),
    inflows: [flow("A", 900)],
    outflows: [flow("X", 700), flow("CEX", 300, label("cex", "OKX")), flow("Y", 600)],
  });

  it("with nothing opened: the funder, the target, and its most telling counterparty", () => {
    const steps = trailPath(tree([root]));
    expect(stops(steps)).toEqual(["funded:F", "target:T", "end:CEX"]);
    // Each connector carries what moved down it.
    expect(steps.map((s) => s.down?.address ?? null)).toEqual(["F", "CEX", null]);
  });

  it("follows the wallets opened, down to the end they reach, and the senders opened above", () => {
    const x = wallet("X", { outflows: [flow("X1", 50), flow("TC", 40, label("mixer", "Tornado Cash"))] });
    const a = wallet("A", { funder: flow("A0", 5) });
    const steps = trailPath(tree([root, x, a], ["root/out:X", "root/in:A"]));
    expect(stops(steps)).toEqual(["funded:A0", "sent:A", "target:T", "hop:X", "end:TC"]);
    expect(steps.map((s) => s.down?.address ?? null)).toEqual(["A0", "A", "X", "TC", null]);
  });

  it("folds the middle of a long trail into a gap, keeping both ends", () => {
    // Five hops opened (the deepest a tree goes is six), then an exchange.
    const chain = ["H1", "H2", "H3", "H4", "H5"];
    const data = [
      wallet("T", { outflows: [flow("H1", 9)] }),
      ...chain.map((h, i) =>
        wallet(h, { outflows: [flow(chain[i + 1] ?? "END", 9, i === 4 ? label("cex", "OKX") : null)] }),
      ),
    ];
    const open = chain.map(
      (_, i) =>
        `root${chain
          .slice(0, i + 1)
          .map((h) => `/out:${h}`)
          .join("")}`,
    );
    const steps = trailPath(tree(data, open));
    expect(stops(steps)).toEqual(["target:T", "hop:H1", "…2", "hop:H4", "hop:H5", "end:END"]);
    // Nothing drawn across the gap.
    expect(steps[1].down).toBeNull();
  });

  it("leaves short trails alone", () => {
    const steps: PathStep[] = [
      { stop: { type: "wallet", address: "T", label: null, role: "target", hop: 0 }, down: null },
    ];
    expect(fold(steps)).toBe(steps);
  });
});
