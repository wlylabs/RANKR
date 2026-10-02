// The trail as one line, for the tall share card: who funded the target (or the senders opened above it), the
// target, and the hops opened below it down to where the money ended up. Picked from the tree as it's opened.
import { DANGER } from "./kinds";
import type { TreeItem } from "./tree";
import type { TraceFlow, TraceLabel } from "./types";

export type PathStop =
  | {
      type: "wallet";
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

const wallets = (item: TreeItem, side: "in" | "out") =>
  item.children.filter((c) => c.type === "wallet" && c.side === side && c.flow);

/** How telling a counterparty is to end on: a flagged address, then an exchange / bridge / mixer, then money. */
function weight(item: TreeItem): number {
  const kind = item.flow?.label?.kind;
  return (kind && DANGER.has(kind) ? 2e15 : 0) + (item.flow?.terminal ? 1e15 : 0) + (item.flow?.usd ?? 0);
}

/** The hops opened below `item`: through what's open, to its most telling end. */
function down(item: TreeItem): TreeItem[] {
  const kids = wallets(item, "out");
  if (!kids.length) return [];
  const routes = kids.map((k) => (k.expanded ? [k, ...down(k)] : [k]));
  // The deepest route wins; between routes as deep, the one ending on the most telling counterparty.
  return routes.reduce((best, r) =>
    r.length > best.length || (r.length === best.length && weight(r.at(-1)!) > weight(best.at(-1)!)) ? r : best,
  );
}

/**
 * The senders above `item`, nearest first: through the ones opened (a funder first), then, at the top, who funded
 * the last one (or, for a sender that was opened, its most telling sender). Above an unopened target: its funder.
 */
function up(item: TreeItem): TreeItem[] {
  const kids = wallets(item, "in");
  const open = kids.filter((k) => k.expanded).sort((a, b) => Number(!!b.funder) - Number(!!a.funder));
  if (open.length) return [open[0], ...up(open[0])];
  const funder = kids.find((k) => k.funder);
  if (funder) return [funder];
  if (item.type === "root" || !kids.length) return [];
  return [kids.reduce((a, b) => (weight(b) > weight(a) ? b : a))];
}

/** The trail on the tall card, top to bottom, from the tree as it's opened. */
export function trailPath(root: TreeItem): PathStep[] {
  const above = up(root).reverse();
  const below = down(root);

  const steps: PathStep[] = [
    ...above.map(
      (item): PathStep => ({
        stop: {
          type: "wallet",
          address: item.address!,
          label: item.flow!.label,
          role: item.funder ? "funded" : "sent",
          hop: 0,
        },
        // An opened sender's money went to the stop below it: the next one down, or the target.
        down: item.flow!,
      }),
    ),
    {
      stop: { type: "wallet", address: root.address!, label: null, role: "target", hop: 0 },
      down: below[0]?.flow ?? null,
    },
    ...below.map((item, i): PathStep => {
      const last = i === below.length - 1;
      return {
        stop: {
          type: "wallet",
          address: item.address!,
          label: item.flow!.label,
          role: last && item.flow!.terminal ? "end" : "hop",
          hop: i + 1,
        },
        down: below[i + 1]?.flow ?? null,
      };
    }),
  ];
  return fold(steps);
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
