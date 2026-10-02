// A Solana token's contract and holders, over the same RPC as wallets (solana.ts): the mint account (its
// authorities and Token-2022 extensions), the 20 biggest token accounts, who owns them, and what those owners
// are (a pool's vault, a burn address, an exchange). Four calls.
import type { Pair } from "../dexscreener";
import { TraceError } from "./errors";
import { labelOf, solanaDex } from "./labels";
import { rpc, TOKEN_PROGRAMS } from "./solana";
import type { RawHolder, SolanaContract, TokenFacts } from "./token-assess";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** Where tokens are sent to be burned for good. */
const INCINERATOR = "1nc1nerator11111111111111111111111111111111";
/**
 * Pools whose vaults are owned by an authority with no account of its own (so no program to tell it by):
 * Raydium's AMM v4 authority and its CPMM vault authority, from Raydium's program docs.
 */
const POOL_AUTHORITIES = new Set([
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL",
]);

type Extension = { extension?: string; state?: Record<string, unknown> };
type MintInfo = {
  decimals?: number;
  supply?: string;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  extensions?: Extension[];
};
type Account<D> = { owner: string; data: D } | null;
type Parsed<I> = { parsed?: { type?: string; info?: I } } | unknown[];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The mint account as the report reads it: who can mint and freeze, and what Token-2022 adds. */
export function readMint(program: string, info: MintInfo): SolanaContract {
  const ext = (name: string) => info.extensions?.find((e) => e.extension === name);
  const fee = ext("transferFeeConfig")?.state;
  const bps = (key: string) => Number((fee?.[key] as { transferFeeBasisPoints?: number } | undefined)?.transferFeeBasisPoints) || 0;
  const feeBps = fee ? Math.max(bps("olderTransferFee"), bps("newerTransferFee")) : 0;
  const pausable = ext("pausableConfig")?.state;
  return {
    kind: "solana",
    token2022: program === TOKEN_2022,
    mintAuthority: str(info.mintAuthority),
    freezeAuthority: str(info.freezeAuthority),
    transferFeeBps: feeBps || null,
    feeAuthority: feeBps ? str(fee?.transferFeeConfigAuthority) : null,
    permanentDelegate: str(ext("permanentDelegate")?.state?.delegate),
    transferHook: str(ext("transferHook")?.state?.programId),
    nonTransferable: !!ext("nonTransferable"),
    defaultFrozen: ext("defaultAccountState")?.state?.accountState === "frozen",
    pausable: pausable ? { paused: !!pausable.paused } : null,
  };
}

/** The biggest holders, by wallet (a token account followed to its owner), with what each owner is. */
async function holders(
  mint: string,
  decimals: number,
  pairs: Pair[],
  deposits: Map<string, string>,
): Promise<RawHolder[]> {
  const largest = await rpc<{ value: { address: string; amount: string }[] }>("getTokenLargestAccounts", [
    mint,
    { commitment: "confirmed" },
  ]);
  const accounts = largest.value ?? [];
  if (!accounts.length) return [];
  const parsed = await rpc<{ value: Account<Parsed<{ owner?: string }>>[] }>("getMultipleAccounts", [
    accounts.map((a) => a.address),
    { encoding: "jsonParsed" },
  ]);
  const ownerOf = accounts.map((a, i) => {
    const data = parsed.value?.[i]?.data;
    return (!Array.isArray(data) && str(data?.parsed?.info?.owner)) || a.address;
  });
  const owners = [...new Set(ownerOf)];
  // What each owner is: a pool's vault authority belongs to the DEX's program.
  const programs = await rpc<{ value: Account<unknown>[] }>("getMultipleAccounts", [
    owners,
    { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
  ]);
  const programOf = new Map(owners.map((o, i) => [o, programs.value?.[i]?.owner ?? null]));
  const pools = new Set(pairs.map((p) => p.pairAddress));

  const byOwner = new Map<string, RawHolder>();
  accounts.forEach((a, i) => {
    const owner = ownerOf[i];
    const program = programOf.get(owner);
    const role =
      owner === INCINERATOR
        ? ("burn" as const)
        : pools.has(owner) || pools.has(a.address) || POOL_AUTHORITIES.has(owner) || (program && solanaDex([program]))
          ? ("pool" as const)
          : null;
    const h = byOwner.get(owner) ?? { address: owner, amount: 0, role, label: labelOf("solana", owner, deposits) };
    h.amount += Number(a.amount) / 10 ** decimals;
    byOwner.set(owner, h);
  });
  return [...byOwner.values()];
}

export async function solanaTokenFacts(
  address: string,
  pairs: Pair[],
  deposits: Map<string, string>,
): Promise<Pick<TokenFacts, "contract" | "holders">> {
  const mint = await rpc<{ value: Account<Parsed<MintInfo>> }>("getAccountInfo", [address, { encoding: "jsonParsed" }]);
  const account = mint.value;
  const data = account && !Array.isArray(account.data) ? account.data.parsed : undefined;
  if (!account || !TOKEN_PROGRAMS.has(account.owner) || data?.type !== "mint" || !data.info)
    throw new TraceError("invalid", "That isn't a token's address.");
  const info = data.info;
  const decimals = info.decimals ?? 0;
  const supply = Number(info.supply ?? 0) / 10 ** decimals;
  const list = await holders(address, decimals, pairs, deposits).catch((err) => {
    // The public RPC turns getTokenLargestAccounts down for the busiest tokens now and then.
    console.warn("[rankr] trace: token holders unavailable:", (err as Error).message);
    return null;
  });
  return {
    contract: readMint(account.owner, info),
    holders: list ? { supply, count: null, list } : null,
  };
}
