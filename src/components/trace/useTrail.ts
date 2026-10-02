"use client";

import { useCallback, useMemo, useState } from "react";
import { choose, trailSteps } from "@/lib/trace/path";
import { buildTree, dataOf, layoutTree, parentId, type Placed, type TreeItem } from "@/lib/trace/tree";
import type { TraceResponse } from "@/lib/trace/types";

const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};
const without = (set: Set<string>, id: string) => (set.has(id) ? new Set([...set].filter((x) => x !== id)) : set);

/** A card to act on: one placed on the tree, or a stop on the path (which may be folded away on the tree). */
type Target = { item: TreeItem };

/**
 * What a trail shows and what a tap does to it, as a tree and as a path: open or close a wallet (reading it
 * first via `read`), show a row's smaller counterparties, unfold the wallets folded away beside an open one, and
 * follow one wallet at a fork. Shared by the trace page and its made-up example.
 */
export function useTrail(
  root: string,
  data: Map<string, TraceResponse>,
  errors: Map<string, string>,
  read: (address: string) => void,
  initial?: { expanded?: Set<string> },
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => initial?.expanded ?? new Set());
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set());
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  /** The wallet followed at each fork, by card id: the path goes through these. */
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState("root");
  const [anchor, setAnchor] = useState<string | null>(null);

  const tree = useMemo(
    () => buildTree({ root, data, errors, expanded, showAll, unfolded }),
    [root, data, errors, expanded, showAll, unfolded],
  );
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.item.id, n])), [layout]);

  // The path picks from every counterparty, not only the ones the tree has room for.
  const whole = useMemo(
    () => buildTree({ root, data, errors, expanded, showAll, full: true }),
    [root, data, errors, expanded, showAll],
  );
  const items = useMemo(() => {
    const map = new Map<string, TreeItem>();
    const walk = (i: TreeItem) => {
      map.set(i.id, i);
      i.children.forEach(walk);
    };
    walk(whole);
    return map;
  }, [whole]);
  const steps = useMemo(() => trailSteps(whole, chosen), [whole, chosen]);

  /** Opens or closes a wallet; opening one follows it at its fork, and folds its row's others away again. */
  const open = useCallback(
    ({ item }: Target) => {
      if (!item.expandable || !item.address) return;
      setAnchor(item.id);
      if (!item.expanded) {
        if (!dataOf(data, item.address)) read(item.address);
        const parent = parentId(item.id);
        if (parent) setUnfolded((s) => without(s, parent));
        setChosen((s) => choose(s, item.id));
      } else {
        setChosen((s) => without(s, item.id));
      }
      setExpanded((s) => toggle(s, item.id));
    },
    [data, read],
  );

  const press = useCallback(
    (placed: Placed) => {
      const { item } = placed;
      if (item.type === "more" || item.type === "others") {
        // The wallet the row hangs from stays put while the row widens.
        const parent = parentId(item.id);
        if (!parent) return;
        setAnchor(parent);
        if (item.type === "more") setShowAll((s) => new Set(s).add(parent));
        else setUnfolded((s) => new Set(s).add(parent));
        return;
      }
      setSelected(item.id);
      setAnchor(item.id);
      open(placed);
    },
    [open],
  );

  /** The path: take another wallet at its fork (the trail goes on from it once it's followed). */
  const pick = useCallback((item: TreeItem) => {
    setChosen((s) => choose(s, item.id));
    setSelected(item.id);
  }, []);

  /** The path: go a hop further, through this wallet (read and opened). */
  const follow = useCallback(
    (item: TreeItem) => {
      setChosen((s) => choose(s, item.id));
      setSelected(item.id);
      if (!item.expanded) open({ item });
    },
    [open],
  );

  const picked: Target =
    byId.get(selected) ?? (items.has(selected) ? { item: items.get(selected)! } : byId.get("root")!);
  return { layout, byId, items, steps, picked, anchor, open, press, pick, follow, select: setSelected };
}
