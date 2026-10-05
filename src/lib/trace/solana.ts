// Solana over JSON-RPC: free public endpoints by default (no key, rate-limited), or any RPC you set in
// SOLANA_RPC_URL (Helius, QuickNode... free plans read more history, faster). One wallet costs one
// getAccountInfo, one to three getSignaturesForAddress pages and one getTransaction per transaction read.
//
// The public endpoint allows about 40 calls of one method per 10 seconds per IP, and a server on a shared host
// shares its IP with every other site there. So calls are paced, a 429 moves on to the next endpoint, and a
// read that runs out of quota halfway returns what it has (scanned.limited) rather than nothing.
import { fetchSnapshots } from "../dexscreener";
import { tokenId } from "../address";
import { firstFunding, labelFlows, summarize, type Leg } from "./flows";
import { labelOf, solanaBridge, solanaDeposits, solanaDex } from "./labels";
import { resetOf, solanaCredits, take } from "../budget";
import { untilReset } from "../rate-limit";
import { TraceError } from "./errors";
import { ownKeys, solanaRpcUrls } from "./keys";
import type { TraceResponse } from "./types";

/** Free, keyless: Solana's own, then PublicNode's (Allnodes), taken in turn when one says 429. */
const PUBLIC_RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
/**
 * SOLANA_RPC_URL: one RPC, or several separated by commas (tried in turn); an account on its own keys, its
 * Helius (keys.ts). Never the public ones for such an account: they're paced per server IP, shared with the site.
 */
const endpoints = () => {
  const own = solanaRpcUrls();
  if (own.length) return own;
  if (ownKeys()) throw new TraceError("nokey", "Add your own Helius API key (free) to trace Solana.");
  return PUBLIC_RPCS;
};
const custom = () => solanaRpcUrls().length > 0;
/** Its own RPC is set (SOLANA_RPC_URL, or the account's Helius): reads can go further. */
export const ownRpc = custom;

/** Transactions read per wallet, and at once. */
const txLimit = () => (custom() ? 80 : 20);
export const concurrency = () => (custom() ? 8 : 3);
/**
 * Calls per second per endpoint: under the public endpoint's 40 per method per 10 seconds, and Helius's free
 * 10 per second. SOLANA_RPC_RPS raises it for a paid plan.
 */
const rps = () => (ownKeys() ? 9 : Number(process.env.SOLANA_RPC_RPS) || (custom() ? 9 : 3.5));

/** Waits between retries (tests make them short). */
export const RPC_TIMING = { backoffMs: 700 };

const LAMPORTS = 1e9;
/** Below this, an account creation only pays rent. */
const RENT_FLOOR = 3_000_000;
export const WSOL = "So11111111111111111111111111111111111111112";
export const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const STABLES: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

/**
 * The newest transaction format this reader asks for. v1 (4,096-byte transactions) went live on mainnet on
 * Sep 15, 2026; asking for less makes getTransaction fail (-32015) on every v1 transaction. Its jsonParsed shape
 * is v0's plus a `transactionConfig`, which nothing here reads.
 */
export const MAX_TX_VERSION = 1;
/** The RPC's answer to a transaction in a newer format than asked for. */
const UNSUPPORTED_VERSION = -32015;

/** Every endpoint kept saying 429 (or 403, flagged): the free quota is used up for now. */
const BUSY = "Solana's RPC is busy right now (rate limit). Try again in a minute.";

