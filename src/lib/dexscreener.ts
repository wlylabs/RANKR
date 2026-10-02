import { sameAddress, tokenId } from "./address";
import { mockSnapshot } from "./mock";
import type { Link, MarketSnapshot } from "./types";

const API = (process.env.DEXSCREENER_API_URL ?? "https://api.dexscreener.com").replace(/\/+$/, "");
const BATCH = 30; // max addresses per /tokens/v1 call

export const MOCK = process.env.RANKR_MOCK === "1";

export type Pair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label?: string; url: string }[];
    socials?: { type?: string; platform?: string; url?: string; handle?: string }[];
  };
};

export class UpstreamError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new UpstreamError(`DexScreener unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) throw new UpstreamError(`DexScreener responded ${res.status}`);
  return (await res.json()) as T;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function pairScore(p: Pair): number {
  return (p.liquidity?.usd ?? 0) * 1_000 + (p.volume?.h24 ?? 0);
}

/** Picks the most liquid priced pair, the same one DexScreener would show for the token. */
export function bestPair(pairs: Pair[]): Pair | null {
  let best: Pair | null = null;
  for (const p of pairs) {
    if (num(p.priceUsd) === null) continue;
    if (!best || pairScore(p) > pairScore(best)) best = p;
  }
  return best;
}

function socialLink(s: NonNullable<NonNullable<Pair["info"]>["socials"]>[number]): Link | null {
  const type = (s.type ?? s.platform ?? "link").toLowerCase();
  let url = s.url;
  if (!url && s.handle) {
    if (type === "twitter") url = `https://x.com/${s.handle.replace(/^@/, "")}`;
    else if (type === "telegram") url = `https://t.me/${s.handle.replace(/^@/, "")}`;
  }
  return url ? { label: type, url } : null;
}

export function toSnapshot(p: Pair): MarketSnapshot {
  return {
    chainId: p.chainId,
    address: p.baseToken.address,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
    imageUrl: p.info?.imageUrl ?? null,
    priceUsd: num(p.priceUsd) ?? 0,
    marketCap: num(p.marketCap),
    fdv: num(p.fdv),
    liquidityUsd: num(p.liquidity?.usd),
    volume24h: num(p.volume?.h24),
    priceChange24h: num(p.priceChange?.h24),
    txns24h: p.txns?.h24 ? (num(p.txns.h24.buys) ?? 0) + (num(p.txns.h24.sells) ?? 0) : null,
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    url: p.url,
    pairCreatedAt: num(p.pairCreatedAt),
    websites: (p.info?.websites ?? []).map((w) => ({ label: w.label || "Website", url: w.url })),
    socials: (p.info?.socials ?? []).map(socialLink).filter((l): l is Link => l !== null),
    fetchedAt: Date.now(),
  };
}

/** Best pair per chain for a token address; the address may exist on several EVM chains. */
function bestAcrossChains(pairs: Pair[], address: string): Pair | null {
  return bestPair(pairs.filter((p) => sameAddress(p.baseToken.address, address)));
}

/**
 * Resolves a pasted address to live market data. The address can be a token (the normal
 * case) or a pair/pool address, which is what DexScreener and Photon links contain.
 */
export async function findToken(address: string, chainHint: string | null): Promise<MarketSnapshot | null> {
  if (MOCK) return mockSnapshot(address, chainHint);

  const pairs = chainHint
    ? await getJson<Pair[] | null>(`/tokens/v1/${encodeURIComponent(chainHint)}/${encodeURIComponent(address)}`)
    : (await getJson<{ pairs: Pair[] | null }>(`/latest/dex/tokens/${encodeURIComponent(address)}`)).pairs;

  const direct = bestAcrossChains(pairs ?? [], address);
  if (direct) return toSnapshot(direct);

  // Not a token address. Try it as a pair address and follow it to the base token.
  const search = await getJson<{ pairs: Pair[] | null }>(`/latest/dex/search?q=${encodeURIComponent(address)}`);
  const match = (search.pairs ?? []).find(
    (p) =>
      (sameAddress(p.pairAddress, address) || sameAddress(p.baseToken.address, address)) &&
      (!chainHint || p.chainId === chainHint),
  );
  if (!match) return null;
  const tokenPairs = await getJson<Pair[] | null>(
    `/tokens/v1/${encodeURIComponent(match.chainId)}/${encodeURIComponent(match.baseToken.address)}`,
  );
  return toSnapshot(bestAcrossChains(tokenPairs ?? [], match.baseToken.address) ?? match);
}

/** Live snapshots for many tokens, batched per chain. Keyed by tokenId. */
export async function fetchSnapshots(
  tokens: { chainId: string; address: string }[],
): Promise<Map<string, MarketSnapshot>> {
  const out = new Map<string, MarketSnapshot>();
  if (MOCK) {
    for (const t of tokens) out.set(tokenId(t.chainId, t.address), mockSnapshot(t.address, t.chainId));
    return out;
  }

  const byChain = new Map<string, string[]>();
  for (const t of tokens) byChain.set(t.chainId, [...(byChain.get(t.chainId) ?? []), t.address]);

  const requests: Promise<void>[] = [];
  for (const [chainId, addresses] of byChain) {
    for (let i = 0; i < addresses.length; i += BATCH) {
      const chunk = addresses.slice(i, i + BATCH);
      requests.push(
        getJson<Pair[] | null>(`/tokens/v1/${encodeURIComponent(chainId)}/${chunk.map(encodeURIComponent).join(",")}`)
          .then((pairs) => {
            for (const address of chunk) {
              const best = bestPair((pairs ?? []).filter((p) => sameAddress(p.baseToken.address, address)));
              if (best) out.set(tokenId(chainId, address), toSnapshot(best));
            }
          })
          .catch((err) => console.warn(`[rankr] refresh ${chainId} failed:`, (err as Error).message)),
      );
    }
  }
  await Promise.all(requests);
  return out;
}
