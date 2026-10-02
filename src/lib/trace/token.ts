// A token's report for the trace page: a contract address pasted on Trace opens this instead of a trail. Reads
// DexScreener (its pools, buys and sells), GeckoTerminal (the main pool's wallets and latest trades), and the
// chain itself (Solana's RPC; Blockscout and Honeypot.is on EVM), then runs the checks (token-assess.ts). Kept a
// minute: trades move fast, and the free upstreams are rate-limited.
import { MOCK, tokenPairs, type Pair } from "../dexscreener";
import { traceChain, validWallet, type TraceChain } from "./chains";
import { TraceError } from "./errors";
import { poolTrades, poolWindows } from "./gecko";
import { labelOf, solanaDeposits } from "./labels";
import { assessToken, type TokenFacts } from "./token-assess";
import { evmTokenFacts } from "./token-evm";
import { mockTokenFacts } from "./token-mock";
import { solanaTokenFacts } from "./token-solana";
import type { TokenReport } from "./types";

const TTL = 60_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; value: Promise<TokenReport> }>();

async function readToken(chain: TraceChain, address: string, now: number): Promise<TokenReport> {
  const pairs = await tokenPairs(chain.id, address).catch((err) => {
    console.warn("[rankr] trace: token pools unavailable:", (err as Error).message);
    return null;
  });
  const best: Pair | undefined = pairs?.[0];
  const quiet = <T>(p: Promise<T | null>) =>
    p.catch((err) => {
      console.warn("[rankr] trace: GeckoTerminal unavailable:", (err as Error).message);
      return null;
    });
  const deposits = chain.kind === "solana" ? await solanaDeposits() : undefined;
  const [facts, pool, trades] = await Promise.all([
    chain.kind === "solana" ? solanaTokenFacts(address, pairs ?? [], deposits!) : evmTokenFacts(chain, address, pairs ?? []),
    best ? quiet(poolWindows(chain.id, best.pairAddress)) : null,
    best ? quiet(poolTrades(chain.id, best.pairAddress, address)) : null,
  ]);
  const input: TokenFacts = {
    chain: chain.id,
    address,
    pairs,
    pool,
    trades,
    creator: null,
    ...facts,
    label: (a) => labelOf(chain.id, a, deposits),
    now,
  };
  return assessToken(input);
}

export async function traceToken(chainId: string, address: string, now = Date.now()): Promise<TokenReport> {
  const chain = traceChain(chainId);
  if (!chain)
    throw new TraceError("unsupported", "Tracing works on Solana, Ethereum, Base, Arbitrum, Optimism and Polygon.");
  if (!validWallet(chain, address))
    throw new TraceError("invalid", `That isn't a ${chain.id === "solana" ? "Solana" : "EVM"} address.`);
  if (MOCK) return assessToken(mockTokenFacts(chain, address, now));

  const key = `${chain.id}:${chain.kind === "evm" ? address.toLowerCase() : address}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.value;
  const value = readToken(chain, address, now);
  cache.set(key, { at: now, value });
  value.catch(() => cache.get(key)?.value === value && cache.delete(key));
  if (cache.size > MAX_ENTRIES) {
    for (const [k, v] of cache) if (now - v.at >= TTL || cache.size > MAX_ENTRIES) cache.delete(k);
  }
  return value;
}
