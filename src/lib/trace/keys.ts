// Whose API keys a Trace read runs on. Official accounts (and every caller where accounts aren't set up) use the
// site's own, from the environment (BLOCKSCOUT_API_KEY, SOLANA_RPC_URL, <CHAIN>_RPC_URL). Every other account
// runs, chain by chain (onKeysFor):
// - on its own key for that chain when it has added one (saved on /trace/keys, src/lib/trace-keys.ts): the
//   readers ask here for a key instead of reading the environment, and its daily and monthly budgets are its own;
// - else on its free allowance (src/lib/trace-allowance.ts): the site's keys, a few reads a day, and only out of
//   the share of the site's budgets free reads may have (budget.ts), so official accounts always keep theirs.
import { AsyncLocalStorage } from "node:async_hooks";
import type { TraceChain } from "./chains";
import { TraceError } from "./errors";

/** One account's own keys: its Blockscout API key and its Helius API key (for Solana), either may be missing. */
export type OwnKeys = { userId: string; blockscout: string | null; helius: string | null };

/** What a read takes from the free allowance: a wallet of a trail, or a token's report. */
export type Allowed = "wallet" | "report";

/** An account on its own keys: them, and (when it has one) its free allowance for a chain it has no key for. */
export type Caller = OwnKeys & { allowance?: (what: Allowed) => Promise<boolean> };

type Scope = Caller & { free: boolean };

const scope = new AsyncLocalStorage<Scope>();

/** Runs `fn` for an account on its own keys; null runs it on the site's (the environment). */
export function withKeys<T>(caller: Caller | null, fn: () => Promise<T>): Promise<T> {
  return caller ? scope.run({ ...caller, free: false }, fn) : fn();
}

/** The account whose own keys this read runs on; undefined on the site's (a free read included). */
export const ownKeys = (): OwnKeys | undefined => {
  const s = scope.getStore();
  return s && !s.free ? s : undefined;
};

/** This read runs on the site's keys out of an account's free allowance: within the free share of its budgets. */
export const freeRead = (): boolean => !!scope.getStore()?.free;

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
 * Prefix for what's counted per key: budgets and pacing. "" on the site's keys (the buckets as they've always
 * been named, a free read's included), else the account's, so one account never spends another's.
 */
export const keyScope = (): string => {
  const own = ownKeys();
  return own ? `u:${own.userId}:` : "";
};

/** The account's own key `chain` needs, if it needs one: Helius for Solana, Blockscout for the EVM chains it reads. */
function keyFor(chain: TraceChain): "helius" | "blockscout" | null {
  if (chain.kind === "solana") return "helius";
  return chain.tokensOnly ? null : "blockscout"; // BSC's token reports read keyless public APIs only
}

const NAMES = { helius: "Helius", blockscout: "Blockscout" } as const;

/**
 * Runs a read of `chain` for whoever this is: on the site's keys for an official account; on the account's own
 * key when it has one (or the chain needs none); else on its free allowance, taking one `what` from it (none
 * left: "allowance"). `what` null runs on the allowance without taking from it (a wallet's holdings, an extra of
 * a wallet already taken).
 */
export async function onKeysFor<T>(chain: TraceChain, what: Allowed | null, fn: () => Promise<T>): Promise<T> {
  const s = scope.getStore();
  if (!s || s.free) return fn();
  const need = keyFor(chain);
  if (!need || s[need]) return fn();
  const name = NAMES[need];
  if (!s.allowance) throw new TraceError("nokey", `Add your own ${name} API key (free) to trace ${chainsOf(need)}.`);
  if (what && !(await s.allowance(what)))
    throw new TraceError(
      "allowance",
      `You've used today's free ${what === "wallet" ? "wallet reads" : "token reports"}. Add your own ${name} API key (free) to keep tracing, or come back tomorrow (00:00 UTC).`,
    );
  return scope.run({ ...s, free: true }, fn);
}

const chainsOf = (key: "helius" | "blockscout") => (key === "helius" ? "Solana" : "EVM chains");

/** A free read the free share of the site's budget couldn't cover: everyone's free reads are spent for now. */
export const FREE_SPENT = (name: string) =>
  `Free reads are used up for everyone today. Add your own ${name} API key (free) to keep tracing.`;

/** Who this read is for: the account on its own keys, or "" for the site's. */
export const callerId = (): string => scope.getStore()?.userId ?? "";

/** An error about this caller's keys or allowance, not about the read: someone else's read may still go through. */
export const personal = (err: unknown) =>
  err instanceof TraceError && (err.code === "nokey" || err.code === "allowance");

/**
 * A read shared by everyone asking for the same thing at once (`start` makes it): when the one already under way
 * failed for its own caller's reasons (personal), this caller makes its own.
 */
export async function shareRead<T>(
  started: { who: string; value: Promise<T> } | undefined,
  start: () => Promise<T>,
): Promise<T> {
  if (!started) return start();
  try {
    return await started.value;
  } catch (err) {
    if (personal(err) && started.who !== callerId()) return start();
    throw err;
  }
}
