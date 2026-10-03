// The case file under the path: what the trail says in plain words, and the flags it raises. Only from
// what has been read so far (the target, and each wallet opened), and only facts: a label is quoted with its
// source, never turned into an accusation.
import { formatAmount, formatUsd } from "../format";
import { chainLabel, traceChain } from "./chains";
import { DANGER } from "./kinds";
import { dataOf } from "./tree";
import type { TraceFlow, TraceLabelKind, TraceResponse } from "./types";

export type CaseFlag = { id: string; text: string; danger: boolean };
/** Where the money ended up: an exchange, a bridge, a mixer, n hops below the target. */
export type CaseExit = { address: string; name: string; kind: TraceLabelKind; usd: number | null; hops: number };

export const DAY = 86_400_000;

/**
 * What a wallet holds now, in words, saying which chain and what's left out: "0.0018 ETH ($4.85) on Ethereum +
 * $30K in 2 tokens (USDC, PEPE)", or "...; tokens not counted" when they weren't read. Null without a balance.
 */
export function holdingsText(t: TraceResponse): string | null {
  const b = t.balance;
  if (!b) return null;
  const chain = traceChain(t.chain);
  let text = `${formatAmount(b.amount)} ${b.symbol}${b.usd !== null ? ` (${formatUsd(b.usd)})` : ""}`;
  if (chain) text += ` on ${chainLabel(chain)}`;
  const h = t.holdings;
  if (h === undefined) return `${text}; tokens not counted`;
  if (h === null) return `${text}; its tokens couldn't be read`;
  if (h === "budget") return `${text}; tokens not read (today's budget for them is used)`;
  if (!h.count) return `${text}, no priced tokens`;
  const names = h.top.map((a) => a.symbol).join(", ");
  const n = `${h.count}${h.partial ? "+" : ""} ${h.count === 1 && !h.partial ? "token" : "tokens"}`;
  return `${text} + ${formatUsd(h.usd)} in ${n} (${names}${h.count > h.top.length ? ", …" : ""})`;
}

/**
 * Walks the opened wallets from the target, one way: every labelled counterparty met, with the hop it was
 * met at (the first time). Out: where the money went. In: where it came from.
 */
export function labelledAlong(root: TraceResponse, data: Map<string, TraceResponse>, side: "in" | "out") {
  const found = new Map<string, { flow: TraceFlow; hops: number }>();
  const seen = new Set<string>([root.address]);
  let frontier: TraceResponse[] = [root];
  for (let hops = 1; frontier.length && hops <= 8; hops++) {
    const next: TraceResponse[] = [];
    for (const w of frontier) {
      const flows = side === "out" ? w.outflows : [...(w.funder ? [w.funder] : []), ...w.inflows];
      for (const f of flows) {
        if (f.label && !found.has(f.address)) found.set(f.address, { flow: f, hops });
        if (seen.has(f.address)) continue;
        seen.add(f.address);
        const d = dataOf(data, f.address);
        if (d && !f.terminal) next.push(d);
      }
    }
    frontier = next;
  }
  return [...found.values()];
}

export function caseFile(root: TraceResponse, data: Map<string, TraceResponse>, now = Date.now()) {
  const out = labelledAlong(root, data, "out");
  const inn = labelledAlong(root, data, "in");

  // One line per name: two Coinbase wallets are one exchange (the nearest hop, the money summed).
  const byName = new Map<string, CaseExit>();
  for (const { flow, hops } of out) {
    const label = flow.label!;
    if (!flow.terminal || label.kind === "contract" || label.kind === "dex") continue;
    const cur = byName.get(label.name);
    if (!cur)
      byName.set(label.name, { address: flow.address, name: label.name, kind: label.kind, usd: flow.usd, hops });
    else {
      cur.hops = Math.min(cur.hops, hops);
      if (flow.usd !== null) cur.usd = (cur.usd ?? 0) + flow.usd;
    }
  }
  const exits = [...byName.values()].sort((a, b) => a.hops - b.hops || (b.usd ?? 0) - (a.usd ?? 0));

  const flags: CaseFlag[] = [];
  if (root.label && DANGER.has(root.label.kind)) {
    flags.push({ id: "self", text: `Listed as ${root.label.name} (${root.label.source})`, danger: true });
  }
  if (root.firstSeen && now - root.firstSeen < 7 * DAY) {
    const days = Math.max(1, Math.round((now - root.firstSeen) / DAY));
    flags.push({ id: "fresh", text: `Fresh wallet: first seen ${days}d ago`, danger: false });
  }
  const touched = new Set<string>();
  for (const [side, list] of [
    ["out", out],
    ["in", inn],
  ] as const) {
    for (const { flow, hops } of list) {
      const label = flow.label!;
      if (!DANGER.has(label.kind) || touched.has(label.name)) continue;
      touched.add(label.name);
      flags.push({
        id: `${side}:${flow.address}`,
        text: `${side === "out" ? "Sent to" : "Funded by"} ${label.name}, ${hops === 1 ? "directly" : `${hops} hops away`} (${label.source})`,
        danger: true,
      });
    }
  }
  const bridge = exits.find((e) => e.kind === "bridge");
  if (bridge) {
    flags.push({
      id: "bridge",
      text: `Bridged out through ${bridge.name}: the money may sit on another chain now`,
      danger: false,
    });
  }
  const cex = exits.filter((e) => e.kind === "cex");
  if (cex.length) {
    flags.push({
      id: "cex",
      text: `Reached an exchange: ${[...new Set(cex.map((e) => e.name))].slice(0, 3).join(", ")}`,
      danger: false,
    });
  }
  const spread = root.outflows.filter((f) => !f.label).length + root.more.out;
  if (spread >= 5) flags.push({ id: "spread", text: `Spread out to ${spread} wallets`, danger: false });
  const tokensUsd = typeof root.holdings === "object" && root.holdings ? root.holdings.usd : 0;
  if (root.balance && root.balance.usd !== null && root.balance.usd + tokensUsd < 1 && root.outflows.length) {
    flags.push({ id: "empty", text: "Emptied: holds almost nothing now", danger: false });
  }

  const sum = (flows: TraceFlow[]) => flows.reduce((s, f) => s + (f.usd ?? 0), 0);
  return {
    exits,
    flags,
    inUsd: sum(root.inflows),
    outUsd: sum(root.outflows),
    senders: root.inflows.length + root.more.in,
    receivers: root.outflows.length + root.more.out,
  };
}
