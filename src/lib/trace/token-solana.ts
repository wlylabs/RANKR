// A Solana token over the same RPC as wallets (solana.ts): the mint account (its authorities and Token-2022
// extensions), its Metaplex metadata (can its name still change), the 20 biggest token accounts and who owns
// them, the main pool's LP tokens (burned, locked or in a wallet), its first trades (bundles and snipers), and who
// first funded the biggest holders (clusters). Each part is read on its own: one that fails is left out, the rest
// stays. About 20 to 60 calls, paced like a wallet's.
import type { Pair } from "../dexscreener";
import { TraceError } from "./errors";
import { labelOf, solanaDex } from "./labels";
import {
  concurrency,
  getTx,
  mapLimit,
  ownRpc,
  parseTransaction,
  rpc,
  solanaFunder,
  TOKEN_PROGRAMS,
  type ParsedTx,
  type Signature,
} from "./solana";
import { METADATA_PROGRAM, base58Encode, metadataAddress, readMetadata } from "./solana-pda";
import { SNIPER_BLOCKS, type LaunchBuy, type LaunchFacts, type RawHolder, type SolanaContract, type TokenFacts } from "./token-assess";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SYSTEM = "11111111111111111111111111111111";
/** Where tokens are sent to be burned for good. */
const INCINERATOR = "1nc1nerator11111111111111111111111111111111";
/**
 * Pools whose vaults are owned by an authority with no account of its own (so no program to tell it by): Raydium's
 * AMM v4 authority and its CPMM vault authority (the program addresses of "amm authority" and
 * "vault_and_lp_mint_auth_seed"; solana-pda.test.ts derives both).
 */
const RAYDIUM_V4_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const RAYDIUM_CPMM_AUTHORITY = "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL";
const POOL_AUTHORITIES = new Set([RAYDIUM_V4_AUTHORITY, RAYDIUM_CPMM_AUTHORITY]);
/**
 * Launchpads that keep the metadata of every token they launch (pump.fun's authority): changeable by the
 * launchpad, not by the token's deployer.
 */
const LAUNCHPAD_AUTHORITIES = new Set(["TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM"]);

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
const parsedOf = <I>(a: Account<Parsed<I>>) => (a && !Array.isArray(a.data) ? a.data.parsed : undefined);

/** The mint account as the report reads it: who can mint and freeze, and what Token-2022 adds. */
export function readMint(program: string, info: MintInfo): SolanaContract {
  const ext = (name: string) => info.extensions?.find((e) => e.extension === name);
  const fee = ext("transferFeeConfig")?.state;
  const bps = (key: string) =>
    Number((fee?.[key] as { transferFeeBasisPoints?: number } | undefined)?.transferFeeBasisPoints) || 0;
  const feeBps = fee ? Math.max(bps("olderTransferFee"), bps("newerTransferFee")) : 0;
  const pausable = ext("pausableConfig")?.state;
  const metadata = ext("tokenMetadata")?.state;
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
    // Token-2022 keeps metadata in the mint itself: changeable while it has an update authority.
    ...(metadata && { mutableMetadata: mutableBy(str(metadata.updateAuthority)) }),
  };
}

/** Changeable by its deployer: an update authority, and not a launchpad's. */
const mutableBy = (authority: string | null) => !!authority && !LAUNCHPAD_AUTHORITIES.has(authority);

/** Whether an SPL token's Metaplex metadata can still be changed; null when it has none to read. */
async function metadataMutable(mint: string): Promise<boolean | null> {
  const res = await rpc<{ value: { owner: string; data: [string, string] } | null }>("getAccountInfo", [
    metadataAddress(mint),
    { encoding: "base64" },
  ]);
  if (!res.value || res.value.owner !== METADATA_PROGRAM) return null;
  const meta = readMetadata(new Uint8Array(Buffer.from(res.value.data[0], "base64")), mint);
  return meta ? meta.mutable && mutableBy(meta.updateAuthority) : null;
}