/** An error the RPC answered with (not a rate limit, not the network): about this one call. */
class RpcError extends TraceError {
  constructor(
    readonly rpcCode: number | undefined,
    message: string,
  ) {
    super("upstream", message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** When each endpoint may be called next: calls queue up behind one another at its pace. */
const gates = new Map<string, number>();
async function pace(url: string) {
  const now = Date.now();
  const at = Math.max(now, gates.get(url) ?? 0);
  gates.set(url, at + 1000 / rps());
  if (at > now) await sleep(at - now);
}

/**
 * One JSON-RPC call. A 429, 403 or 5xx moves on to the next endpoint; after a full round of them, a pause
 * (Retry-After when given). Three rounds and it gives up with "busy". Errors in the answer itself are RpcError.
 */
export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  // Your own RPC's credits: within the budget set for it (SOLANA_RPC_MONTHLY_CREDITS), or not at all.
  if (custom() && !(await take("solana", solanaCredits(method))))
    throw new TraceError(
      "quota",
      `The Solana RPC's budget is used up for now. It comes back in ${untilReset(resetOf("solana"))}.`,
    );
  const urls = endpoints();
  const tries = urls.length * 3;
  let unreachable = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = urls[attempt % urls.length];
    const roundEnd = (attempt + 1) % urls.length === 0;
    await pace(url);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      unreachable++;
      if (roundEnd) await sleep(RPC_TIMING.backoffMs);
      continue;
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      if (roundEnd) {
        const after = Number(res.headers.get("retry-after"));
        const round = Math.floor(attempt / urls.length);
        await sleep(
          Number.isFinite(after) && after > 0 ? Math.min(after, 5) * 1000 : RPC_TIMING.backoffMs * 2 ** round,
        );
      }
      continue;
    }
    const body = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
    if (body.error) {
      if (/rate|too many/i.test(body.error.message ?? "")) {
        if (roundEnd) await sleep(RPC_TIMING.backoffMs);
        continue;
      }
      throw new RpcError(body.error.code, `Solana RPC: ${body.error.message ?? "error"}`);
    }
    return body.result as T;
  }
  // Never the URL: a custom one carries its API key.
  if (unreachable === tries) throw new TraceError("upstream", "Couldn't reach Solana's RPC. Try again.");
  throw new TraceError("busy", BUSY);
}

/** Runs `fn` over `items`, `n` at a time, in order; once `stop()` says so, the rest aren't started. */
export async function mapLimit<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>,
  stop: () => boolean = () => false,
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length && !stop()) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// ---- jsonParsed transactions

type ParsedIx = {
  program?: string;
  programId?: string;
  parsed?: { type?: string; info?: Record<string, unknown> } | string;
};
export type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: { decimals?: number; amount?: string; uiAmountString?: string };
};
export type ParsedTx = {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    innerInstructions?: { index: number; instructions: ParsedIx[] }[] | null;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: ({ pubkey: string } | string)[]; instructions: ParsedIx[] };
  };
};

/** A leg before it has a price: amounts in the asset's units, the asset "native" or a mint. */
export type RawLeg = Omit<Leg, "usd" | "symbol"> & { symbol?: string };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * The SOL and token transfers in or out of `wallet` in one transaction, and the programs it called. Reads
 * system transfers (and account creations, which move SOL) and SPL token transfers, outer and inner; a token
 * account is followed to its owner. Wrapped SOL counts as SOL.
 */
