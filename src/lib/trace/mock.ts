// Made-up trails for RANKR_MOCK=1, so the trace page works offline. Every address leads to the same made-up
// counterparties each time (they come from a hash of it), so opening a wallet twice draws the same tree.
import { isTerminal } from "./kinds";
import type { TraceChain } from "./chains";
import type { TraceFlow, TraceLabel, TraceResponse } from "./types";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same seed, the same numbers. */
function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const HEX = "0123456789abcdef";

function mockAddress(chain: TraceChain, seed: string): string {
  const r = rng(seed);
  if (chain.kind === "evm") return `0x${Array.from({ length: 40 }, () => HEX[Math.floor(r() * 16)]).join("")}`;
  return Array.from({ length: 44 }, () => BASE58[Math.floor(r() * BASE58.length)]).join("");
}

const ENDS: TraceLabel[] = [
  { kind: "cex", name: "Binance deposit", source: "exchange deposit list" },
  { kind: "cex", name: "OKX", source: "exchange reserve lists" },
  { kind: "cex", name: "Coinbase", source: "exchange reserve lists" },
  { kind: "bridge", name: "Wormhole", source: "program list" },
  { kind: "mixer", name: "Tornado Cash", source: "open-source label lists" },
];
const FLAGGED: TraceLabel[] = [
  { kind: "sanctioned", name: "OFAC sanctioned", source: "OFAC SDN list" },
  { kind: "hack", name: "Exploiter 3", source: "open-source label lists" },
];

const PRICE: Record<string, number> = { SOL: 150, ETH: 2600, POL: 0.4 };

function flow(chain: TraceChain, seed: string, r: () => number, now: number, label: TraceLabel | null): TraceFlow {
  const amount = Math.round(10 ** (r() * 3.2 - 0.5) * 100) / 100;
  const usd = amount * (PRICE[chain.native] ?? 1);
  const last = now - Math.floor(r() * 20 * 86_400_000);
  const assets = [{ symbol: chain.native, amount, usd }];
  if (r() < 0.3) assets.push({ symbol: "USDC", amount: Math.round(r() * 5000), usd: Math.round(r() * 5000) });
  return {
    address: mockAddress(chain, seed),
    label,
    terminal: isTerminal(label),
    usd: assets.reduce((s, a) => s + (a.usd ?? 0), 0),
    assets,
    txs: 1 + Math.floor(r() * 6),
    first: last - Math.floor(r() * 5 * 86_400_000),
    last,
    tx: mockAddress(chain, `${seed}/tx`),
  };
}

export function mockTrace(chain: TraceChain, address: string, now = Date.now()): TraceResponse {
  const r = rng(`${chain.id}:${address}`);
  const depth = hash(address) % 4;
  const pick = (labels: TraceLabel[], odds: number) => (r() < odds ? labels[Math.floor(r() * labels.length)] : null);
  const side = (dir: "in" | "out", n: number) =>
    Array.from({ length: n }, (_, i) =>
      flow(
        chain,
        `${address}/${dir}/${i}`,
        r,
        now,
        dir === "out" ? (pick(ENDS, 0.25 + depth * 0.1) ?? pick(FLAGGED, 0.06)) : pick(ENDS.slice(0, 3), 0.2),
      ),
    ).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  const inflows = side("in", 2 + Math.floor(r() * 3));
  const outflows = side("out", 3 + Math.floor(r() * 4));
  const firstSeen = now - Math.floor((1 + r() * 60) * 86_400_000);
  const funder = { ...inflows[inflows.length - 1], first: firstSeen, last: firstSeen, txs: 1 };
  const balance = Math.round(r() * 4000) / 100;
  return {
    chain: chain.id,
    address,
    label: null,
    balance: { symbol: chain.native, amount: balance, usd: balance * (PRICE[chain.native] ?? 1) },
    firstSeen,
    funder,
    inflows,
    outflows,
    more: { in: Math.floor(r() * 3), out: Math.floor(r() * 9) },
    swaps: r() < 0.7 ? { txs: 2 + Math.floor(r() * 40), usd: Math.round(r() * 30_000) } : null,
    scanned: { txs: 30, from: now - 9 * 86_400_000, to: now - 3_600_000, complete: r() < 0.5 },
    updatedAt: now,
  };
}

/** A made-up trail for the trace page's example: a target and one wallet below it opened. Nothing in it is real. */
export function exampleTrail(now: number) {
  const chain: TraceChain = { id: "solana", kind: "solana", native: "SOL", explorer: "" };
  const root = mockAddress(chain, "rankr/example");
  const top = mockTrace(chain, root, now);
  const data = new Map([[root, top]]);
  const expanded = new Set<string>();
  const next = top.outflows.find((f) => !f.terminal);
  if (next) {
    data.set(next.address, mockTrace(chain, next.address, now));
    expanded.add(`root/out:${next.address}`);
  }
  return { root, data, expanded };
}
