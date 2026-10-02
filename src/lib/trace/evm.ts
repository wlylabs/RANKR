// EVM chains through Blockscout's API (api.blockscout.com/<chain id>/api/v2). Since July 2026 it needs a key,
// free at dev.blockscout.com (100K credits a day, 5 requests a second); without one the public explorers
// allow about 10 requests per 16 minutes, too few for a trail. One wallet costs four requests: the address,
// its transactions, its ERC-20 transfers and its internal transactions (the newest 50 of each).
import { firstFunding, labelFlows, summarize, type Leg } from "./flows";
import { labelOf } from "./labels";
import { TraceError } from "./errors";
import type { TraceChain } from "./chains";
import type { TraceLabel, TraceResponse } from "./types";

const api = () => (process.env.BLOCKSCOUT_API_URL ?? "https://api.blockscout.com").replace(/\/+$/, "");

/** An address as Blockscout writes it next to a transfer (AddressParam), with what it knows about it. */
export type AddressParam = {
  hash: string;
  name?: string | null;
  ens_domain_name?: string | null;
  implementation_name?: string | null;
  is_contract?: boolean;
  is_scam?: boolean;
  reputation?: string | null;
  metadata?: { tags?: { name?: string; slug?: string; tagType?: string }[] } | null;
  public_tags?: { display_name?: string; label?: string }[] | null;
};

export type Page<T> = { items: T[]; next_page_params: unknown | null };

type Tx = {
  hash: string;
  timestamp: string;
  status?: string | null;
  value: string;
  exchange_rate?: string | null;
  from: AddressParam;
  to: AddressParam | null;
};

type InternalTx = {
  transaction_hash: string;
  timestamp: string;
  value: string;
  success?: boolean | null;
  error?: string | null;
  from: AddressParam;
  to: AddressParam | null;
};

type TokenTransfer = {
  transaction_hash: string;
  timestamp: string;
  token_type?: string;
  from: AddressParam;
  to: AddressParam;
  total?: { value?: string | null; decimals?: string | null } | null;
  token?: {
    address_hash?: string;
    address?: string;
    symbol?: string | null;
    exchange_rate?: string | null;
    decimals?: string | null;
  } | null;
};

export type AddressInfo = AddressParam & {
  coin_balance?: string | null;
  exchange_rate?: string | null;
  token?: unknown | null;
};