export function parseTransaction(tx: ParsedTx, wallet: string): { legs: RawLeg[]; programs: Set<string> } {
  const sig = tx.transaction.signatures[0];
  const time = (tx.blockTime ?? 0) * 1000;
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const meta = tx.meta ?? {};

  // Token account -> its owner, mint and decimals.
  const accounts = new Map<string, { owner: string | null; mint: string; decimals: number }>();
  for (const b of [...(meta.preTokenBalances ?? []), ...(meta.postTokenBalances ?? [])]) {
    const address = keys[b.accountIndex];
    if (address)
      accounts.set(address, { owner: b.owner ?? null, mint: b.mint, decimals: b.uiTokenAmount?.decimals ?? 0 });
  }

  const ixs = [
    ...tx.transaction.message.instructions,
    ...(meta.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];
  const programs = new Set(ixs.map((ix) => ix.programId).filter((p): p is string => !!p));
  const legs: RawLeg[] = [];
  const push = (from: string | null, to: string | null, asset: string, amount: number) => {
    if (!from || !to || from === to || !(amount > 0)) return;
    const native = asset === "native";
    if (from === wallet) legs.push({ tx: sig, time, dir: "out", counterparty: to, asset, amount, native });
    else if (to === wallet) legs.push({ tx: sig, time, dir: "in", counterparty: from, asset, amount, native });
  };

  for (const ix of ixs) {
    if (typeof ix.parsed !== "object" || !ix.parsed?.info) continue;
    const { type, info } = ix.parsed;
    if (ix.program === "system") {
      const lamports = Number(info.lamports);
      if (type === "transfer" || type === "transferWithSeed")
        push(str(info.source), str(info.destination), "native", lamports / LAMPORTS);
      // Creating an account moves SOL too; a token account's rent (~0.002 SOL) isn't money going anywhere.
      else if ((type === "createAccount" || type === "createAccountWithSeed") && lamports >= RENT_FLOOR) {
        push(str(info.source), str(info.newAccount), "native", lamports / LAMPORTS);
      }
    } else if (ix.program === "spl-token" && (type === "transfer" || type === "transferChecked")) {
      const source = str(info.source);
      const destination = str(info.destination);
      const src = source ? accounts.get(source) : undefined;
      const dst = destination ? accounts.get(destination) : undefined;
      const mint = str(info.mint) ?? src?.mint ?? dst?.mint;
      if (!mint) continue;
      const checked = info.tokenAmount as { uiAmountString?: string } | undefined;
      const decimals = src?.decimals ?? dst?.decimals ?? 0;
      const amount =
        checked?.uiAmountString !== undefined ? Number(checked.uiAmountString) : Number(info.amount) / 10 ** decimals;
      const from = src?.owner ?? str(info.authority) ?? str(info.multisigAuthority) ?? source;
      const to = dst?.owner ?? destination;
      push(from, to, mint === WSOL ? "native" : mint, amount);
    }
  }
  return { legs, programs };
}

/**
 * A transaction's legs as the trail reads them. Through a bridge, the bridge is the counterparty (whoever holds
 * the money in between). On a DEX, a trade the wallet made is a swap; someone else's trade that pays the
 * wallet (Jupiter's swap and send) is a payment from whoever signed it, not from the pool.
 */
export function walletLegs(tx: ParsedTx, wallet: string): { legs: RawLeg[]; swap: boolean } {
  const { legs, programs } = parseTransaction(tx, wallet);
  const bridge = solanaBridge(programs);
  if (bridge) return { legs: legs.map((l) => ({ ...l, counterparty: bridge[0] })), swap: false };
  if (!solanaDex(programs)) return { legs, swap: false };
  const first = tx.transaction.message.accountKeys[0];
  const payer = typeof first === "string" ? first : first?.pubkey;
  if (payer && payer !== wallet && legs.length && legs.every((l) => l.dir === "in")) {
    return { legs: legs.map((l) => ({ ...l, counterparty: payer })), swap: false };
  }
  return { legs, swap: true };
}

// ---- Prices

/** USD per unit for SOL and the mints in `legs`: stables at $1, the rest from DexScreener (30 at most). */
async function prices(legs: RawLeg[]): Promise<{ usd: Map<string, number>; symbols: Map<string, string> }> {
  const usd = new Map<string, number>();
  const symbols = new Map<string, string>([["native", "SOL"]]);
  for (const [mint, symbol] of Object.entries(STABLES)) {
    usd.set(mint, 1);
    symbols.set(mint, symbol);
  }
  // The mints that move most often first: the ones the trail is made of.
  const counts = new Map<string, number>();
  for (const l of legs) if (!l.native && !STABLES[l.asset]) counts.set(l.asset, (counts.get(l.asset) ?? 0) + 1);
  const mints = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 29)
    .map(([m]) => m);
  const snaps = await fetchSnapshots([WSOL, ...mints].map((address) => ({ chainId: "solana", address })));
  const sol = snaps.get(tokenId("solana", WSOL));
  if (sol?.priceUsd) usd.set("native", sol.priceUsd);
  for (const m of mints) {
    const s = snaps.get(tokenId("solana", m));
    if (s?.priceUsd) usd.set(m, s.priceUsd);
    if (s?.symbol) symbols.set(m, s.symbol);
  }
  return { usd, symbols };
}

