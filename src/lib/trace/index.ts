// Reads one wallet for the trace page, from the right source for its chain, kept for a few minutes: a trail
// asks for the same wallets again as it's opened and closed, and the free upstreams are rate-limited.
import { MOCK } from "../dexscreener";
import { traceChain, validWallet } from "./chains";
import { isToken } from "./evm-rpc";
import { TraceError } from "./errors";
import { traceEvm } from "./evm";
import { mockTrace } from "./mock";
import { traceSolana } from "./solana";
import type { TraceResponse } from "./types";

const TTL = 5 * 60_000;
const MAX_ENTRIES = 300;

/** Finished reads, and reads in flight (two people opening the same wallet make one). */
const cache = new Map<string, { at: number; value: Promise<TraceResponse> }>();

export async function traceWallet(chainId: string, address: string, now = Date.now()): Promise<TraceResponse> {
  const chain = traceChain(chainId);
  if (!chain)
    throw new TraceError("unsupported", "Tracing works on Solana, Ethereum, Base, Arbitrum, Optimism and Polygon.");
  if (!validWallet(chain, address))
    throw new TraceError("invalid", `That isn't a ${chain.id === "solana" ? "Solana" : "EVM"} address.`);
  // BSC: its tokens have reports, its wallets no trail yet (no free explorer API to read them from).
  if (chain.tokensOnly) {
    const token = MOCK || (await isToken(chain.id, address));
    if (token) throw new TraceError("token", "That's a token, not a wallet.");
    throw new TraceError(
      token === undefined ? "upstream" : "unsupported",
      token === undefined ? "Couldn't reach BSC. Try again." : "BSC wallets can't be traced yet: paste a BSC token's CA for its report.",
    );
  }
  if (MOCK) {
    // Made up: a Solana address ending in "pump", like pump.fun's tokens, is a token (its report is made up too).
    if (chain.kind === "solana" && address.endsWith("pump")) throw new TraceError("token", "That's a token, not a wallet.");
    return mockTrace(chain, address, now);
  }

  const key = `${chain.id}:${chain.kind === "evm" ? address.toLowerCase() : address}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.value;

  const value = chain.kind === "solana" ? traceSolana(address) : traceEvm(chain, address);
  cache.set(key, { at: now, value });
  // A failed read isn't kept, nor one the rate limit cut short: the next request tries again.
  const drop = () => cache.get(key)?.value === value && cache.delete(key);
  value.then((t) => t.scanned.limited && drop(), drop);
  if (cache.size > MAX_ENTRIES) {
    for (const [k, v] of cache) if (now - v.at >= TTL || cache.size > MAX_ENTRIES) cache.delete(k);
  }
  return value;
}

export { TraceError } from "./errors";
export { traceToken } from "./token";
