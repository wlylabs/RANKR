// The trail as one line, top to bottom: who funded the target (or the senders followed above it), the target,
// and the hops followed below it down to where the money ended up. The trace page draws it as a column of cards
// (the path view) and the tall share card draws the same line, folded to fit.
import { DANGER } from "./kinds";
import { parentId, type Side, type TreeItem } from "./tree";
import type { TraceFlow, TraceLabel } from "./types";

export type PathStop =
  | {
      type: "wallet";
      /** Its id among the trail's wallets ("root" for the target). */
      id: string;
      address: string;
      label: TraceLabel | null;
      /** funded: its first money went to the stop below; sent: it sent the stop below money; end: the trail stops. */
      role: "funded" | "sent" | "target" | "hop" | "end";
      /** 1, 2... for hops below the target. */
      hop: number;
    }
  /** Hops left out of a long trail. */
  | { type: "gap"; count: number };

/** A stop, and what moved from it to the stop below (null for the last, or across a gap). */
export type PathStep = { stop: PathStop; down: TraceFlow | null };

/** At most this many stops on the card; a longer trail keeps its ends and folds its middle. */
export const MAX_STOPS = 6;

/** The wallets a card hangs on one side: the forks a trail can take from it. */
export const branches = (item: TreeItem, side: Side) =>
  item.children.filter((c) => c.type === "wallet" && c.side === side && c.flow);

/** Which side of its parent a card hangs on, from its id ("root/out:Abc" → "out"). */
export const sideOf = (id: string): Side => (id.slice(id.lastIndexOf("/") + 1).startsWith("in:") ? "in" : "out");

/** `chosen` with `id` picked at its fork, instead of whichever wallet was picked there before. */
export function choose(chosen: ReadonlySet<string>, id: string): Set<string> {
  const parent = parentId(id);
  const side = sideOf(id);
  return new Set([...[...chosen].filter((x) => parentId(x) !== parent || sideOf(x) !== side), id]);
}

/** How telling a counterparty is to end on: a flagged address, then an exchange / bridge / mixer, then money. */
function weight(item: TreeItem): number {
  const kind = item.flow?.label?.kind;
  return (kind && DANGER.has(kind) ? 2e15 : 0) + (item.flow?.terminal ? 1e15 : 0) + (item.flow?.usd ?? 0);
}

/**
 * The hops below `item`: the wallet picked at each fork (`chosen`), else the ones opened (the deepest route, then
 * the one ending on the most telling counterparty), down to the most telling counterparty of the last.
 */
function down(item: TreeItem, chosen: ReadonlySet<string>): TreeItem[] {
  const kids = branches(item, "out");
  if (!kids.length) return [];
  const pick = kids.find((k) => chosen.has(k.id));
  const opened = kids.filter((k) => k.expanded);
  const routes = (pick ? [pick] : opened.length ? opened : kids).map((k) =>
    k.expanded ? [k, ...down(k, chosen)] : [k],
  );
  return routes.reduce((best, r) =>
    r.length > best.length || (r.length === best.length && weight(r.at(-1)!) > weight(best.at(-1)!)) ? r : best,
  );
}

/**
 * The senders above `item`, nearest first: the one picked at each fork, else through the ones opened (a funder
 * first), then, at the top, who funded the last one (or, for a sender that was opened, its most telling sender).
 * Above an unopened target: its funder.
 */
function up(item: TreeItem, chosen: ReadonlySet<string>): TreeItem[] {
  const kids = branches(item, "in");
  const pick = kids.find((k) => chosen.has(k.id));
  if (pick) return [pick, ...(pick.expanded ? up(pick, chosen) : [])];
  const open = kids.filter((k) => k.expanded).sort((a, b) => Number(!!b.funder) - Number(!!a.funder));
  if (open.length) return [open[0], ...up(open[0], chosen)];
  const funder = kids.find((k) => k.funder);
  if (funder) return [funder];
  if (item.type === "root" || !kids.length) return [];
  return [kids.reduce((a, b) => (weight(b) > weight(a) ? b : a))];
}

/** The trail top to bottom, every stop of it, from the wallets followed and the ones picked at its forks. */
export function trailSteps(root: TreeItem, chosen: ReadonlySet<string> = new Set()): PathStep[] {
  const above = up(root, chosen).reverse();
  const below = down(root, chosen);

  return [
    ...above.map(
      (item): PathStep => ({
        stop: {
          type: "wallet",
          id: item.id,
          address: item.address!,
          label: item.flow!.label,
          role: item.funder ? "funded" : "sent",
          hop: 0,
        },
        // A sender's money went to the stop below it: the next one down, or the target.
        down: item.flow!,
      }),
    ),
    {
      stop: { type: "wallet", id: root.id, address: root.address!, label: null, role: "target", hop: 0 },
      down: below[0]?.flow ?? null,
    },
    ...below.map((item, i): PathStep => {
      const last = i === below.length - 1;
      return {
        stop: {
          type: "wallet",
          id: item.id,
          address: item.address!,
          label: item.flow!.label,
          role: last && item.flow!.terminal ? "end" : "hop",
          hop: i + 1,
        },
        down: below[i + 1]?.flow ?? null,
      };
    }),
  ];
}

/** The trail on the tall card: the same line, its middle folded when it's long. */
export function trailPath(root: TreeItem, chosen?: ReadonlySet<string>): PathStep[] {
  return fold(trailSteps(root, chosen));
}

/**
 * Over MAX_STOPS: of the senders above the target only the nearest stays; then the target, its first hop, a gap
 * standing for the hops left out, and the last hops down to the end.
 */
export function fold(steps: PathStep[]): PathStep[] {
  if (steps.length <= MAX_STOPS) return steps;
  const t = steps.findIndex((s) => s.stop.type === "wallet" && s.stop.role === "target");
  const kept = steps.slice(Math.max(0, t - 1));
  if (kept.length <= MAX_STOPS) return kept;
  const target = Math.min(t, 1);
  const head = kept.slice(0, target + 2);
  const tail = kept.slice(kept.length - (MAX_STOPS - head.length - 1));
  const count = kept.length - head.length - tail.length;
  return [...head.slice(0, -1), { ...head.at(-1)!, down: null }, { stop: { type: "gap", count }, down: null }, ...tail];
}