/** Token accounts -> their owners, and what program owns each owner (a pool's, a locker's, or none: a wallet). */
async function ownersOf(accounts: string[]): Promise<{ owners: string[]; programOf: Map<string, string | null> }> {
  const parsed = await rpc<{ value: Account<Parsed<{ owner?: string }>>[] }>("getMultipleAccounts", [
    accounts,
    { encoding: "jsonParsed" },
  ]);
  const owners = accounts.map((a, i) => str(parsedOf(parsed.value?.[i] ?? null)?.info?.owner) ?? a);
  const unique = [...new Set(owners)];
  const programs = await rpc<{ value: Account<unknown>[] }>("getMultipleAccounts", [
    unique,
    { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
  ]);
  return { owners, programOf: new Map(unique.map((o, i) => [o, programs.value?.[i]?.owner ?? null])) };
}

type Largest = { value: { address: string; amount: string }[] };

/** The biggest holders, by wallet (a token account followed to its owner), with what each owner is. */
async function holders(
  mint: string,
  decimals: number,
  pairs: Pair[],
  deposits: Map<string, string>,
): Promise<RawHolder[]> {
  const largest = await rpc<Largest>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
  const accounts = largest.value ?? [];
  if (!accounts.length) return [];
  const { owners, programOf } = await ownersOf(accounts.map((a) => a.address));
  const pools = new Set(pairs.map((p) => p.pairAddress));

  const byOwner = new Map<string, RawHolder>();
  accounts.forEach((a, i) => {
    const owner = owners[i];
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

// ---- The main pool's LP tokens

/**
 * Where each pool program keeps its two mints and its LP mint in a pool account, and who mints the LP. The read
 * is only trusted when the pool's mints include this token and the LP mint is minted by that authority (or, for
 * PumpSwap, is a mint of its own): a wrong offset reads neither.
 * Raydium AMM v4: coin and pc mints at 400 and 432, LP mint at 464. Raydium CPMM: token 0 and 1 mints at 168 and
 * 200, LP mint at 136. PumpSwap: base and quote mints at 43 and 75, LP mint at 107.
 */
const LP_LAYOUTS: Record<string, { mints: [number, number]; lp: number; authority?: string }> = {
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { mints: [400, 432], lp: 464, authority: RAYDIUM_V4_AUTHORITY },
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: { mints: [168, 200], lp: 136, authority: RAYDIUM_CPMM_AUTHORITY },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: { mints: [43, 75], lp: 107 },
};

/** Its LP mint, read from the pool account; null when the pool isn't one this reads, or the read doesn't check out. */
export function lpMintOf(program: string, data: Uint8Array, token: string): string | null {
  const layout = LP_LAYOUTS[program];
  if (!layout || data.length < layout.lp + 32) return null;
  const key = (at: number) => base58Encode(data.slice(at, at + 32));
  const mints = layout.mints.map(key);
  if (!mints.includes(token)) return null;
  const lp = key(layout.lp);
  return mints.includes(lp) ? null : lp;
}

/**
 * Shares of the main pool's LP burned and locked; undefined when it has no LP token to check, or the read doesn't
 * check out (a note then, not a check: the layouts are read by offset).
 */
async function solanaLp(pool: Pair, token: string): Promise<TokenFacts["lp"]> {
  if (/pump/i.test(pool.dexId) && !/swap/i.test(pool.dexId)) return undefined; // a bonding curve
  const account = await rpc<{ value: { owner: string; data: [string, string] } | null }>("getAccountInfo", [
    pool.pairAddress,
    { encoding: "base64" },
  ]);
  if (!account.value) return undefined;
  const layout = LP_LAYOUTS[account.value.owner];
  if (!layout) return undefined; // concentrated pools (Orca, Meteora DLMM): positions, not LP tokens
  const lpMint = lpMintOf(account.value.owner, new Uint8Array(Buffer.from(account.value.data[0], "base64")), token);
  if (!lpMint) return undefined;
  const mint = await rpc<{ value: Account<Parsed<MintInfo>> }>("getAccountInfo", [lpMint, { encoding: "jsonParsed" }]);
  const parsed = parsedOf(mint.value);
  if (!mint.value || !TOKEN_PROGRAMS.has(mint.value.owner) || parsed?.type !== "mint" || !parsed.info) return undefined;
  if (layout.authority && parsed.info.mintAuthority !== layout.authority) return undefined;
  const supply = Number(parsed.info.supply ?? 0);
  // Every LP token burned.
  if (!(supply > 0)) return { burnedPct: 100, lockedPct: 0 };

  const largest = await rpc<Largest>("getTokenLargestAccounts", [lpMint, { commitment: "confirmed" }]);
  const accounts = (largest.value ?? []).filter((a) => Number(a.amount) > 0);
  if (!accounts.length) return { burnedPct: 100, lockedPct: 0 };
  const { owners, programOf } = await ownersOf(accounts.map((a) => a.address));
  let burned = 0;
  let locked = 0;
  accounts.forEach((a, i) => {
    const share = (Number(a.amount) / supply) * 100;
    const program = programOf.get(owners[i]);
    if (owners[i] === INCINERATOR) burned += share;
    // Held by a program (a locker, or the pool itself), not by someone's wallet.
    else if (program && program !== SYSTEM) locked += share;
  });
  return { burnedPct: burned, lockedPct: locked };
}

// ---- Its launch: the first trades, wallet by wallet

/** Signature pages read to reach a token's first transaction (1,000 each). */
const LAUNCH_PAGES = () => (ownRpc() ? 10 : 3);
/** Its first transactions read, to find the launch and the buys around it. */
const LAUNCH_READS = () => (ownRpc() ? 40 : 20);

/** Every wallet's change in `mint` over one transaction, in tokens (token accounts followed to their owners). */
export function tokenDeltas(tx: ParsedTx, mint: string, decimals: number): Map<string, number> {
  const out = new Map<string, number>();
  const amount = (b: { uiTokenAmount?: { amount?: string } }) => Number(b.uiTokenAmount?.amount ?? 0) / 10 ** decimals;
  const add = (owner: string | undefined, n: number) => owner && out.set(owner, (out.get(owner) ?? 0) + n);
  for (const b of tx.meta?.preTokenBalances ?? []) if (b.mint === mint) add(b.owner, -amount(b));
  for (const b of tx.meta?.postTokenBalances ?? []) if (b.mint === mint) add(b.owner, amount(b));
  return out;
}

const payerOf = (tx: ParsedTx) => {
  const first = tx.transaction.message.accountKeys[0];
  return typeof first === "string" ? first : (first?.pubkey ?? null);
};

/**
 * The launch from the token's first transactions: whoever signed the first is its deployer; the launch is the
 * first one that trades (calls a DEX: pump.fun's create and first buy, a Raydium pool opening). Buys in that slot
 * are a bundle, buys in the next few are snipers. A wallet gaining more than half the supply is a pool or the
 * curve being filled, not a buyer.
 */
export function readLaunch(
  txs: { tx: ParsedTx; slot: number; time: number | null }[],
  mint: string,
  decimals: number,
  supply: number,
  isPool: (owner: string) => boolean,
): Extract<LaunchFacts, { reached: true }> {
  const creator = txs[0] ? payerOf(txs[0].tx) : null;
  const start = txs.find((t) => !t.tx.meta?.err && solanaDex(parseTransaction(t.tx, "").programs));
  if (!start) return { reached: true, at: null, buys: [], creator };
  const buys: LaunchBuy[] = [];
  for (const t of txs) {
    if (t.slot < start.slot || t.slot > start.slot + SNIPER_BLOCKS || t.tx.meta?.err) continue;
    if (!solanaDex(parseTransaction(t.tx, "").programs)) continue;
    for (const [wallet, delta] of tokenDeltas(t.tx, mint, decimals)) {
      if (delta <= 0 || isPool(wallet) || delta > supply / 2) continue;
      buys.push({ wallet, amount: delta, phase: t.slot === start.slot ? "bundle" : "sniper" });
    }
  }
  return { reached: true, at: start.time, buys, creator };
}

async function solanaLaunch(mint: string, decimals: number, supply: number, pairs: Pair[]): Promise<LaunchFacts> {
  const sigs: Signature[] = [];
  let reached = false;
  for (let page = 0; page < LAUNCH_PAGES(); page++) {
    const before = sigs.at(-1)?.signature;
    const batch = await rpc<Signature[]>("getSignaturesForAddress", [mint, { limit: 1000, ...(before && { before }) }]);
    sigs.push(...batch);
    if (batch.length < 1000) {
      reached = true;
      break;
    }
  }
  if (!reached) return { reached: false };
  const first = sigs.filter((s) => !s.err).reverse().slice(0, LAUNCH_READS());
  const read = await mapLimit(first, concurrency(), (s) => getTx(s.signature).catch(() => null));
  const txs = first
    .map((s, i) => ({ tx: read[i], slot: read[i]?.slot ?? s.slot ?? 0, time: s.blockTime ? s.blockTime * 1000 : null }))
    .filter((t): t is { tx: ParsedTx; slot: number; time: number | null } => !!t.tx);
  const pools = new Set(pairs.map((p) => p.pairAddress));
  return readLaunch(txs, mint, decimals, supply, (o) => pools.has(o) || POOL_AUTHORITIES.has(o));
}

// ---- Who funded the biggest holders

/** Holders whose funder is read: the biggest wallets (pools, burns and exchanges aside). */
const FUNDED = () => (ownRpc() ? 10 : 6);

async function links(list: RawHolder[], supply: number): Promise<TokenFacts["links"]> {
  const wallets = list
    .filter((h) => !h.role && h.label?.kind !== "cex" && h.label?.kind !== "dex" && h.amount / supply >= 0.003)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, FUNDED());
  if (!wallets.length) return [];
  const funders = await mapLimit(wallets, 2, (h) => solanaFunder(h.address).catch(() => undefined));
  // Nothing read at all (the RPC was busy throughout): not read, rather than "funded separately".
  if (funders.every((f) => f === undefined)) return null;
  return wallets.map((h, i) => ({ holder: h.address, funder: funders[i] ?? null }));
}

const quiet = <T>(what: string, p: Promise<T>): Promise<T | null> =>
  p.catch((err) => {
    console.warn(`[rankr] trace: token ${what} unavailable:`, (err as Error).message);
    return null;
  });

export async function solanaTokenFacts(
  address: string,
  pairs: Pair[],
  deposits: Map<string, string>,
): Promise<Pick<TokenFacts, "contract" | "holders" | "supply" | "lp" | "launch" | "links">> {
  const mint = await rpc<{ value: Account<Parsed<MintInfo>> }>("getAccountInfo", [address, { encoding: "jsonParsed" }]);
  const account = mint.value;
  const data = parsedOf(account);
  if (!account || !TOKEN_PROGRAMS.has(account.owner) || data?.type !== "mint" || !data.info)
    throw new TraceError("invalid", "That isn't a token's address.");
  const info = data.info;
  const decimals = info.decimals ?? 0;
  const supply = Number(info.supply ?? 0) / 10 ** decimals;
  const contract = readMint(account.owner, info);

  // The public RPC turns getTokenLargestAccounts down for the busiest tokens now and then.
  const list = quiet("holders", holders(address, decimals, pairs, deposits));
  const [held, mutable, lp, launch, linked] = await Promise.all([
    list,
    contract.mutableMetadata === undefined ? quiet("metadata", metadataMutable(address)) : contract.mutableMetadata,
    pairs[0] ? solanaLp(pairs[0], address).catch(() => undefined) : undefined,
    quiet("launch", solanaLaunch(address, decimals, supply, pairs)),
    list.then((l) => (l ? quiet("funders", links(l, supply)) : null)),
  ]);
  return {
    contract: { ...contract, mutableMetadata: mutable },
    holders: held ? { supply, count: null, list: held } : null,
    supply,
    lp,
    launch,
    links: linked,
  };
}