function priced(legs: RawLeg[], p: { usd: Map<string, number>; symbols: Map<string, string> }): Leg[] {
  return legs.map((l) => {
    const unit = p.usd.get(l.asset);
    return {
      ...l,
      symbol: p.symbols.get(l.asset) ?? `${l.asset.slice(0, 4)}…`,
      usd: unit === undefined ? null : l.amount * unit,
    };
  });
}

// ---- A wallet

export type Signature = { signature: string; err: unknown; slot?: number; blockTime?: number | null };

/** The wallet's signatures, newest first, up to 3 pages (3,000): its whole history unless it's busier than that. */
async function signatures(address: string): Promise<{ sigs: Signature[]; complete: boolean }> {
  const sigs: Signature[] = [];
  for (let page = 0; page < 3; page++) {
    const before = sigs.at(-1)?.signature;
    const batch = await rpc<Signature[]>("getSignaturesForAddress", [
      address,
      { limit: 1000, ...(before && { before }) },
    ]);
    sigs.push(...batch);
    if (batch.length < 1000) return { sigs, complete: true };
  }
  return { sigs, complete: false };
}

/**
 * Transactions already read, by signature. A transfer is in both wallets' histories, so opening the next wallet
 * down reads it again: from here, not the RPC. A confirmed transaction never changes.
 */
const txCache = new Map<string, ParsedTx>();
const TX_CACHE_MAX = 5000;

/**
 * One transaction, jsonParsed; null when the RPC can't give it (it's counted as skipped, and the trail goes on
 * without it). A format newer than MAX_TX_VERSION is asked for again in the version the RPC names: jsonParsed
 * reads every version alike. "busy" (rate-limited for good) is thrown to the caller, which stops reading.
 */
export async function getTx(signature: string): Promise<ParsedTx | null> {
  const cached = txCache.get(signature);
  if (cached) return cached;
  let version = MAX_TX_VERSION;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tx = await rpc<ParsedTx | null>("getTransaction", [
        signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: version, commitment: "confirmed" },
      ]);
      if (tx) {
        if (txCache.size >= TX_CACHE_MAX) txCache.delete(txCache.keys().next().value!);
        txCache.set(signature, tx);
      }
      return tx;
    } catch (err) {
      if (!(err instanceof RpcError)) throw err;
      const asked = Number(/maxSupportedTransactionVersion\W+(\d+)/.exec(err.message)?.[1]);
      if (err.rpcCode === UNSUPPORTED_VERSION && asked > version) {
        console.warn(`[rankr] trace: Solana transaction version ${asked} is newer than MAX_TX_VERSION`);
        version = asked;
        continue;
      }
      console.warn(`[rankr] trace: skipped a transaction: ${err.message}`);
      return null;
    }
  }
  return null;
}

/**
 * Who sent a wallet its first SOL, when its whole history is in reach (up to 3,000 transactions): its newest
 * signatures, then its three oldest transactions. Null for a busier wallet, or one first paid in a trade.
 */
export async function solanaFunder(address: string): Promise<string | null> {
  const history = await signatures(address);
  if (!history.complete) return null;
  const oldest = history.sigs.filter((s) => !s.err).slice(-3);
  const txs = await mapLimit(oldest, concurrency(), (s) => getTx(s.signature));
  const legs = txs
    .filter((tx): tx is ParsedTx => !!tx && !tx.meta?.err)
    .flatMap((tx) => {
      const r = walletLegs(tx, address);
      return r.swap ? [] : r.legs.map((l) => ({ ...l, symbol: l.symbol ?? "", usd: null }));
    });
  return firstFunding(legs)?.address ?? null;
}

