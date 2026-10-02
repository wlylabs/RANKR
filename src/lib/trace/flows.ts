// From single transfers to the trail: every transfer in or out of the wallet (a leg), grouped by
// counterparty and direction, trades set aside, biggest first. Shared by Solana and the EVM chains.
import { isTerminal } from "./kinds";
import type { TraceAsset, TraceFlow, TraceLabel, TraceResponse } from "./types";

/** One transfer of one asset between the traced wallet and a counterparty. */
export type Leg = {
  tx: string;
  /** ms */
  time: number;
  dir: "in" | "out";
  counterparty: string;
  /** Identifies the asset: "native", or the token's address. */
  asset: string;
  symbol: string;
  amount: number;
  /** At today's price; null when the asset has none we trust (unlisted tokens: mostly spam). */
  usd: number | null;
  native: boolean;
  /** A label the source already knows (a bridge program, an explorer's tag). */
  label?: TraceLabel | null;
};

/** Counterparties shown per direction. */
export const TOP_FLOWS = 8;
/** Below this, a counterparty is dust (address poisoning, rent, airdropped spam): left out. */
export const MIN_USD = 1;

/**
 * Takes the trades out: a transaction where the wallet sends one asset and gets another back is a swap,
 * however many hops or fees it took. Summed, not drawn: a DEX pool is no one to follow.
 */
export function splitSwaps(legs: Leg[], isSwapTx: (tx: string) => boolean = () => false) {
  const byTx = new Map<string, Leg[]>();
  for (const l of legs) byTx.set(l.tx, [...(byTx.get(l.tx) ?? []), l]);

  const transfers: Leg[] = [];
  let txs = 0;
  let usd: number | null = null;
  for (const [tx, group] of byTx) {
    const outs = group.filter((l) => l.dir === "out");
    const ins = group.filter((l) => l.dir === "in");
    const traded = outs.length > 0 && ins.length > 0 && outs.some((o) => ins.some((i) => i.asset !== o.asset));
    if (!traded && !isSwapTx(tx)) {
      transfers.push(...group);
      continue;
    }
    txs++;
    // A trade's size: the bigger side (the other is the same less fees and slippage).
    const side = (ls: Leg[]) => (ls.some((l) => l.usd !== null) ? ls.reduce((s, l) => s + (l.usd ?? 0), 0) : null);
    const size = Math.max(side(outs) ?? 0, side(ins) ?? 0);
    if (side(outs) !== null || side(ins) !== null) usd = (usd ?? 0) + size;
  }
  return { transfers, swaps: txs ? { txs, usd } : null };
}

function sumUsd(legs: Leg[]): number | null {
  return legs.some((l) => l.usd !== null) ? legs.reduce((s, l) => s + (l.usd ?? 0), 0) : null;
}

/** One counterparty's legs in one direction -> a flow (label and terminal set later). */
export function toFlow(counterparty: string, legs: Leg[]): TraceFlow {
  const assets = new Map<string, TraceAsset & { native: boolean }>();
  for (const l of legs) {
    const a = assets.get(l.asset) ?? { symbol: l.symbol, amount: 0, usd: null, native: l.native };
    a.amount += l.amount;
    if (l.usd !== null) a.usd = (a.usd ?? 0) + l.usd;
    assets.set(l.asset, a);
  }
  const latest = legs.reduce((a, b) => (b.time > a.time ? b : a));
  return {
    address: counterparty,
    label: legs.find((l) => l.label)?.label ?? null,
    terminal: false,
    usd: sumUsd(legs),
    assets: [...assets.values()]
      .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || Number(b.native) - Number(a.native) || b.amount - a.amount)
      .slice(0, 3)
      .map(({ symbol, amount, usd }) => ({ symbol, amount, usd })),
    txs: new Set(legs.map((l) => l.tx)).size,
    first: Math.min(...legs.map((l) => l.time)),
    last: latest.time,
    tx: latest.tx,
  };
}

/**
 * Worth drawing: worth a dollar or more, or (when there is no price to go by) a thousandth of a native coin or
 * more. An unpriced token is left out; that's where airdropped spam lives.
 */
function significant(f: TraceFlow, legs: Leg[]): boolean {
  if (f.usd !== null) return f.usd >= MIN_USD;
  return legs.filter((l) => l.native).reduce((s, l) => s + l.amount, 0) >= 0.001;
}

/** The counterparties one way, biggest first: the top `TOP_FLOWS`, and how many more there are. */
export function topFlows(legs: Leg[], dir: "in" | "out"): { flows: TraceFlow[]; more: number } {
  const byCounterparty = new Map<string, Leg[]>();
  for (const l of legs) {
    if (l.dir !== dir) continue;
    byCounterparty.set(l.counterparty, [...(byCounterparty.get(l.counterparty) ?? []), l]);
  }
  const flows = [...byCounterparty]
    .map(([cp, ls]) => [toFlow(cp, ls), ls] as const)
    .filter(([f, ls]) => significant(f, ls))
    .map(([f]) => f)
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || b.txs - a.txs);
  return { flows: flows.slice(0, TOP_FLOWS), more: Math.max(0, flows.length - TOP_FLOWS) };
}

/** Where the wallet's first money came from: the earliest incoming native transfer among `legs`. */
export function firstFunding(legs: Leg[]): TraceFlow | null {
  const first = legs
    .filter((l) => l.dir === "in" && l.native && l.amount > 0)
    .reduce<Leg | null>((a, b) => (!a || b.time < a.time ? b : a), null);
  return first ? toFlow(first.counterparty, [first]) : null;
}

/** Names every flow and marks the ones that end the trail. */
export function labelFlows(flows: TraceFlow[], labelOf: (address: string) => TraceLabel | null): TraceFlow[] {
  return flows.map((f) => {
    const label = labelOf(f.address) ?? f.label;
    return { ...f, label, terminal: isTerminal(label) };
  });
}

/** Everything a wallet's legs say, in the response's shape (identity and scope filled in by the caller). */
export function summarize(
  legs: Leg[],
  labelOf: (address: string) => TraceLabel | null,
  isSwapTx?: (tx: string) => boolean,
): Pick<TraceResponse, "inflows" | "outflows" | "more" | "swaps"> {
  const { transfers, swaps } = splitSwaps(legs, isSwapTx);
  const inflows = topFlows(transfers, "in");
  const outflows = topFlows(transfers, "out");
  return {
    inflows: labelFlows(inflows.flows, labelOf),
    outflows: labelFlows(outflows.flows, labelOf),
    more: { in: inflows.more, out: outflows.more },
    swaps,
  };
}
