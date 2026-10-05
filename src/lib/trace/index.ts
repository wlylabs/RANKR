// Reads one wallet for the trace page, from the right source for its chain, kept for a few minutes: a trail
// asks for the same wallets again as it's opened and closed, and the free upstreams are rate-limited.
import { MOCK } from "../dexscreener";
import { traceChain, validWallet, type TraceChain } from "./chains";
import { isToken } from "./evm-rpc";
import { TraceError } from "./errors";
import { evmHoldings, traceEvm } from "./evm";
import { callerId, onKeysFor, shareRead } from "./keys";
import { mockTrace } from "./mock";
import { traceSolana } from "./solana";
import { readStored, store } from "./stored";
import type { TraceHoldings, TraceResponse } from "./types";

const TTL = 5 * 60_000;
const MAX_ENTRIES = 300;

/** Finished reads, and reads in flight (two people opening the same wallet make one). */
const cache = new Map<string, { at: number; who: string; value: Promise<TraceResponse> }>();

export async function traceWallet(chainId: string, address: string, now = Date.now()): Promise<TraceResponse> {
  const chain = traceChain(chainId);
  if (!chain)
    throw new TraceError(
      "unsupported",
      "Tracing works on Solana, Ethereum, Base, Arbitrum, Optimism, Polygon and Robinhood Chain.",
    );
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
  return readWallet(chain, address, now);
}

/**
 * A wallet's trail, from wherever it's cheapest: this server's memory, then the reads kept for everyone (stored.ts),
 * and only then the chain, on the caller's keys or free allowance (onKeysFor). Kept in memory for a few minutes
 * and stored for everyone, unless the rate limit or a budget cut it short.
 */
async function readWallet(chain: TraceChain, address: string, now: number): Promise<TraceResponse> {
  const key = `${chain.id}:${chain.kind === "evm" ? address.toLowerCase() : address}`;
  const hit = cache.get(key);
  return shareRead(hit && now - hit.at < TTL ? hit : undefined, () => {
    const value = (async () => {
      const kept = await readStored(key, now);
      if (kept) return kept;
      const read = await onKeysFor(chain, "wallet", () =>
        chain.kind === "solana" ? traceSolana(address) : traceEvm(chain, address),
      );
      if (!read.scanned.limited) store(key, read);
      return read;
    })();
    cache.set(key, { at: now, who: callerId(), value });
    // A failed read isn't kept, nor one the rate limit cut short: the next request tries again.
    const drop = () => cache.get(key)?.value === value && cache.delete(key);
    value.then((t) => t.scanned.limited && drop(), drop);
    if (cache.size > MAX_ENTRIES) {
      for (const [k, v] of cache) if (now - v.at >= TTL || cache.size > MAX_ENTRIES) cache.delete(k);
    }
    return value;
  });
}

/** Token balances read lately: a trail's target is read again as it's reopened and shared. */
const held = new Map<string, { at: number; value: Promise<TraceHoldings | "budget" | null> }>();

/**
 * The tokens a wallet holds now, for the wallet a trail starts at (EVM only: undefined elsewhere). Kept for a few
 * minutes, like its trail; a spent budget or a failed read isn't kept.
 */
export async function walletHoldings(
  chainId: string,
  address: string,
  now = Date.now(),
): Promise<TraceHoldings | "budget" | null | undefined> {
  const chain = traceChain(chainId);
  if (!chain || chain.kind !== "evm" || chain.tokensOnly || MOCK || !validWallet(chain, address)) return undefined;
  const key = `${chain.id}:${address.toLowerCase()}`;
  const hit = held.get(key);
  if (hit && now - hit.at < TTL) return hit.value;
  // An extra of the trail's own wallet, already taken from the allowance: it takes nothing more from it.
  const value = onKeysFor(chain, null, () => evmHoldings(chain, address)).catch(() => null);
  held.set(key, { at: now, value });
  value.then((h) => (h === null || h === "budget") && held.get(key)?.value === value && held.delete(key));
  if (held.size > MAX_ENTRIES) {
    for (const [k, v] of held) if (now - v.at >= TTL || held.size > MAX_ENTRIES) held.delete(k);
  }
  return value;
}

export { TraceError } from "./errors";
export { traceToken } from "./token";
