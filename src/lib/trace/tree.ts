// The trail's wallets, as read so far: who sent the target money above it, the target, where its money went
// below it, and further each way for every wallet followed. The path (path.ts) picks its one line from here.
// No React in it.
import { sameAddress } from "../address";
import type { TraceFlow, TraceResponse } from "./types";

/** Hops each way from the target, at most. */
export const MAX_DEPTH = 6;

export type Side = "in" | "out";

export type TreeItem = {
  id: string;
  type: "root" | "wallet" | "more" | "pending" | "error";
  side: Side | "root";
  /** 0 for the target, +1, +2... below it, -1, -2... above it. */
  depth: number;
  /** The wallet (for "pending" and "error", the one being read). */
  address?: string;
  /** What moved between this wallet and the one it hangs from. */
  flow?: TraceFlow;
  /** The first money its parent ever got came from here. */
  funder?: boolean;
  /** Already on this branch, higher up: money going round in a circle. Not followed again. */
  loop?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  /** "more": counterparties too small to be listed. */
  count?: number;
  error?: string;
  children: TreeItem[];
};

export type TreeState = {
  root: string;
  data: Map<string, TraceResponse>;
  errors: Map<string, string>;
  /** Wallets followed (read and opened), by id. */
  expanded: Set<string>;
};

/** The id of the wallet a wallet hangs from. */
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
  // Where its first money came from leads the senders, even when it was small.
  if (side === "in" && funder) list = [funder, ...list.filter((f) => !sameAddress(f.address, funder.address))];

  const items: TreeItem[] = list.map((flow) =>
    wallet(s, `${parent.id}/${side}:${flow.address}`, side, depth, flow, path, {
      funder: side === "in" && !!funder && sameAddress(flow.address, funder.address),
    }),
  );
  const hidden = side === "out" ? data.more.out : data.more.in;
  if (hidden > 0)
    items.push({ id: `${parent.id}/${side}:more`, type: "more", side, depth, count: hidden, children: [] });
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

/** The trail as read: the target, its counterparties each way, and theirs for every wallet followed. */
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
