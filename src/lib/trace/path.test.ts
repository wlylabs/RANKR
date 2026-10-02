import { describe, expect, it } from "vitest";
import { choose, fold, sideOf, trailPath, trailSteps, type PathStep } from "./path";
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
const tree = (data: TraceResponse[], expanded: string[] = [], full = false) =>
  buildTree({
    root: "T",
    data: new Map(data.map((d) => [d.address, d])),
    errors: new Map(),
    expanded: new Set(expanded),
    showAll: new Set(),
    full,
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
      { stop: { type: "wallet", id: "root", address: "T", label: null, role: "target", hop: 0 }, down: null },
    ];
    expect(fold(steps)).toBe(steps);
  });
});

describe("following a path", () => {
  const root = wallet("T", {
    funder: flow("F", 10),
    inflows: [flow("A", 900), flow("B", 50)],
    outflows: [flow("X", 700), flow("CEX", 300, label("cex", "OKX")), flow("Y", 600), flow("Z", 5)],
  });

  it("goes through the wallet picked at a fork, past the one opened there", () => {
    const x = wallet("X", { outflows: [flow("X1", 50)] });
    const steps = trailSteps(tree([root, x], ["root/out:X"], true), choose(new Set(), "root/out:Y"));
    expect(stops(steps)).toEqual(["funded:F", "target:T", "hop:Y"]);
    // Each stop carries its card's id, for the page to act on.
    expect(steps.map((s) => s.stop.type === "wallet" && s.stop.id)).toEqual(["root/in:F", "root", "root/out:Y"]);
  });

  it("stays on a wallet opened even when nothing went out of it, over a bigger end beside it", () => {
    const x = wallet("X");
    expect(stops(trailSteps(tree([root, x], ["root/out:X"], true)))).toEqual(["funded:F", "target:T", "hop:X"]);
  });

  it("takes the sender picked above the target, and goes on above it once it's opened", () => {
    expect(stops(trailSteps(tree([root], [], true), new Set(["root/in:B"])))).toEqual([
      "sent:B",
      "target:T",
      "end:CEX",
    ]);
    const b = wallet("B", { funder: flow("B0", 3) });
    const steps = trailSteps(tree([root, b], ["root/in:B"], true), new Set(["root/in:B"]));
    expect(stops(steps)).toEqual(["funded:B0", "sent:B", "target:T", "end:CEX"]);
  });

  it("picks from every counterparty on a whole tree, not only the ones the tree shows", () => {
    // The tree shows three a row; the fourth (Z) can still be followed on the path.
    expect(stops(trailSteps(tree([root], [], true), new Set(["root/out:Z"])))).toContain("hop:Z");
    expect(stops(trailSteps(tree([root]), new Set(["root/out:Z"])))).not.toContain("hop:Z");
  });

  it("keeps one pick per fork and side", () => {
    let c = choose(new Set(), "root/out:X");
    c = choose(c, "root/in:A");
    c = choose(c, "root/out:X/out:X1");
    c = choose(c, "root/out:Y");
    expect([...c].sort()).toEqual(["root/in:A", "root/out:X/out:X1", "root/out:Y"]);
    expect(sideOf("root/out:X/in:Q")).toBe("in");
    expect(sideOf("root/out:X")).toBe("out");
  });
});
