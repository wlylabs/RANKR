// GeckoTerminal's public API (api.geckoterminal.com, no key, about 30 calls a minute per IP): a pool's buys and
// sells with the wallets behind them, and its latest trades (up to 300, within 24 hours), each with the wallet
// that made it. Shown as "Powered by GeckoTerminal", as its terms ask. Two calls per token report.
import { sameAddress } from "../address";
import type { PoolWindows, RawTrade } from "./token-assess";
import type { TokenWindow } from "./types";

const API = () => (process.env.GECKOTERMINAL_API_URL ?? "https://api.geckoterminal.com/api/v2").replace(/\/+$/, "");

/** Rankr's chain ids (DexScreener's) -> GeckoTerminal's network ids. */
export const GECKO_NETWORKS: Record<string, string> = {
  solana: "solana",
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon_pos",
};

async function gecko<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API()}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GeckoTerminal responded ${res.status}`);
  return (await res.json()) as T;
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

type Counts = { buys?: number; sells?: number; buyers?: number; sellers?: number };
type PoolBody = { data?: { attributes?: { transactions?: Partial<Record<"m5" | "h1" | "h6" | "h24", Counts>> } } };

const KEYS: [TokenWindow, "m5" | "h1" | "h6" | "h24"][] = [
  ["5m", "m5"],
  ["1h", "h1"],
  ["6h", "h6"],
  ["24h", "h24"],
];

/** The pool's buys and sells per window, and how many wallets made them. */
export async function poolWindows(chain: string, pool: string): Promise<PoolWindows | null> {
  const net = GECKO_NETWORKS[chain];
  if (!net) return null;
  const body = await gecko<PoolBody>(`/networks/${net}/pools/${encodeURIComponent(pool)}`);
  const tx = body?.data?.attributes?.transactions;
  if (!tx) return null;
  const out: PoolWindows = {};
  for (const [w, k] of KEYS) {
    const c = tx[k];
    if (c) out[w] = { buys: int(c.buys), sells: int(c.sells), buyers: int(c.buyers), sellers: int(c.sellers) };
  }
  return out;
}

type TradesBody = {
  data?: {
    attributes?: {
      tx_hash?: string;
      tx_from_address?: string;
      kind?: string;
      volume_in_usd?: string | number;
      block_timestamp?: string;
      from_token_address?: string;
      to_token_address?: string;
      from_token_amount?: string | number;
      to_token_amount?: string | number;
    };
  }[];
};

/**
 * The pool's latest trades of `token`. A buy is the token coming out of the pool, a sell going in: read from the
 * trade's tokens, not GeckoTerminal's "kind", which is about the pool's own base token (maybe the other one).
 */
export async function poolTrades(chain: string, pool: string, token: string): Promise<RawTrade[] | null> {
  const net = GECKO_NETWORKS[chain];
  if (!net) return null;
  const body = await gecko<TradesBody>(`/networks/${net}/pools/${encodeURIComponent(pool)}/trades`);
  if (!body?.data) return null;
  const out: RawTrade[] = [];
  for (const { attributes: a } of body.data) {
    if (!a?.tx_from_address || !a.tx_hash) continue;
    const side = a.to_token_address && sameAddress(a.to_token_address, token)
      ? "buy"
      : a.from_token_address && sameAddress(a.from_token_address, token)
        ? "sell"
        : null;
    const usd = Number(a.volume_in_usd);
    const time = Date.parse(a.block_timestamp ?? "");
    if (!side || !Number.isFinite(usd) || !Number.isFinite(time)) continue;
    // In tokens: what came out of the pool on a buy, what went in on a sell.
    const amount = Number(side === "buy" ? a.to_token_amount : a.from_token_amount);
    out.push({
      wallet: a.tx_from_address,
      side,
      usd,
      ...(Number.isFinite(amount) && amount > 0 && { amount }),
      time,
      tx: a.tx_hash,
    });
  }
  return out;
}
