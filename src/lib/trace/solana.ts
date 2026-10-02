// Solana over JSON-RPC: the public endpoint by default (free, no key, rate-limited), or any RPC you set in
// SOLANA_RPC_URL (Helius, QuickNode... free plans read more history, faster). One wallet costs one
// getAccountInfo, one to three getSignaturesForAddress pages and one getTransaction per transaction read.
import { fetchSnapshots } from "../dexscreener";
import { tokenId } from "../address";
import { firstFunding, labelFlows, summarize, type Leg } from "./flows";
import { labelOf, solanaBridge, solanaDeposits, solanaDex } from "./labels";
import { TraceError } from "./errors";
import type { TraceResponse } from "./types";

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const rpcUrl = () => process.env.SOLANA_RPC_URL || PUBLIC_RPC;
const custom = () => !!process.env.SOLANA_RPC_URL;

/** Transactions read per wallet, and at once: the public RPC allows about 40 calls per 10 seconds. */
const txLimit = () => (custom() ? 80 : 30);
const concurrency = () => (custom() ? 8 : 3);

const LAMPORTS = 1e9;
/** Below this, an account creation only pays rent. */
const RENT_FLOOR = 3_000_000;
const WSOL = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const STABLES: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(rpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      if (attempt < 2) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      // Never the URL: a custom one carries its API key.
      throw new TraceError("upstream", `Solana RPC unreachable (${(err as Error).name})`);
    }
    const limited = res.status === 429 || res.status >= 500;
    if (limited) {
      if (attempt < 3) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 5) * 1000 : 700 * 2 ** attempt);
        continue;
      }
      throw new TraceError("upstream", `Solana RPC responded ${res.status}`);
    }
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) {
      if (attempt < 3 && /rate|too many/i.test(body.error.message ?? "")) {
        await sleep(700 * 2 ** attempt);
        continue;
      }
      throw new TraceError("upstream", `Solana RPC: ${body.error.message ?? "error"}`);
    }
    return body.result as T;
  }
}

/** Runs `fn` over `items`, `n` at a time, in order. */
async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
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
type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount?: { decimals?: number } };
export type ParsedTx = {
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

type Signature = { signature: string; err: unknown; blockTime?: number | null };

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

const getTx = (signature: string) =>
  rpc<ParsedTx | null>("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);

export async function traceSolana(address: string): Promise<TraceResponse> {
  const [account, history, deposits] = await Promise.all([
    rpc<{ value: { lamports: number; owner: string; executable: boolean; data: unknown } | null }>("getAccountInfo", [
      address,
      { encoding: "jsonParsed" },
    ]),
    signatures(address),
    solanaDeposits(),
  ]);
  const info = account.value;
  if (info?.executable) throw new TraceError("program", "That's a program, not a wallet.");
  const parsedType = (info?.data as { parsed?: { type?: string } } | undefined)?.parsed?.type;
  if (info && TOKEN_PROGRAMS.has(info.owner) && parsedType === "mint")
    throw new TraceError("token", "That's a token, not a wallet.");

  const ok = history.sigs.filter((s) => !s.err);
  const recent = ok.slice(0, txLimit());
  // Its first transactions, for who funded it: read too when the history is in reach and they aren't recent.
  const oldest = history.complete ? ok.slice(-3).filter((s) => !recent.includes(s)) : [];
  const txs = await mapLimit([...recent, ...oldest], concurrency(), (s) => getTx(s.signature));

  const read = txs
    .filter((tx): tx is ParsedTx => !!tx && !tx.meta?.err)
    .map((tx) => ({ tx, ...walletLegs(tx, address) }));
  const recentSigs = new Set(recent.map((s) => s.signature));
  const raw = read.filter((r) => recentSigs.has(r.tx.transaction.signatures[0])).flatMap((r) => r.legs);
  const swapTxs = new Set(read.filter((r) => r.swap).map((r) => r.tx.transaction.signatures[0]));
  // Its first money can't be a trade's proceeds: someone had to pay for the trade's fee first.
  const fundingLegs = read.filter((r) => !r.swap).flatMap((r) => r.legs);

  const p = await prices([...raw, ...fundingLegs]);
  const legs = priced(raw, p);
  const label = (a: string) => labelOf("solana", a, deposits);
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
      txs: recent.length,
      from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null,
      complete: history.complete && ok.length <= recent.length,
    },
    updatedAt: Date.now(),
  };
}
