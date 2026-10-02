"use client";

import { useCallback, useMemo, useState } from "react";
import { buildTree, dataOf, layoutTree, parentId, type Placed } from "@/lib/trace/tree";
import type { TraceResponse } from "@/lib/trace/types";

const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};
const without = (set: Set<string>, id: string) => (set.has(id) ? new Set([...set].filter((x) => x !== id)) : set);

/**
 * What a trail's tree shows and what a tap does to it: open or close a wallet (reading it first via `read`),
 * show a row's smaller counterparties, unfold the wallets folded away beside an open one. Shared by the trace
 * page and its made-up example.
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
  const [selected, setSelected] = useState("root");
  const [anchor, setAnchor] = useState<string | null>(null);

  const tree = useMemo(
    () => buildTree({ root, data, errors, expanded, showAll, unfolded }),
    [root, data, errors, expanded, showAll, unfolded],
  );
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.item.id, n])), [layout]);

  /** Opens or closes a wallet; opening one folds its row's others away again. */
  const open = useCallback(
    (placed: Placed) => {
      const { item } = placed;
      if (!item.expandable || !item.address) return;
      setAnchor(item.id);
      if (!item.expanded) {
        if (!dataOf(data, item.address)) read(item.address);
        const parent = parentId(item.id);
        if (parent) setUnfolded((s) => without(s, parent));
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

  const picked = byId.get(selected) ?? byId.get("root")!;
  return { layout, byId, picked, anchor, open, press };
}
