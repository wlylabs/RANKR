// The trail as a tree, top to bottom: who sent the wallet money above it, the wallet, where its money went
// below it. Money always flows down the page. Each wallet opened adds a row; this file decides what's on
// screen (buildTree) and where (layoutTree), with no React in it.
import { sameAddress } from "../address";
import { DANGER } from "./kinds";
import type { TraceFlow, TraceLabelKind, TraceResponse } from "./types";

export const NODE_W = 184;
export const NODE_H = 76;
export const GAP_X = 14;
export const ROW_H = 140;
export const PAD = 28;
/** Counterparties shown per wallet before "+N more". */
export const SHOWN = 3;
/** Rows each way from the target, at most. */
export const MAX_DEPTH = 6;

export type Side = "in" | "out";

export type TreeItem = {
  id: string;
  type: "root" | "wallet" | "swaps" | "more" | "others" | "pending" | "error";
  side: Side | "root";
  /** 0 for the target, +1, +2... below it, -1, -2... above it. */
  depth: number;
  /** The wallet on the card (for "pending" and "error", the one being read). */
  address?: string;
  /** What moved between this wallet and the one it hangs from. */
  flow?: TraceFlow;
  /** The first money its parent ever got came from here. */
  funder?: boolean;
  /** Already on this branch, higher up: money going round in a circle. Not opened again. */
  loop?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  /**
   * "more": counterparties not shown, `expandable` when they can be. "others": the row's wallets folded away
   * while one of them is open (the trail being followed).
   */
  count?: number;
  swaps?: { txs: number; usd: number | null };
  error?: string;
  children: TreeItem[];
};

export type TreeState = {
  root: string;
  data: Map<string, TraceResponse>;
  errors: Map<string, string>;
  /** Opened wallets, by node id. */
  expanded: Set<string>;
  /** Wallets showing every counterparty, by node id. */
  showAll: Set<string>;
  /** Wallets whose row stays unfolded while one of its wallets is open, by node id. */
  unfolded?: Set<string>;
  /** Every row whole: all its counterparties, nothing folded (the path view picks from them). */
  full?: boolean;
};

/** The id of the card a card hangs from. */
export function parentId(id: string): string | null {
  const at = id.lastIndexOf("/");
  return at < 0 ? null : id.slice(0, at);
}

/** Data for an address (EVM addresses are case-insensitive). */
export function dataOf(data: Map<string, TraceResponse>, address: string): TraceResponse | undefined {
  return data.get(address) ?? (address.startsWith("0x") ? data.get(address.toLowerCase()) : undefined);
}

function children(s: TreeState, parent: TreeItem, side: Side, path: string[]): TreeItem[] {
  const address = parent.address!;
  const depth = parent.depth + (side === "out" ? 1 : -1);
  const data = dataOf(s.data, address);
  if (!data) {
    const error = s.errors.get(address);
    return [
      { id: `${parent.id}/${side}:?`, type: error ? "error" : "pending", side, depth, address, error, children: [] },
    ];
  }

  let list = side === "out" ? data.outflows : data.inflows;
  const funder = data.funder;
  // Where its first money came from leads the row above it, even when it was small.
  if (side === "in" && funder) list = [funder, ...list.filter((f) => !sameAddress(f.address, funder.address))];
  const all = s.full || s.showAll.has(parent.id);
  const shown = all ? list : list.slice(0, SHOWN);

  const items: TreeItem[] = shown.map((flow) =>
    wallet(s, `${parent.id}/${side}:${flow.address}`, side, depth, flow, path, {
      funder: side === "in" && !!funder && sameAddress(flow.address, funder.address),
    }),
  );

  // Following a trail: once a wallet in this row is open, the others fold into one card, so the tree only
  // widens along the path being followed. Unfolding shows the row as it was.
  const open = items.filter((i) => i.expanded);
  if (open.length && !s.full && !s.unfolded?.has(parent.id)) {
    const folded = items.length - open.length;
    if (folded > 0) {
      open.push({ id: `${parent.id}/${side}:others`, type: "others", side, depth, count: folded, children: [] });
    }
    return open;
  }

  if (side === "out" && data.swaps) {
    items.push({ id: `${parent.id}/out:swaps`, type: "swaps", side, depth, swaps: data.swaps, children: [] });
  }
  const hidden = list.length - shown.length + (side === "out" ? data.more.out : data.more.in);
  if (hidden > 0) {
    items.push({
      id: `${parent.id}/${side}:more`,
      type: "more",
      side,
      depth,
      count: hidden,
      expandable: list.length > shown.length,
      children: [],
    });
  }
  return items;
}

function wallet(
  s: TreeState,
  id: string,
  side: Side,
  depth: number,
  flow: TraceFlow,
  path: string[],
  extra: Partial<TreeItem>,
): TreeItem {
  const loop = path.some((a) => sameAddress(a, flow.address));
  const expandable = !flow.terminal && !loop && Math.abs(depth) < MAX_DEPTH;
  const expanded = expandable && s.expanded.has(id);
  const item: TreeItem = {
    id,
    type: "wallet",
    side,
    depth,
    address: flow.address,
    flow,
    loop,
    expandable,
    expanded,
    children: [],
    ...extra,
  };
  if (expanded) item.children = children(s, item, side, [...path, flow.address]);
  return item;
}

