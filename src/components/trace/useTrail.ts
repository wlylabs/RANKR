"use client";

import { useCallback, useMemo, useState } from "react";
import { choose, trailSteps } from "@/lib/trace/path";
import { buildTree, dataOf, type TreeItem } from "@/lib/trace/tree";
import type { TraceResponse } from "@/lib/trace/types";

const without = (set: Set<string>, id: string) => (set.has(id) ? new Set([...set].filter((x) => x !== id)) : set);

/**
 * A trail's path and what a tap does to it: follow a wallet (read it via `read`, then go a hop further through
 * it), take another wallet at a fork, or stop following one. Shared by the trace page and its made-up example.
 */
export function useTrail(
  root: string,
  data: Map<string, TraceResponse>,
  errors: Map<string, string>,
  read: (address: string) => void,
  initial?: { expanded?: Set<string> },
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => initial?.expanded ?? new Set());
  /** The wallet followed at each fork, by id: the path goes through these. */
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState("root");

  const tree = useMemo(() => buildTree({ root, data, errors, expanded }), [root, data, errors, expanded]);
  const items = useMemo(() => {
    const map = new Map<string, TreeItem>();
    const walk = (i: TreeItem) => {
      map.set(i.id, i);
      i.children.forEach(walk);
    };
    walk(tree);
    return map;
  }, [tree]);
  const steps = useMemo(() => trailSteps(tree, chosen), [tree, chosen]);

  /** Go a hop further through this wallet (read and opened), or stop following it when it's open. */
  const toggle = useCallback(
    (item: TreeItem) => {
      if (!item.expandable || !item.address) return;
      if (item.expanded) {
        setChosen((s) => without(s, item.id));
        setExpanded((s) => without(s, item.id));
        return;
      }
      if (!dataOf(data, item.address)) read(item.address);
      setChosen((s) => choose(s, item.id));
      setExpanded((s) => new Set(s).add(item.id));
    },
    [data, read],
  );

  /** Take another wallet at its fork (the trail goes on from it once it's followed). */
  const pick = useCallback((item: TreeItem) => {
    setChosen((s) => choose(s, item.id));
    setSelected(item.id);
  }, []);

  /** Go a hop further, through this wallet. */
  const follow = useCallback(
    (item: TreeItem) => {
      setSelected(item.id);
      if (item.expanded) setChosen((s) => choose(s, item.id));
      else toggle(item);
    },
    [toggle],
  );

  const picked = items.get(selected) ?? tree;
  return { items, steps, picked, toggle, pick, follow, select: setSelected };
}
