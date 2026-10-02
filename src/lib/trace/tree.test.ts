import { describe, expect, it } from "vitest";
import { buildTree, type TreeItem, type TreeState } from "./tree";
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
  ...over,
});

const kids = (item: TreeItem, side: "in" | "out") => item.children.filter((c) => c.side === side);
const ids = (items: TreeItem[]) => items.map((i) => (i.type === "wallet" ? i.address : i.type));

describe("buildTree", () => {
  it("lists the funder first above, every counterparty below, and counts the ones too small to list", () => {
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
    // Trades aren't followed: summed on the case file, not listed.
    expect(ids(kids(tree, "out"))).toEqual(["X", "Y", "Z", "Q", "more"]);
    expect(kids(tree, "out").at(-1)).toMatchObject({ count: 3 });
  });

  it("follows wallets on request, waits for their read, and doesn't follow money back up its own branch", () => {
    const root = wallet("T", { outflows: [flow("X", 700), flow("CEX", 600, { terminal: true })] });
    const pending = buildTree(state([root], { expanded: new Set(["root/out:X", "root/out:CEX"]) }));
    const [x, cex] = kids(pending, "out");
    expect(x.expanded).toBe(true);
    expect(x.children.map((c) => c.type)).toEqual(["pending"]);
    // An exchange is the end of the trail: never followed.
    expect(cex).toMatchObject({ expandable: false, expanded: false, children: [] });

    const read = buildTree(
      state([root, wallet("X", { outflows: [flow("T", 50), flow("Y", 40)] })], { expanded: new Set(["root/out:X"]) }),
    );
    const [back, y] = kids(read, "out")[0].children;
    expect(back).toMatchObject({ address: "T", loop: true, expandable: false });
    expect(y).toMatchObject({ address: "Y", loop: false, expandable: true, depth: 2 });
  });

  it("stops six hops from the target", () => {
    const hops = ["H1", "H2", "H3", "H4", "H5", "H6"];
    const data = [
      wallet("T", { outflows: [flow("H1", 9)] }),
      ...hops.map((h, i) => wallet(h, { outflows: [flow(hops[i + 1] ?? "H7", 9)] })),
    ];
    const open = hops.map(
      (_, i) =>
        `root${hops
          .slice(0, i + 1)
          .map((h) => `/out:${h}`)
          .join("")}`,
    );
    let item = buildTree(state(data, { expanded: new Set(open) }));
    while (item.children[0]?.type === "wallet") item = item.children.find((c) => c.side === "out")!;
    expect(item).toMatchObject({ address: "H6", depth: 6, expandable: false, expanded: false });
  });

  it("shows a failed read as an error", () => {
    const tree = buildTree(state([], { errors: new Map([["T", "Solana RPC responded 429"]]) }));
    expect(tree.children.map((c) => [c.side, c.type, c.error])).toEqual([
      ["in", "error", "Solana RPC responded 429"],
      ["out", "error", "Solana RPC responded 429"],
    ]);
  });
});