/** What's on screen: the target, the rows opened above and below it. */
export function buildTree(s: TreeState): TreeItem {
  const root: TreeItem = {
    id: "root",
    type: "root",
    side: "root",
    depth: 0,
    address: s.root,
    expandable: false,
    expanded: true,
    children: [],
  };
  root.children = [...children(s, root, "in", [s.root]), ...children(s, root, "out", [s.root])];
  return root;
}

// ---- Layout

export type Placed = { item: TreeItem; x: number; y: number };
export type Edge = {
  id: string;
  /** From the upper card's bottom edge to the lower card's top edge: the way the money went. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  usd: number | null;
  tone: "danger" | "end" | "plain" | "faint";
};
export type Layout = {
  nodes: Placed[];
  edges: Edge[];
  width: number;
  height: number;
  rows: { depth: number; y: number }[];
};

const SLOT = NODE_W + GAP_X;

type Tidy = { pos: Map<string, number>; left: number[]; right: number[] };

/**
 * A compact tree (after Reingold and Tilford): each child's subtree is set as close to its left sibling's as
 * their rows allow, one slot apart where they share a row, and the parent is centered over its children.
 * A wallet opened deep down widens only the rows it's in. x is a card's center, in slots, relative to `item`.
 */
function tidy(item: TreeItem, kids: (i: TreeItem) => TreeItem[]): Tidy {
  const k = kids(item);
  if (!k.length) return { pos: new Map([[item.id, 0]]), left: [0], right: [0] };
  const placed: { t: Tidy; at: number }[] = [];
  const left: number[] = [];
  const right: number[] = [];
  for (const child of k) {
    const t = tidy(child, kids);
    let at = 0;
    if (placed.length) {
      at = -Infinity;
      for (let d = 0; d < Math.min(right.length, t.left.length); d++) at = Math.max(at, right[d] - t.left[d] + 1);
    }
    t.left.forEach((v, d) => (left[d] = Math.min(left[d] ?? Infinity, v + at)));
    t.right.forEach((v, d) => (right[d] = Math.max(right[d] ?? -Infinity, v + at)));
    placed.push({ t, at });
  }
  const mid = (placed[0].at + placed[placed.length - 1].at) / 2;
  const pos = new Map([[item.id, 0]]);
  for (const { t, at } of placed) for (const [id, x] of t.pos) pos.set(id, x + at - mid);
  return { pos, left: [0, ...left.map((v) => v - mid)], right: [0, ...right.map((v) => v - mid)] };
}

function tone(item: TreeItem): Edge["tone"] {
  const kind: TraceLabelKind | undefined = item.flow?.label?.kind;
  if (kind && DANGER.has(kind)) return "danger";
  if (item.flow?.terminal) return "end";
  if (item.type === "more" || item.type === "others" || item.type === "pending" || item.type === "error")
    return "faint";
  return "plain";
}

export function layoutTree(root: TreeItem): Layout {
  const ins = root.children.filter((c) => c.side === "in");
  const outs = root.children.filter((c) => c.side === "out");
  const sideKids = (side: TreeItem[]) => (i: TreeItem) => (i === root ? side : i.children);

  // Each side on its own, the target at 0 in both: one tree grows down from it, the other up.
  const out = tidy(root, sideKids(outs)).pos;
  const inn = tidy(root, sideKids(ins)).pos;

  const nodes: Placed[] = [{ item: root, x: 0, y: 0 }];
  const walk = (item: TreeItem, xs: Map<string, number>) => {
    nodes.push({ item, x: xs.get(item.id)! * SLOT, y: item.depth * ROW_H });
    for (const c of item.children) walk(c, xs);
  };
  for (const c of outs) walk(c, out);
  for (const c of ins) walk(c, inn);

  const minX = Math.min(...nodes.map((n) => n.x)) - NODE_W / 2 - PAD;
  const minY = Math.min(...nodes.map((n) => n.y)) - NODE_H / 2 - PAD - 12;
  for (const n of nodes) {
    n.x -= minX;
    n.y -= minY;
  }
  const at = new Map(nodes.map((n) => [n.item.id, n]));

  const edges: Edge[] = [];
  const link = (parent: TreeItem, child: TreeItem) => {
    const p = at.get(parent.id)!;
    const c = at.get(child.id)!;
    const [upper, lower] = child.side === "out" ? [p, c] : [c, p];
    edges.push({
      id: child.id,
      x1: upper.x,
      y1: upper.y + NODE_H / 2,
      x2: lower.x,
      y2: lower.y - NODE_H / 2,
      usd: child.flow?.usd ?? child.swaps?.usd ?? null,
      tone: tone(child),
    });
    for (const g of child.children) link(child, g);
  };
  for (const c of root.children) link(root, c);

  const depths = [...new Set(nodes.map((n) => n.item.depth))].sort((a, b) => a - b);
  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((n) => n.x)) + NODE_W / 2 + PAD,
    height: Math.max(...nodes.map((n) => n.y)) + NODE_H / 2 + PAD,
    rows: depths.map((depth) => ({ depth, y: depth * ROW_H - minY })),
  };
}

/** A line's weight for the money on it: 1px for a few dollars, up to 3px for millions. */
export function strokeFor(usd: number | null): number {
  if (!usd || usd <= 0) return 1;
  return Math.min(3, Math.max(1, Math.log10(usd) * 0.45));
}

/** A row's caption: IN -2, IN -1, TARGET, OUT +1... */
export function rowLabel(depth: number): string {
  if (depth === 0) return "Target";
  const n = String(Math.abs(depth)).padStart(2, "0");
  return depth < 0 ? `In −${n}` : `Out +${n}`;
}