export async function traceSolana(address: string): Promise<TraceResponse> {
  // The account first: a token's address (pasted on Trace, it opens the token's report) costs one call, not its
  // whole busy history.
  const deposits = solanaDeposits();
  const account = await rpc<{ value: { lamports: number; owner: string; executable: boolean; data: unknown } | null }>(
    "getAccountInfo",
    [address, { encoding: "jsonParsed" }],
  );
  const info = account.value;
  if (info?.executable) throw new TraceError("program", "That's a program, not a wallet.");
  const parsedType = (info?.data as { parsed?: { type?: string } } | undefined)?.parsed?.type;
  if (info && TOKEN_PROGRAMS.has(info.owner) && parsedType === "mint")
    throw new TraceError("token", "That's a token, not a wallet.");
  const history = await signatures(address);

  const ok = history.sigs.filter((s) => !s.err);
  const recent = ok.slice(0, txLimit());
  // Its first transactions, for who funded it: read too when the history is in reach and they aren't recent.
  const oldest = history.complete ? ok.slice(-3).filter((s) => !recent.includes(s)) : [];
  // Rate-limited for good halfway, or out of budget: stop asking, and draw what was read.
  const progress: { limited: boolean; stop: TraceError | null } = { limited: false, stop: null };
  const txs = await mapLimit(
    [...recent, ...oldest],
    concurrency(),
    (s) =>
      getTx(s.signature).catch((err) => {
        if (err instanceof TraceError && (err.code === "busy" || err.code === "quota")) {
          progress.limited = true;
          progress.stop = err;
          return undefined;
        }
        throw err;
      }),
    () => progress.limited,
  );
  if (progress.limited && txs.every((tx) => !tx)) throw progress.stop ?? new TraceError("busy", BUSY);

  const read = txs
    .filter((tx): tx is ParsedTx => !!tx && !tx.meta?.err)
    .map((tx) => ({ tx, ...walletLegs(tx, address) }));
  const recentSigs = new Set(recent.map((s) => s.signature));
  const raw = read.filter((r) => recentSigs.has(r.tx.transaction.signatures[0])).flatMap((r) => r.legs);
  const swapTxs = new Set(read.filter((r) => r.swap).map((r) => r.tx.transaction.signatures[0]));
  // Its first money can't be a trade's proceeds: someone had to pay for the trade's fee first.
  const fundingLegs = read.filter((r) => !r.swap).flatMap((r) => r.legs);

  const [p, depositList] = await Promise.all([prices([...raw, ...fundingLegs]), deposits]);
  const legs = priced(raw, p);
  const label = (a: string) => labelOf("solana", a, depositList);
  const funder = history.complete ? firstFunding(priced(fundingLegs, p)) : null;

  const times = recent.map((s) => (s.blockTime ?? 0) * 1000).filter(Boolean);
  const firstSig = history.complete ? history.sigs.at(-1) : undefined;
  return {
    chain: "solana",
    address,
    label: label(address),
    balance: info
      ? {
          symbol: "SOL",
          amount: info.lamports / LAMPORTS,
          usd: p.usd.has("native") ? (info.lamports / LAMPORTS) * p.usd.get("native")! : null,
        }
      : null,
    firstSeen: firstSig?.blockTime ? firstSig.blockTime * 1000 : null,
    funder: funder && labelFlows([funder], label)[0],
    ...summarize(legs, label, (tx) => swapTxs.has(tx)),
    scanned: {
      // Cut short by the rate limit: only what was read counts.
      txs: progress.limited ? txs.slice(0, recent.length).filter((tx) => tx !== undefined).length : recent.length,
      from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null,
      complete: !progress.limited && history.complete && ok.length <= recent.length,
      skipped: txs.filter((tx) => tx === null).length,
      ...(progress.limited ? { limited: true } : {}),
      ...(progress.stop?.code === "quota" ? { quota: true } : {}),
    },
    updatedAt: Date.now(),
  };
}
