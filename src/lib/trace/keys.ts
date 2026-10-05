// Whose API keys a Trace read runs on. Official accounts (and every caller where accounts aren't set up) use the
// site's own, from the environment (BLOCKSCOUT_API_KEY, SOLANA_RPC_URL, <CHAIN>_RPC_URL). Every other account
// brings its own (saved on /trace/keys, src/lib/trace-keys.ts) and never touches the site's: the readers ask here
// for a key instead of reading the environment, and each account's daily and monthly budgets are its own.
import { AsyncLocalStorage } from "node:async_hooks";
import type { TraceChain } from "./chains";
import { TraceError } from "./errors";

/** One account's own keys: its Blockscout API key and its Helius API key (for Solana), either may be missing. */
export type OwnKeys = { userId: string; blockscout: string | null; helius: string | null };

const scope = new AsyncLocalStorage<OwnKeys>();

/** Runs `fn` on an account's own keys; null runs it on the site's (the environment). */
export function withKeys<T>(keys: OwnKeys | null, fn: () => Promise<T>): Promise<T> {
  return keys ? scope.run(keys, fn) : fn();
}

/** The account whose own keys this read runs on; undefined on the site's. */
export const ownKeys = (): OwnKeys | undefined => scope.getStore();

/** A Helius API key as an RPC endpoint. */
export const heliusUrl = (key: string) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;

export function blockscoutKey(): string | undefined {
  const own = ownKeys();
  return (own ? own.blockscout : process.env.BLOCKSCOUT_API_KEY?.trim()) || undefined;
}

/** The Solana RPCs to read from: the account's Helius, or SOLANA_RPC_URL's (empty: the public ones). */
export function solanaRpcUrls(): string[] {
  const own = ownKeys();
  if (own) return own.helius ? [heliusUrl(own.helius)] : [];
  return (process.env.SOLANA_RPC_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/** The site's own RPC for an EVM chain (<CHAIN>_RPC_URL); never for an account on its own keys. */
export const evmRpcUrl = (chain: string): string | undefined =>
  ownKeys() ? undefined : process.env[`${chain.toUpperCase()}_RPC_URL`]?.trim() || undefined;

/**
 * Prefix for anything kept per key: budgets and cached reads. "" on the site's keys (the buckets and caches as
 * they've always been named), else the account's, so one account never spends or sees another's.
 */
export const keyScope = (): string => {
  const own = ownKeys();
  return own ? `u:${own.userId}:` : "";
};

/**
 * Throws "nokey" when the account is on its own keys and has none for what `chain` needs: Helius for Solana,
 * Blockscout for the EVM chains it reads (BSC's token reports need neither).
 */
export function needKeyFor(chain: TraceChain): void {
  const own = ownKeys();
  if (!own) return;
  if (chain.kind === "solana" && !own.helius)
    throw new TraceError("nokey", "Add your own Helius API key (free) to trace Solana.");
  if (chain.kind === "evm" && !chain.tokensOnly && !own.blockscout)
    throw new TraceError("nokey", "Add your own Blockscout API key (free) to trace EVM chains.");
}
