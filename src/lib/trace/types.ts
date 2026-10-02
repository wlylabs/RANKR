// The trace page (Trace in the nav): paste a wallet, see where its money came from and where it went, hop by
// hop, top to bottom. One request reads one wallet; the page asks again for every wallet you open.

/**
 * What a public list says an address is. Ends of the trail: an exchange (cex), a bridge, a mixer, a swap or
 * any other contract. Wallets worth following: sanctioned, hack (a named exploiter), scam, frozen (its USDT /
 * USDC frozen by Tether or Circle), named (a name it goes by, like an ENS name, and nothing more).
 */
export type TraceLabelKind =
  | "cex"
  | "bridge"
  | "mixer"
  | "dex"
  | "contract"
  | "sanctioned"
  | "hack"
  | "scam"
  | "frozen"
  | "named";

export type TraceLabel = {
  kind: TraceLabelKind;
  /** "Binance", "Tornado Cash", "OFAC sanctioned", "Jupiter". */
  name: string;
  /** Where the label comes from, shown next to it: a label is a claim, so it carries its source. */
  source: string;
};

/** An amount of one asset; usd at today's price (null when it has none we trust). */
export type TraceAsset = { symbol: string; amount: number; usd: number | null };

/** Everything that moved between the wallet and one counterparty, in one direction. */
export type TraceFlow = {
  address: string;
  label: TraceLabel | null;
  /** An end of the trail (an exchange, a bridge, a contract): drawn without an open button. */
  terminal: boolean;
  /** Total at today's prices; null when none of it has a price. */
  usd: number | null;
  /** Biggest first, at most 3. */
  assets: TraceAsset[];
  txs: number;
  /** First and last transfer, ms. */
  first: number;
  last: number;
  /** The latest transaction (signature or hash), for the explorer link. */
  tx: string;
};

/** One wallet, read: who it is, who funded it, its biggest counterparties each way. */
export type TraceResponse = {
  chain: string;
  address: string;
  label: TraceLabel | null;
  /** Native balance now. */
  balance: TraceAsset | null;
  /** Its first transaction, when the whole history was in reach. */
  firstSeen: number | null;
  /** Where its first money came from (the first incoming native transfer). */
  funder: TraceFlow | null;
  /** Biggest first, at most TOP_FLOWS each. */
  inflows: TraceFlow[];
  outflows: TraceFlow[];
  /** Counterparties not listed (beyond TOP_FLOWS, or under the minimum). */
  more: { in: number; out: number };
  /** Trades (one asset out, another in, in one transaction), summed instead of drawn. */
  swaps: { txs: number; usd: number | null } | null;
  /**
   * How much history this read: the newest `txs` transactions, from `from` to `to`; complete if that's all.
   * `skipped`: transactions the chain wouldn't return, left out. `limited`: the RPC's rate limit stopped the
   * read halfway (what was read is all here).
   */
  scanned: {
    txs: number;
    from: number | null;
    to: number | null;
    complete: boolean;
    skipped?: number;
    limited?: boolean;
  };
  updatedAt: number;
};

/** Why a wallet can't be traced. `token`: it's a token's address (open its page instead). */
export type TraceErrorCode =
  | "token"
  | "program"
  | "unsupported"
  | "invalid"
  | "upstream"
  | "busy"
  | "nokey"
  | "limit";