/** One Blockscout API v2 request on `chain`; null for an address it has never seen (404). */
export async function blockscout<T>(chain: TraceChain, path: string): Promise<T | null> {
  const key = process.env.BLOCKSCOUT_API_KEY;
  if (!key)
    throw new TraceError(
      "nokey",
      "EVM wallets aren't switched on here yet: this site needs a (free) Blockscout API key.",
    );
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${api()}/${chain.chainId}/api/v2${path}`, {
        headers: { accept: "application/json", authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new TraceError("upstream", `Blockscout unreachable (${(err as Error).name})`);
    }
    // An address it has never seen.
    if (res.status === 404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new TraceError("upstream", `Blockscout responded ${res.status}`);
    return (await res.json()) as T;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** wei-like integer string over 10^decimals, as a float (precision past ~15 digits doesn't matter here). */
export function units(value: string | null | undefined, decimals: number): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const whole = value.length > decimals ? value.slice(0, value.length - decimals) : "0";
  const frac = value.padStart(decimals + 1, "0").slice(-decimals || undefined);
  return Number(`${whole}.${decimals ? frac.slice(0, 18) : "0"}`);
}

/** Exchanges' names, to tell an exchange's tag from any other in Blockscout's metadata. */
const EXCHANGES =
  /binance|coinbase|okx|kraken|bybit|kucoin|bitfinex|gate\.io|htx|huobi|mexc|bitget|crypto\.com|gemini|bitstamp|upbit|bithumb/i;
/** Contracts that are someone's wallet (a Safe, a smart account): followed like any wallet. */
const SMART_WALLET = /safe|wallet|account|multisig/i;

/** What Blockscout says about an address: a scam flag, an exchange tag, a contract's name, an ENS name. */
export function blockscoutLabel(p: AddressParam): TraceLabel | null {
  const source = "Blockscout";
  if (p.is_scam || p.reputation === "scam") return { kind: "scam", name: p.name || "Flagged as scam", source };
  const tags = [
    ...(p.metadata?.tags ?? []).map((t) => t.name),
    ...(p.public_tags ?? []).map((t) => t.display_name),
  ].filter((t): t is string => !!t);
  const exchange = tags.find((t) => EXCHANGES.test(t));
  if (exchange) return { kind: "cex", name: exchange, source };
  const name = tags[0] ?? p.name ?? p.implementation_name ?? p.ens_domain_name ?? null;
  if (p.is_contract) {
    if (/bridge|portal|gateway|spokepool/i.test(name ?? "")) return { kind: "bridge", name: name!, source };
    if (SMART_WALLET.test(`${p.name ?? ""} ${p.implementation_name ?? ""}`))
      return { kind: "named", name: name ?? "Smart wallet", source };
    return { kind: "contract", name: name ?? "Contract", source };
  }
  return name ? { kind: "named", name, source } : null;
}

const time = (iso: string) => Date.parse(iso) || 0;

/** A transfer between `wallet` and someone else, as a leg (null when it's neither in nor out). */
function leg(
  wallet: string,
  from: AddressParam,
  to: AddressParam | null,
  base: Omit<Leg, "dir" | "counterparty" | "label">,
): Leg | null {
  const w = wallet.toLowerCase();
  if (!to || !(base.amount > 0)) return null;
  const f = from.hash.toLowerCase();
  const t = to.hash.toLowerCase();
  if (f === t) return null;
  if (f === w) return { ...base, dir: "out", counterparty: to.hash, label: blockscoutLabel(to) };
  if (t === w) return { ...base, dir: "in", counterparty: from.hash, label: blockscoutLabel(from) };
  return null;
}

/** The legs in Blockscout's three lists, deduplicated (an internal transfer can repeat a transaction's value). */
export function evmLegs(
  wallet: string,
  chain: TraceChain,
  lists: { txs: Tx[]; internal: InternalTx[]; tokens: TokenTransfer[] },
  nativeUsd: number | null,
): Leg[] {
  const legs: Leg[] = [];
  const native = (value: string, rate?: string | null) => {
    const amount = units(value, 18);
    const unit = num(rate) ?? nativeUsd;
    return { asset: "native", symbol: chain.native, amount, usd: unit === null ? null : amount * unit, native: true };
  };
  for (const t of lists.txs) {
    if (t.status && t.status !== "ok") continue;
    const l = leg(wallet, t.from, t.to, { tx: t.hash, time: time(t.timestamp), ...native(t.value, t.exchange_rate) });
    if (l) legs.push(l);
  }
  for (const t of lists.internal) {
    if (t.success === false || t.error) continue;
    const l = leg(wallet, t.from, t.to, { tx: t.transaction_hash, time: time(t.timestamp), ...native(t.value) });
    // The call that carried the value is already in the transaction list.
    if (
      l &&
      !legs.some(
        (x) =>
          x.tx === l.tx &&
          x.dir === l.dir &&
          x.asset === "native" &&
          x.counterparty.toLowerCase() === l.counterparty.toLowerCase(),
      )
    ) {
      legs.push(l);
    }
  }
  for (const t of lists.tokens) {
    if (t.token_type && t.token_type !== "ERC-20") continue;
    const address = t.token?.address_hash ?? t.token?.address;
    if (!address) continue;
    const amount = units(t.total?.value, Number(t.total?.decimals ?? t.token?.decimals ?? 18));
    const rate = num(t.token?.exchange_rate);
    const l = leg(wallet, t.from, t.to, {
      tx: t.transaction_hash,
      time: time(t.timestamp),
      asset: address.toLowerCase(),
      symbol: t.token?.symbol || `${address.slice(0, 6)}…`,
      amount,
      usd: rate === null ? null : amount * rate,
      native: false,
    });
    if (l) legs.push(l);
  }
  return legs;
}

export async function traceEvm(chain: TraceChain, address: string): Promise<TraceResponse> {
  const path = `/addresses/${address}`;
  const [info, txs, internal, tokens] = await Promise.all([
    blockscout<AddressInfo>(chain, path),
    blockscout<Page<Tx>>(chain, `${path}/transactions`),
    blockscout<Page<InternalTx>>(chain, `${path}/internal-transactions`),
    blockscout<Page<TokenTransfer>>(chain, `${path}/token-transfers?type=ERC-20`),
  ]);
  if (info?.token) throw new TraceError("token", "That's a token, not a wallet.");

  const nativeUsd = num(info?.exchange_rate);
  const lists = { txs: txs?.items ?? [], internal: internal?.items ?? [], tokens: tokens?.items ?? [] };
  const legs = evmLegs(address, chain, lists, nativeUsd);
  const label = (a: string) => labelOf(chain.id, a);
  // The whole history is here when no list has another page: then its first transfer in is the funding.
  const complete = [txs, internal, tokens].every(
    (p) => !p || p.next_page_params === null || p.next_page_params === undefined,
  );
  const funder = complete ? firstFunding(legs) : null;

  const times = [...lists.txs, ...lists.internal, ...lists.tokens].map((t) => time(t.timestamp)).filter(Boolean);
  const balance = units(info?.coin_balance, 18);
  const own = info ? blockscoutLabel(info) : null;
  return {
    chain: chain.id,
    address,
    label: label(address) ?? (own?.kind === "contract" ? null : own),
    balance: info
      ? { symbol: chain.native, amount: balance, usd: nativeUsd === null ? null : balance * nativeUsd }
      : null,
    firstSeen: complete && times.length ? Math.min(...times) : null,
    funder: funder && labelFlows([funder], (a) => label(a) ?? funder.label)[0],
    ...summarize(legs, label),
    scanned: {
      txs: new Set(legs.map((l) => l.tx)).size,
      from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null,
      complete,
    },
    updatedAt: Date.now(),
  };
}
