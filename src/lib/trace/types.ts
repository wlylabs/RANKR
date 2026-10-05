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

/** The tokens a wallet holds now (EVM: the ERC-20s Blockscout puts a price on), beside its native balance. */
export type TraceHoldings = {
  /** Their total at today's prices. */
  usd: number;
  /** Biggest first, at most 3. */
  top: TraceAsset[];
  /** Priced tokens it holds, all told. */
  count: number;
  /** It holds more than one page of tokens (50): only those were counted. */
  partial: boolean;
};

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
  /**
   * Its tokens now: read for the wallet a trail starts at, on EVM chains, on a budget of its own
   * (BLOCKSCOUT_HOLDINGS_DAILY_CREDITS). Absent when not asked for (Solana, a wallet further down the trail);
   * null when it couldn't be read; "budget" when today's budget for it is spent.
   */
  holdings?: TraceHoldings | "budget" | null;
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
   * read halfway (what was read is all here); `quota`: Rankr's own budget for the RPC did (src/lib/budget.ts).
   */
  scanned: {
    txs: number;
    from: number | null;
    to: number | null;
    complete: boolean;
    skipped?: number;
    limited?: boolean;
    quota?: boolean;
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
  | "limit"
  | "quota"
  | "allowance";

// ---- A token's report: a contract address pasted on Trace opens this instead of a trail.

/**
 * How one check came out. bad: a warning sign. warn: worth a closer look. ok: nothing wrong there.
 * unknown: it couldn't be read (counts as worth a look: nothing read isn't nothing wrong).
 */
export type TokenCheckStatus = "bad" | "warn" | "ok" | "unknown";

/** The report's five areas: what the contract allows, the pool, who holds it, its launch and insiders, trading. */
export type TokenGroup = "contract" | "liquidity" | "holders" | "insiders" | "trading";

export type TokenCheck = {
  id: string;
  group: TokenGroup;
  status: TokenCheckStatus;
  /** A few words for the summary: "Can be frozen", "42% bundled at launch". */
  short: string;
  /** One line, plain words: "Freeze authority is on: any holder's tokens can be frozen". */
  text: string;
  /** Where it was read: "Solana RPC", "Blockscout", "Honeypot.is", "GeckoTerminal", "DexScreener". */
  source: string;
};

/** Something that wasn't read for an area (its launch too far back...): said, never counted in the verdict. */
export type TokenNote = { group: TokenGroup; text: string };

/** Its first trades: wallets that bought in the launch block (a bundle) and the few right after (snipers). */
export type TokenLaunch = {
  at: number | null;
  bundle: { wallets: number; pct: number };
  snipers: { wallets: number; pct: number };
  /** The deployer's own buy at launch, and what it holds now (null: not among the biggest holders). */
  dev: { boughtPct: number; holdsPct: number | null } | null;
};

/** Top holders first funded by the same wallet (or by the deployer): likely one owner behind several wallets. */
export type TokenCluster = {
  funder: string;
  label: TraceLabel | null;
  /** The deployer funded them, or is one of them. */
  deployer: boolean;
  pct: number;
  members: { address: string; pct: number }[];
};

/** The three levels: warning signs (a bad check), worth a closer look (a warn or unknown one), none read. */
export type TokenVerdict = "danger" | "check" | "clear";

export type TokenWindow = "5m" | "1h" | "6h" | "24h";

/** Buys and sells in one window: counts over every pool (DexScreener), wallets in the main pool (GeckoTerminal). */
export type TokenFlowWindow = {
  window: TokenWindow;
  buys: number;
  sells: number;
  buyers: number | null;
  sellers: number | null;
  volumeUsd: number | null;
};

/** One wallet's trades in the sample: what it bought and sold, in dollars at the time. */
export type TokenTrader = {
  address: string;
  label: TraceLabel | null;
  buyUsd: number;
  sellUsd: number;
  buys: number;
  sells: number;
  last: number;
};

/** The main pool's latest trades (GeckoTerminal: up to 300, within 24 hours), wallet by wallet. */
export type TokenTrades = {
  pool: string;
  count: number;
  from: number;
  to: number;
  buyUsd: number;
  sellUsd: number;
  wallets: number;
  /** Bought the most, net of what they sold; biggest first. */
  buyers: TokenTrader[];
  /** Sold the most, net of what they bought; biggest first. */
  sellers: TokenTrader[];
};

/** pool: a DEX pool or bonding curve. burn: a burn address. creator: who deployed the contract. */
export type TokenHolderRole = "pool" | "burn" | "creator";

export type TokenHolder = {
  address: string;
  /** Share of the supply, 0-100. */
  pct: number;
  role: TokenHolderRole | null;
  label: TraceLabel | null;
  /** Its cluster (index in the report's clusters), when it shares a funder with other top holders. */
  cluster?: number;
};

export type TokenHolders = {
  /** All holders, when the source counts them (Blockscout); Solana's RPC doesn't. */
  count: number | null;
  /** The biggest holders, biggest first (Solana's RPC gives the top 20 accounts). */
  top: TokenHolder[];
  /** The ten biggest wallets' share, not counting pools, burn addresses and exchanges. */
  top10Pct: number;
  /** In pools and bonding curves. */
  poolPct: number;
  /** Counted by another source, without the list (BSC: GeckoTerminal): its top 10 may count pools in. */
  rough?: boolean;
  source?: string;
};

export type TokenReport = {
  chain: string;
  address: string;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  /** The main pool (the most liquid), its DEX and when it opened. */
  pool: { address: string; dex: string; url: string; createdAt: number | null } | null;
  /** Pools the token trades in on this chain. */
  pools: number;
  verdict: TokenVerdict;
  /** Bad first, then warn, unknown, ok. */
  checks: TokenCheck[];
  flow: TokenFlowWindow[];
  trades: TokenTrades | null;
  holders: TokenHolders | null;
  launch: TokenLaunch | null;
  clusters: TokenCluster[];
  notes: TokenNote[];
  /** Who deployed it (EVM: Blockscout; Solana: whoever signed its first transaction), to follow its money. */
  creator: string | null;
  /** Upstreams whose usage budget ran out during the read: the parts they'd have read were skipped. */
  skipped: string[];
  updatedAt: number;
};
