import { describe, expect, it } from "vitest";
import { buildTree, layoutTree, NODE_W, type TreeItem, type TreeState } from "./tree";
import type { TraceFlow, TraceResponse } from "./types";

const flow = (address: string, usd: number, extra: Partial<TraceFlow> = {}): TraceFlow => ({
  address,
  label: null,
  terminal: false,
  usd,
  assets: [{ symbol: "SOL", amount: usd / 150, usd }],
  txs: 1,
  first: 0,
  last: 0,
  tx: `tx-${address}`,
  ...extra,
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

const state = (data: TraceResponse[], over: Partial<TreeState> = {}): TreeState => ({
  root: "T",
  data: new Map(data.map((d) => [d.address, d])),
  errors: new Map(),
  expanded: new Set(),
  showAll: new Set(),
  ...over,
});

const kids = (item: TreeItem, side: "in" | "out") => item.children.filter((c) => c.side === side);
const ids = (items: TreeItem[]) => items.map((i) => (i.type === "wallet" ? i.address : i.type));

describe("buildTree", () => {
  it("shows the funder first above, the top 3 below, trades and the rest as cards of their own", () => {
    const root = wallet("T", {
      funder: flow("F", 5),
      inflows: [flow("A", 900), flow("B", 800)],
      outflows: [flow("X", 700), flow("Y", 600), flow("Z", 500), flow("Q", 400)],
      more: { in: 0, out: 3 },
      swaps: { txs: 4, usd: 100 },
    });
    const tree = buildTree(state([root]));
    expect(ids(kids(tree, "in"))).toEqual(["F", "A", "B"]);
    expect(kids(tree, "in")[0].funder).toBe(true);
    expect(ids(kids(tree, "out"))).toEqual(["X", "Y", "Z", "swaps", "more"]);
    // One counterparty past the top 3 that can be shown, 3 more under the cut that can't.
    expect(kids(tree, "out").at(-1)).toMatchObject({ count: 4, expandable: true });

    const all = buildTree(state([root], { showAll: new Set(["root"]) }));
    expect(ids(kids(all, "out"))).toEqual(["X", "Y", "Z", "Q", "swaps", "more"]);
    expect(kids(all, "out").at(-1)).toMatchObject({ count: 3, expandable: false });
  });

  it("opens wallets on request, waits for their read, and doesn't follow money back up its own branch", () => {
    const root = wallet("T", { outflows: [flow("X", 700), flow("CEX", 600, { terminal: true })] });
    const pending = buildTree(
      state([root], { expanded: new Set(["root/out:X", "root/out:CEX"]), unfolded: new Set(["root"]) }),
    );
    const [x, cex] = kids(pending, "out");
    expect(x.expanded).toBe(true);
    expect(x.children.map((c) => c.type)).toEqual(["pending"]);
    // An exchange is the end of the trail: never opened.
    expect(cex).toMatchObject({ expandable: false, expanded: false, children: [] });

    const read = buildTree(
      state([root, wallet("X", { outflows: [flow("T", 50), flow("Y", 40)] })], { expanded: new Set(["root/out:X"]) }),
    );
    const [back, y] = kids(read, "out")[0].children;
    expect(back).toMatchObject({ address: "T", loop: true, expandable: false });
    expect(y).toMatchObject({ address: "Y", loop: false, expandable: true, depth: 2 });
  });

  it("shows a failed read as an error card", () => {
    const tree = buildTree(state([], { errors: new Map([["T", "Solana RPC responded 429"]]) }));
    expect(tree.children.map((c) => [c.side, c.type, c.error])).toEqual([
      ["in", "error", "Solana RPC responded 429"],
      ["out", "error", "Solana RPC responded 429"],
    ]);
  });
});

describe("following a trail", () => {
  const root = wallet("T", {
    outflows: [flow("X", 700), flow("Y", 600), flow("Z", 500), flow("Q", 400)],
    more: { in: 0, out: 2 },
    swaps: { txs: 4, usd: 100 },
  });
  const y = wallet("Y", { outflows: [flow("Y1", 50), flow("Y2", 40)] });

  it("folds the rest of a row away once one of its wallets is open", () => {
    const tree = buildTree(state([root, y], { expanded: new Set(["root/out:Y"]) }));
    expect(ids(kids(tree, "out"))).toEqual(["Y", "others"]);
    expect(kids(tree, "out")[1]).toMatchObject({ id: "root/out:others", count: 2 });
    // Its own row isn't folded: nothing in it is open.
    expect(ids(kids(tree, "out")[0].children)).toEqual(["Y1", "Y2"]);
  });

  it("shows the row as it was when unfolded, and every open wallet when several are", () => {
    const unfolded = buildTree(state([root, y], { expanded: new Set(["root/out:Y"]), unfolded: new Set(["root"]) }));
    expect(ids(kids(unfolded, "out"))).toEqual(["X", "Y", "Z", "swaps", "more"]);

    const two = buildTree(state([root, y, wallet("X")], { expanded: new Set(["root/out:Y", "root/out:X"]) }));
    expect(ids(kids(two, "out"))).toEqual(["X", "Y", "others"]);
    expect(kids(two, "out")[2].count).toBe(1);
  });

  it("keeps the tree narrow: a row folded behind an open wallet takes two slots, not five", () => {
    const wide = layoutTree(buildTree(state([root])));
    const narrow = layoutTree(buildTree(state([root, y], { expanded: new Set(["root/out:Y"]) })));
    expect(narrow.width).toBeLessThan(wide.width);
  });
});

describe("layoutTree", () => {
  const root = wallet("T", {
    inflows: [flow("A", 900), flow("B", 800)],
    outflows: [flow("X", 700), flow("Y", 600), flow("Z", 500)],
  });
  const layout = layoutTree(
    buildTree(
      state([root, wallet("Y", { outflows: [flow("Y1", 1), flow("Y2", 1), flow("Y3", 1)] })], {
        expanded: new Set(["root/out:Y"]),
        // Its row as it was, siblings and all: the layout is what's under test.
        unfolded: new Set(["root"]),
      }),
    ),
  );
  const at = (id: string) => layout.nodes.find((n) => n.item.id === id)!;

  it("puts senders above the target and receivers below, a row per hop", () => {
    expect(at("root/in:A").y).toBeLessThan(at("root").y);
    expect(at("root/out:X").y).toBeGreaterThan(at("root").y);
    expect(at("root/out:Y/out:Y1").y).toBeGreaterThan(at("root/out:Y").y);
    expect(layout.rows.map((r) => r.depth)).toEqual([-1, 0, 1, 2]);
  });

  it("centers each wallet over what it opened, with no two cards of a row overlapping", () => {
    expect(at("root/out:Y").x).toBeCloseTo(at("root/out:Y/out:Y2").x);
    expect(at("root").x).toBeCloseTo(at("root/out:Y").x);
    const rows = new Map<number, number[]>();
    for (const n of layout.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(NODE_W);
    }
    expect(Math.min(...layout.nodes.map((n) => n.x))).toBeGreaterThanOrEqual(NODE_W / 2);
  });

  it("draws every line downward, from sender to receiver", () => {
    for (const e of layout.edges) expect(e.y2).toBeGreaterThan(e.y1);
    const a = layout.edges.find((e) => e.id === "root/in:A")!;
    expect([a.x1, a.x2]).toEqual([at("root/in:A").x, at("root").x]);
  });
});
