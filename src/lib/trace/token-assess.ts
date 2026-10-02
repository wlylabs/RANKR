// A token's report from what was read about it: where buys and sells come from, who holds it, what its contract
// allows, how it launched, and the checks that make the verdict. Pure: the readers (token-solana.ts, token-evm.ts,
// gecko.ts, honeypot.ts) fill TokenFacts, the mock makes up some, and both come out the same way here.
//
// Every check is a fact with its source, in plain words. The verdict only counts them: a warning sign (bad), worth
// a closer look (warn, or a check that couldn't be read), or none read. It's not an accusation, and none read isn't
// a promise. What a deeper read couldn't reach (a launch too far back) is a note: said, not counted.
//
// The lines follow what the common scanners and studies use: RugCheck, GoPlus and Token Sniffer for the contract
// and holders; Bubblemaps and GMGN for bundles, snipers and clusters; Mongardini & Mei (USENIX Security '26) for
// wash trading. See LIMITS.
import type { Pair } from "../dexscreener";
import type {
  TokenCheck,
  TokenCluster,
  TokenFlowWindow,
  TokenGroup,
  TokenHolderRole,
  TokenHolders,
  TokenLaunch,
  TokenNote,
  TokenReport,
  TokenTrader,
  TokenTrades,
  TokenVerdict,
  TokenWindow,
  TraceLabel,
} from "./types";

/**
 * One trade in the main pool: a wallet buying or selling the token, in dollars at the time, and in tokens
 * (`amount`, when the source gives it).
 */
export type RawTrade = { wallet: string; side: "buy" | "sell"; usd: number; amount?: number; time: number; tx: string };

/** GeckoTerminal's counts for the main pool, with the wallets behind them. */
export type PoolWindows = Partial<
  Record<TokenWindow, { buys: number; sells: number; buyers: number; sellers: number }>
>;

/** A holder as read: its amount in tokens, merged by wallet. */
export type RawHolder = { address: string; amount: number; role: TokenHolderRole | null; label: TraceLabel | null };

export type SolanaContract = {
  kind: "solana";
  token2022: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Token-2022 transfer fee in basis points (the higher of this epoch's and the next's); null without one. */
  transferFeeBps: number | null;
  /** Who can change that fee. */
  feeAuthority: string | null;
  permanentDelegate: string | null;
  transferHook: string | null;
  nonTransferable: boolean;
  defaultFrozen: boolean;
  pausable: { paused: boolean } | null;
  /** Its name, symbol and logo can still be changed (Metaplex or Token-2022 metadata); null when unread. */
  mutableMetadata?: boolean | null;
};

/** What a token's owner can do, read from its verified ABI: functions by what they allow. */
export type OwnerPower = "mint" | "blacklist" | "pause" | "fees" | "limits";

export type EvmContract = {
  kind: "evm";
  /** Its source code is verified on the explorer; null when unknown. */
  verified: boolean | null;
  /** A proxy: its code can be swapped for other code. */
  proxy: boolean;
  /** Flagged as a scam by Blockscout. */
  scam: boolean;
  /**
   * A buy and a sell simulated (Honeypot.is). undefined: not offered on this chain. null: it couldn't run.
   * Taxes in percent.
   */
  sim?: {
    honeypot: boolean;
    reason: string | null;
    buyTax: number | null;
    sellTax: number | null;
    transferTax: number | null;
  } | null;
  /** Its owner() now: an address, "renounced" (zero or dead), "none" (no owner function); undefined: unread. */
  owner?: string | "renounced" | "none";
  /** Functions in its ABI an owner or admin can call; null when the ABI couldn't be read (unverified). */
  powers?: OwnerPower[] | null;
};

/** Snipers: wallets buying in the few blocks (Solana: slots) right after the launch block. */
export const SNIPER_BLOCKS = 3;

/** One wallet buying at launch: in the launch block or slot itself, or just after. */
export type LaunchBuy = { wallet: string; amount: number; phase: "bundle" | "sniper" };

/** Its first trades, when its history reaches back that far. */
export type LaunchFacts =
  | { reached: false }
  | { reached: true; at: number | null; buys: LaunchBuy[]; creator?: string | null };

export type TokenFacts = {
  chain: string;
  address: string;
  name?: string | null;
  symbol?: string | null;
  /** DexScreener's pools for the token, most liquid first; null when it couldn't be read. */
  pairs: Pair[] | null;
  /** The main pool's counts with wallets (GeckoTerminal); null when unread. */
  pool: PoolWindows | null;
  /** The main pool's latest trades (GeckoTerminal); null when unread. */
  trades: RawTrade[] | null;
  /** supply in tokens; null when unread. */
  holders: { supply: number; count: number | null; list: RawHolder[] } | null;
  /** The supply, in tokens, when known apart from the holders (the mint account). */
  supply?: number | null;
  /** null when it couldn't be read. */
  contract: SolanaContract | EvmContract | null;
  /**
   * The main pool's LP tokens: shares burned and locked, 0-100. undefined: no LP token to check (v3 and v4
   * positions, concentrated pools, bonding curves). null: it couldn't be read.
   */
  lp?: { burnedPct: number; lockedPct: number } | null;
  /** Its first trades; undefined: not read on this chain; null: couldn't be read. */
  launch?: LaunchFacts | null;
  /** Who first funded each of the biggest holders (null: not in reach); undefined/null: not read. */
  links?: { holder: string; funder: string | null }[] | null;
  /** The deployer's other tokens (EVM), and how many of them are dead; undefined/null: not read. */
  history?: { tokens: number; dead: number } | null;
  creator: string | null;
  label: (address: string) => TraceLabel | null;
  now: number;
};

const WINDOWS: [TokenWindow, "m5" | "h1" | "h6" | "h24"][] = [
  ["5m", "m5"],
  ["1h", "h1"],
  ["6h", "h6"],
  ["24h", "h24"],
];

// Lines the checks draw. Memecoins are wild by nature: these mark what goes past wild.
export const LIMITS = {
  /** The ten biggest wallets' share of the supply (pools, burn addresses and exchanges aside). */
  top10: { warn: 30, bad: 50 },
  /** The biggest single wallet's share. */
  largest: { warn: 10, bad: 20 },
  /** What the deployer still holds. */
  creator: { warn: 5, bad: 20 },
  /** Holders under this many (EVM: Blockscout counts them). */
  holders: 100,
  /** Tax on a buy, sell or transfer, percent. */
  tax: { warn: 0.5, bad: 10 },
  /** Liquidity under this, in dollars, is thin; or under this share of the market cap. */
  liquidity: { usd: 10_000, ofMcap: 0.02 },
  /** Share of the LP tokens burned or locked. */
  lp: { warn: 95, bad: 50 },
  /** Supply bought in the launch block by wallets other than the deployer (GMGN: 30%+ is high risk). */
  bundle: { warn: 10, bad: 30 },
  /** Supply bought in the blocks right after. */
  snipers: 20,
  /** The deployer kept less than this share of what it bought at launch: it sold. */
  devSold: 0.25,
  /** The biggest group of top holders sharing a funder (Bubblemaps: 15-30% elevated, 30%+ high). */
  cluster: { warn: 15, bad: 30 },
  /** Top holders the deployer funded. */
  deployerFunded: { warn: 3, bad: 10 },
  /** Earlier tokens from the deployer, and dead ones among them. */
  history: { tokens: 3, dead: 3 },
  /** Wash trading: a wallet's buys and sells within this share of each other, in tokens (Mongardini & Mei: 2%). */
  washTolerance: 0.02,
  /** Share of the sample's volume from wash-trading wallets. */
  wash: { warn: 25, bad: 50 },
  /** The top 3 buyers' share of what was bought. */
  buyers: 60,
  /** Trades per wallet over 24 hours. */
  perWallet: 6,
  /** Trades the sample needs before the trading checks say anything. */
  sample: 20,
};

const pct = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(1)}%`;
const usd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : `$${Math.round(n)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const same = (a: string, b: string | null | undefined) =>
  !!b && (a.startsWith("0x") ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Buys, sells and volume in each window, over every pool; wallets from the main pool. */
export function flowOf(pairs: Pair[], pool: PoolWindows | null): TokenFlowWindow[] {
  return WINDOWS.map(([window, k]) => {
    const vols = pairs.map((p) => p.volume?.[k]).filter((v): v is number => typeof v === "number");
    return {
      window,
      buys: pairs.reduce((s, p) => s + (p.txns?.[k]?.buys ?? 0), 0),
      sells: pairs.reduce((s, p) => s + (p.txns?.[k]?.sells ?? 0), 0),
      buyers: pool?.[window]?.buyers ?? null,
      sellers: pool?.[window]?.sellers ?? null,
      volumeUsd: vols.length ? vols.reduce((s, v) => s + v, 0) : null,
    };
  });
}

type Wallet = TokenTrader & { bought: number; sold: number; amounts: boolean };

/** The sample, wallet by wallet. */
function byWallet(trades: RawTrade[], label: (a: string) => TraceLabel | null): Wallet[] {
  const map = new Map<string, Wallet>();
  for (const t of trades) {
    const w = map.get(t.wallet) ?? {
      address: t.wallet,
      label: label(t.wallet),
      buyUsd: 0,
      sellUsd: 0,
      buys: 0,
      sells: 0,
      last: 0,
      bought: 0,
      sold: 0,
      amounts: true,
    };
    if (t.side === "buy") {
      w.buyUsd += t.usd;
      w.buys++;
      w.bought += t.amount ?? 0;
    } else {
      w.sellUsd += t.usd;
      w.sells++;
      w.sold += t.amount ?? 0;
    }
    if (t.amount === undefined) w.amounts = false;
    w.last = Math.max(w.last, t.time);
    map.set(t.wallet, w);
  }
  return [...map.values()];
}

/** Shown per side. */
const TRADERS = 6;
const trader = ({ address, label, buyUsd, sellUsd, buys, sells, last }: Wallet): TokenTrader => ({
  address,
  label,
  buyUsd,
  sellUsd,
  buys,
  sells,
  last,
});

export function tradesOf(
  pool: string,
  trades: RawTrade[],
  label: (a: string) => TraceLabel | null,
): TokenTrades | null {
  if (!trades.length) return null;
  const wallets = byWallet(trades, label);
  const net = (w: Wallet) => w.buyUsd - w.sellUsd;
  const times = trades.map((t) => t.time);
  return {
    pool,
    count: trades.length,
    from: Math.min(...times),
    to: Math.max(...times),
    buyUsd: trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.usd, 0),
    sellUsd: trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.usd, 0),
    wallets: wallets.length,
    buyers: wallets
      .filter((w) => net(w) > 0)
      .sort((a, b) => net(b) - net(a))
      .slice(0, TRADERS)
      .map(trader),
    sellers: wallets
      .filter((w) => net(w) < 0)
      .sort((a, b) => net(a) - net(b))
      .slice(0, TRADERS)
      .map(trader),
  };
}

/** Not a wallet's own stake: pools, burn addresses, and exchanges (many people's money in one wallet). */
const aside = (h: { role: TokenHolderRole | null; label: TraceLabel | null }) =>
  h.role === "pool" || h.role === "burn" || h.label?.kind === "cex" || h.label?.kind === "dex";

export function holdersOf(h: NonNullable<TokenFacts["holders"]>, creator: string | null): TokenHolders {
  const top = h.list
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)
    .map((x) => ({
      address: x.address,
      pct: h.supply > 0 ? (x.amount / h.supply) * 100 : 0,
      role: x.role ?? (same(x.address, creator) ? ("creator" as const) : null),
      label: x.label,
    }));
  const own = top.filter((x) => !aside(x));
  return {
    count: h.count,
    top,
    top10Pct: own.slice(0, 10).reduce((s, x) => s + x.pct, 0),
    poolPct: top.filter((x) => x.role === "pool").reduce((s, x) => s + x.pct, 0),
  };
}

/**
 * Wash trading, after Mongardini & Mei: a wallet that bought and sold almost the same amount of the token (within
 * 2%, for fees and slippage), here twice or more each way, so a trader buying in and selling out once isn't one.
 * Without token amounts, dollars within 10%. Their share of the sample's volume, in dollars.
 */
export function washShare(wallets: Wallet[]): number {
  const total = wallets.reduce((s, w) => s + w.buyUsd + w.sellUsd, 0);
  if (!total) return 0;
  const washing = (w: Wallet) => {
    if (w.buys < 2 || w.sells < 2) return false;
    if (w.amounts && w.bought > 0 && w.sold > 0)
      return Math.abs(w.bought - w.sold) <= LIMITS.washTolerance * Math.max(w.bought, w.sold);
    return Math.abs(w.buyUsd - w.sellUsd) <= 0.1 * Math.max(w.buyUsd, w.sellUsd);
  };
  const washed = wallets.filter(washing).reduce((s, w) => s + w.buyUsd + w.sellUsd, 0);
  return (washed / total) * 100;
}

/** The launch in numbers: what bundles, snipers and the deployer bought, as shares of the supply. */
export function launchOf(
  launch: Extract<LaunchFacts, { reached: true }>,
  supply: number,
  creator: string | null,
  holders: TokenHolders | null,
): TokenLaunch {
  const share = (buys: LaunchBuy[]) => (supply > 0 ? (buys.reduce((s, b) => s + b.amount, 0) / supply) * 100 : 0);
  const others = launch.buys.filter((b) => !same(b.wallet, creator));
  const side = (phase: LaunchBuy["phase"]) => {
    const buys = others.filter((b) => b.phase === phase);
    return { wallets: new Set(buys.map((b) => b.wallet)).size, pct: share(buys) };
  };
  const devBuys = launch.buys.filter((b) => same(b.wallet, creator));
  const dev = creator && devBuys.length
    ? { boughtPct: share(devBuys), holdsPct: holders?.top.find((h) => same(h.address, creator))?.pct ?? null }
    : null;
  return { at: launch.at, bundle: side("bundle"), snipers: side("sniper"), dev };
}

/**
 * Top holders grouped by who first funded them (Bubblemaps' clusters): a holder and its funder are one group, so
 * a funder that's itself a holder joins its wallets in. Funders that are exchanges, bridges, mixers or DEXs aren't
 * anyone's: thousands of wallets start there. Groups of two or more, or any with the deployer in it.
 */
export function clustersOf(
  holders: TokenHolders,
  links: { holder: string; funder: string | null }[],
  creator: string | null,
  label: (a: string) => TraceLabel | null,
): TokenCluster[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    const p = parent.get(a) ?? a;
    if (p === a) return a;
    const root = find(p);
    parent.set(a, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  const shared = (f: string) => {
    const l = label(f);
    return !l || l.kind === "named" || l.kind === "sanctioned" || l.kind === "hack" || l.kind === "scam";
  };
  for (const { holder, funder } of links) if (funder && shared(funder)) join(holder, funder);

  const pctOf = new Map(holders.top.map((h) => [h.address, h.pct]));
  const groups = new Map<string, Set<string>>();
  for (const { holder } of links) {
    const root = find(holder);
    groups.set(root, (groups.get(root) ?? new Set()).add(holder));
  }
  const out: TokenCluster[] = [];
  for (const members of groups.values()) {
    const list = [...members];
    const funders = links.filter((l) => members.has(l.holder) && l.funder).map((l) => l.funder!);
    // The deployer's: wallets it funded, or wallets sharing a funder with it (alone, it's the deployer's own stake).
    const funded = !!creator && funders.some((f) => same(f, creator));
    const deployer = funded || (!!creator && list.length >= 2 && list.some((m) => same(m, creator)));
    if (list.length < 2 && !funded) continue;
    // The funder most of them share; the deployer when it's among them.
    const counts = new Map<string, number>();
    for (const f of funders) counts.set(f, (counts.get(f) ?? 0) + 1);
    const funder =
      (deployer && creator) || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || list[0];
    const ms = list.map((address) => ({ address, pct: pctOf.get(address) ?? 0 })).sort((a, b) => b.pct - a.pct);
    out.push({ funder, label: label(funder), deployer, pct: ms.reduce((s, m) => s + m.pct, 0), members: ms });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

type Check = Omit<TokenCheck, "group">;
const level = (value: number, l: { warn: number; bad: number }) =>
  value >= l.bad ? "bad" : value >= l.warn ? "warn" : "ok";

const POWER_TEXT: Record<OwnerPower, { status: Check["status"]; short: string; text: string }> = {
  mint: { status: "bad", short: "Owner can mint", text: "The owner can mint more tokens" },
  blacklist: { status: "bad", short: "Owner can block sells", text: "The owner can block wallets from trading" },
  pause: { status: "bad", short: "Owner can stop trading", text: "The owner can stop trading" },
  fees: { status: "warn", short: "Owner can change tax", text: "The owner can change the buy and sell tax" },
  limits: { status: "warn", short: "Owner can cap sells", text: "The owner can cap how much a wallet can sell" },
};

function contractChecks(c: TokenFacts["contract"], chain: string): Check[] {
  if (!c)
    return [{ id: "contract", status: "unknown", short: "Contract unread", text: "Couldn't read the contract", source: "" }];
  if (c.kind === "solana") {
    const src = "Solana RPC";
    const out: Check[] = [
      c.mintAuthority
        ? {
            id: "mint",
            status: "bad",
            short: "Can be minted",
            text: "Mint authority is on: more can be minted at will",
            source: src,
          }
        : { id: "mint", status: "ok", short: "Fixed supply", text: "Mint authority revoked: the supply is fixed", source: src },
      c.freezeAuthority
        ? {
            id: "freeze",
            status: "bad",
            short: "Can be frozen",
            text: "Freeze authority is on: any holder's tokens can be frozen, sells blocked",
            source: src,
          }
        : {
            id: "freeze",
            status: "ok",
            short: "Can't be frozen",
            text: "No freeze authority: holders can't be frozen",
            source: src,
          },
    ];
    if (c.mutableMetadata)
      out.push({
        id: "metadata",
        status: "warn",
        short: "Name can change",
        text: "Its name and logo can still be changed (mutable metadata)",
        source: src,
      });
    else if (c.mutableMetadata === false)
      out.push({ id: "metadata", status: "ok", short: "Name locked", text: "Its name and logo are locked", source: src });
    if (c.transferFeeBps) {
      const fee = c.transferFeeBps / 100;
      out.push({
        id: "fee",
        status: fee >= LIMITS.tax.bad ? "bad" : "warn",
        short: `${pct(fee)} transfer fee`,
        text: `Transfer fee of ${pct(fee)} on every transfer${c.feeAuthority ? ", and it can be raised" : ""}`,
        source: src,
      });
    }
    if (c.permanentDelegate)
      out.push({
        id: "delegate",
        status: "bad",
        short: "Tokens can be taken",
        text: "Permanent delegate: one wallet can move or burn anyone's tokens",
        source: src,
      });
    if (c.transferHook)
      out.push({
        id: "hook",
        status: "warn",
        short: "Transfer hook",
        text: "Transfer hook: a program runs on every transfer, and can refuse one",
        source: src,
      });
    if (c.nonTransferable)
      out.push({ id: "soulbound", status: "bad", short: "Can't be sold", text: "Non-transferable: it can't be sold", source: src });
    if (c.defaultFrozen)
      out.push({
        id: "frozen",
        status: "bad",
        short: "Buyers start frozen",
        text: "New holders start frozen: a buyer can't sell until thawed",
        source: src,
      });
    if (c.pausable)
      out.push({
        id: "pause",
        status: c.pausable.paused ? "bad" : "warn",
        short: c.pausable.paused ? "Transfers paused" : "Can be paused",
        text: c.pausable.paused ? "Transfers are paused right now" : "Transfers can be paused",
        source: src,
      });
    return out;
  }

  const out: Check[] = [];
  if (c.scam)
    out.push({ id: "scam", status: "bad", short: "Flagged as scam", text: "Flagged as a scam", source: "Blockscout" });
  const src = "Honeypot.is";
  if (c.sim === undefined)
    out.push({
      id: "sell",
      status: "unknown",
      short: "Sell untested",
      text: `No sell test on ${chain}: couldn't check that it can be sold`,
      source: "",
    });
  else if (c.sim === null)
    out.push({ id: "sell", status: "unknown", short: "Sell untested", text: "Couldn't run a test buy and sell", source: src });
  else if (c.sim.honeypot)
    out.push({
      id: "sell",
      status: "bad",
      short: "Can't be sold",
      text: `Can't be sold: a test sell failed${c.sim.reason ? ` (${c.sim.reason})` : ""}`,
      source: src,
    });
  else {
    const taxes = [c.sim.buyTax, c.sim.sellTax, c.sim.transferTax].map((t) => t ?? 0);
    const status = level(Math.max(...taxes), LIMITS.tax);
    out.push({ id: "sell", status: "ok", short: "Sells work", text: "A test buy and sell went through", source: src });
    out.push({
      id: "tax",
      status,
      short: status === "ok" ? "No tax" : `${pct(Math.max(taxes[0], taxes[1]))} tax`,
      text:
        status === "ok"
          ? "No buy or sell tax"
          : `Tax: ${pct(taxes[0])} to buy, ${pct(taxes[1])} to sell${taxes[2] ? `, ${pct(taxes[2])} to transfer` : ""}`,
      source: src,
    });
  }

  // What the owner can still do: nothing once ownership is renounced.
  const powers = c.powers ?? [];
  const bs = "Blockscout";
  if (c.owner === "renounced")
    out.push({
      id: "owner",
      status: "ok",
      short: "Ownership renounced",
      text: "Ownership renounced: no one can change the contract's settings",
      source: bs,
    });
  else if (c.powers && !powers.length)
    out.push({
      id: "owner",
      status: "ok",
      short: "No owner powers",
      text: "No function to mint, block wallets, stop trading or change the tax",
      source: bs,
    });
  else if (powers.length) {
    const known = typeof c.owner === "string" && c.owner !== "none";
    for (const p of powers) {
      const t = POWER_TEXT[p];
      out.push({
        id: `power:${p}`,
        // An owner function with no owner() to say who holds it: worth a look, not more.
        status: known || c.owner === undefined ? t.status : "warn",
        short: t.short,
        text: known ? t.text : `${t.text}, if anyone holds the admin role`,
        source: bs,
      });
    }
  }
  if (c.verified === false)
    out.push({
      id: "source",
      status: "warn",
      short: "Code unverified",
      text: "Source code isn't verified: what it does can't be read",
      source: bs,
    });
  else if (c.verified)
    out.push({ id: "source", status: "ok", short: "Code verified", text: "Source code is verified", source: bs });
  if (c.proxy)
    out.push({
      id: "proxy",
      status: "warn",
      short: "Upgradeable",
      text: "Upgradeable (a proxy): its code can be swapped after you buy",
      source: bs,
    });
  return out;
}

/** Liquidity over every pool; null when none of them reports it. */
function liquidityOf(pairs: Pair[]): number | null {
  const known = pairs.map((p) => p.liquidity?.usd).filter((v): v is number => typeof v === "number");
  return known.length ? known.reduce((s, v) => s + v, 0) : null;
}

function liquidityChecks(f: TokenFacts, mcap: number | null): Check[] {
  if (!f.pairs)
    return [{ id: "pools", status: "unknown", short: "Pools unread", text: "Couldn't read its pools", source: "DexScreener" }];
  const best = f.pairs[0];
  if (!best)
    return [{ id: "pools", status: "unknown", short: "No pool", text: "No DEX pool trades it yet", source: "DexScreener" }];
  const out: Check[] = [];
  const liq = liquidityOf(f.pairs);
  const curve = /pump/i.test(best.dexId) && !/swap/i.test(best.dexId);
  if (liq === null) {
    // A pump.fun bonding curve has no pool to pull: its sells go against the curve.
    out.push(
      curve
        ? {
            id: "liquidity",
            status: "ok",
            short: "Bonding curve",
            text: "Still on pump.fun's bonding curve: no pool to pull",
            source: "DexScreener",
          }
        : {
            id: "liquidity",
            status: "unknown",
            short: "Liquidity unknown",
            text: "Its pools don't report their liquidity",
            source: "DexScreener",
          },
    );
    return out;
  }
  const share = mcap ? liq / mcap : null;
  const thin = liq < LIMITS.liquidity.usd || (share !== null && share < LIMITS.liquidity.ofMcap);
  out.push({
    id: "liquidity",
    status: thin ? "warn" : "ok",
    short: thin ? `Thin liquidity: ${usd(liq)}` : `${usd(liq)} liquidity`,
    text: `${thin ? "Thin liquidity" : "Liquidity"}: ${usd(liq)}${share !== null ? `, ${pct(share * 100)} of its market cap` : ""}${thin ? ". A sell moves the price a lot" : ""}`,
    source: "DexScreener",
  });
  const src = f.chain === "solana" ? "Solana RPC" : "Blockscout";
  if (f.lp === null)
    out.push({
      id: "lp",
      status: "unknown",
      short: "LP unread",
      text: "Couldn't read who holds the pool's LP tokens",
      source: src,
    });
  else if (f.lp) {
    const safe = Math.min(100, f.lp.burnedPct + f.lp.lockedPct);
    const status = safe < LIMITS.lp.bad ? "bad" : safe < LIMITS.lp.warn ? "warn" : "ok";
    out.push({
      id: "lp",
      status,
      short: status === "ok" ? (f.lp.burnedPct >= f.lp.lockedPct ? "LP burned" : "LP locked") : "LP can be pulled",
      text:
        status === "ok"
          ? `Liquidity can't be pulled: ${pct(safe)} of the LP is burned or locked`
          : `${status === "bad" ? "Most of the liquidity" : "Some of the liquidity"} can be pulled: only ${pct(safe)} of the LP is burned or locked`,
      source: src,
    });
  }
  return out;
}

function holderChecks(h: TokenHolders | null, creator: string | null, chain: string): Check[] {
  const src = chain === "solana" ? "Solana RPC" : "Blockscout";
  if (!h) return [{ id: "holders", status: "unknown", short: "Holders unread", text: "Couldn't read the holders", source: src }];
  const out: Check[] = [];
  const top10 = level(h.top10Pct, LIMITS.top10);
  out.push({
    id: "top10",
    status: top10,
    short: `Top 10 hold ${pct(h.top10Pct)}`,
    text: `Top 10 wallets hold ${pct(h.top10Pct)} of the supply${top10 === "ok" ? "" : top10 === "bad" ? ": a few can dump on everyone" : ": concentrated"}`,
    source: src,
  });
  // The deployer's own stake has its line below.
  const largest = h.top.find((x) => !aside(x));
  if (largest && largest.role !== "creator" && level(largest.pct, LIMITS.largest) !== "ok") {
    out.push({
      id: "largest",
      status: level(largest.pct, LIMITS.largest),
      short: `1 wallet holds ${pct(largest.pct)}`,
      text: `One wallet holds ${pct(largest.pct)}`,
      source: src,
    });
  }
  if (h.count !== null && h.count < LIMITS.holders)
    out.push({ id: "count", status: "warn", short: `${h.count} holders`, text: `Only ${plural(h.count, "holder")}`, source: src });
  if (creator) {
    const dev = h.top.find((x) => x.role === "creator");
    const status = dev ? level(dev.pct, LIMITS.creator) : "ok";
    out.push({
      id: "creator",
      status,
      short: dev ? `Deployer holds ${pct(dev.pct)}` : "Deployer holds little",
      text: !dev
        ? "The deployer holds little or none"
        : status === "ok"
          ? `The deployer holds ${pct(dev.pct)}`
          : `The deployer still holds ${pct(dev.pct)}`,
      source: src,
    });
  }
  return out;
}

function insiderChecks(
  f: TokenFacts,
  holders: TokenHolders | null,
  launch: TokenLaunch | null,
  clusters: TokenCluster[] | null,
  notes: TokenNote[],
): Check[] {
  const out: Check[] = [];
  const src = f.chain === "solana" ? "Solana RPC" : "Blockscout";
  const note = (text: string) => notes.push({ group: "insiders", text });

  if (f.launch === null) note("Couldn't read its launch right now.");
  else if (f.launch && !f.launch.reached) note("Its launch is too far back to read: it has traded a lot since.");
  else if (f.launch === undefined) note("Its launch isn't read on this chain.");
  if (launch) {
    const b = launch.bundle;
    const status = b.wallets ? level(b.pct, LIMITS.bundle) : "ok";
    out.push({
      id: "bundle",
      status,
      short: b.wallets ? `${pct(b.pct)} bundled` : "No bundles",
      text: b.wallets
        ? `${plural(b.wallets, "wallet")} bought ${pct(b.pct)} of the supply in the launch block${status === "ok" ? "" : ": a bundle, often the team buying its own token"}`
        : "No other wallet bought in the launch block",
      source: src,
    });
    const s = launch.snipers;
    if (s.wallets)
      out.push({
        id: "snipers",
        status: s.pct >= LIMITS.snipers ? "warn" : "ok",
        short: `${pct(s.pct)} sniped`,
        text: `${plural(s.wallets, "sniper")} bought ${pct(s.pct)} in the blocks right after`,
        source: src,
      });
    const d = launch.dev;
    if (d && d.boughtPct >= 0.5) {
      // Not among the biggest holders: it holds less than the smallest of them.
      const smallest = holders?.top.length ? Math.min(...holders.top.map((h) => h.pct)) : null;
      const holds = d.holdsPct ?? smallest;
      const sold = holds !== null && holds < LIMITS.devSold * d.boughtPct;
      out.push({
        id: "devsold",
        status: sold ? "warn" : "ok",
        short: sold ? "Deployer sold" : "Deployer holding",
        text: sold
          ? `The deployer bought ${pct(d.boughtPct)} at launch and has sold most of it`
          : `The deployer bought ${pct(d.boughtPct)} at launch and still holds ${pct(d.holdsPct ?? 0)}`,
        source: src,
      });
    }
  }

  if (!clusters) note("Couldn't read who funded the biggest holders.");
  else {
    const dev = clusters.find((c) => c.deployer);
    if (dev) {
      const status = level(dev.pct, LIMITS.deployerFunded);
      out.push({
        id: "devfunded",
        status,
        short: `Deployer's wallets: ${pct(dev.pct)}`,
        text: `${plural(dev.members.length, "top holder")} tied to the deployer (funded by it, or it) hold ${pct(dev.pct)}`,
        source: src,
      });
    }
    const biggest = clusters.find((c) => !c.deployer);
    const status = biggest ? level(biggest.pct, LIMITS.cluster) : "ok";
    // "Funded separately" isn't so when the deployer funded some of them.
    if (biggest || !dev) out.push({
      id: "cluster",
      status,
      short: biggest ? `Linked wallets: ${pct(biggest.pct)}` : "No linked holders",
      text: biggest
        ? `${plural(biggest.members.length, "top holder")} first funded by the same wallet hold ${pct(biggest.pct)}${status === "ok" ? "" : ": likely one owner"}`
        : "The biggest holders were funded separately",
      source: src,
    });
  }

  if (f.history) {
    const { tokens, dead } = f.history;
    const status =
      dead >= LIMITS.history.dead ? "bad" : tokens >= LIMITS.history.tokens || dead > 0 ? "warn" : "ok";
    out.push({
      id: "history",
      status,
      short: tokens ? `Deployer: ${tokens} other tokens` : "Deployer's first token",
      text: tokens
        ? `The deployer launched ${plural(tokens, "other token")}${dead ? `; ${dead} ${dead === 1 ? "is" : "are"} dead` : ""}`
        : "No other tokens from this deployer",
      source: "Blockscout",
    });
  }
  return out;
}

function tradingChecks(f: TokenFacts, wallets: Wallet[] | null): Check[] {
  const src = "GeckoTerminal";
  if (!f.trades) {
    return f.pairs?.length
      ? [{ id: "trades", status: "unknown", short: "Trades unread", text: "Couldn't read the latest trades", source: src }]
      : [];
  }
  if (f.trades.length < LIMITS.sample || !wallets) {
    return [
      {
        id: "trades",
        status: "ok",
        short: "Few trades",
        text: `Only ${f.trades.length} trades lately: too few to judge`,
        source: src,
      },
    ];
  }
  const out: Check[] = [];
  const wash = washShare(wallets);
  const washLevel = level(wash, LIMITS.wash);
  out.push({
    id: "wash",
    status: washLevel,
    short: washLevel === "ok" ? "No wash trading" : `${pct(wash)} wash trading`,
    text:
      washLevel === "ok"
        ? "No sign of wash trading in the latest trades"
        : `${washLevel === "bad" ? "Looks like wash trading" : "Some wash trading"}: ${pct(wash)} of the volume is wallets buying and selling the same amount back and forth`,
    source: src,
  });

  const buys = f.trades.filter((t) => t.side === "buy");
  const sells = f.trades.filter((t) => t.side === "sell");
  const buyUsd = buys.reduce((s, t) => s + t.usd, 0);
  const sellUsd = sells.reduce((s, t) => s + t.usd, 0);
  if (buys.length >= 10 && buyUsd > 0) {
    const top3 = [...wallets].sort((a, b) => b.buyUsd - a.buyUsd).slice(0, 3);
    const share = (top3.reduce((s, w) => s + w.buyUsd, 0) / buyUsd) * 100;
    if (share >= LIMITS.buyers)
      out.push({
        id: "buyers",
        status: "warn",
        short: "3 wallets buying",
        text: `3 wallets did ${pct(share)} of the buying`,
        source: src,
      });
  }
  if (buys.length >= 1.5 * sells.length && sells.length > 0 && sellUsd > 1.2 * buyUsd) {
    out.push({
      id: "dumping",
      status: "warn",
      short: "Big sells into buys",
      text: `Many small buys, a few big sells: ${buys.length} buys for ${usd(buyUsd)}, ${sells.length} sells for ${usd(sellUsd)}`,
      source: src,
    });
  } else if (sellUsd >= 2 * buyUsd && sellUsd >= 1_000) {
    out.push({
      id: "selling",
      status: "warn",
      short: "Heavy selling",
      text: `Selling outweighs buying ${(sellUsd / Math.max(buyUsd, 1)).toFixed(1)} to 1 in the latest trades`,
      source: src,
    });
  }
  const day = f.pool?.["24h"];
  if (day && day.buys + day.sells >= 100 && day.buyers + day.sellers > 0) {
    const per = (day.buys + day.sells) / (day.buyers + day.sellers);
    if (per >= LIMITS.perWallet)
      out.push({
        id: "bots",
        status: "warn",
        short: "Mostly bots",
        text: `${per.toFixed(1)} trades per wallet over 24h: much of it is bots`,
        source: src,
      });
  }
  return out;
}

const ORDER: Record<TokenCheck["status"], number> = { bad: 0, warn: 1, unknown: 2, ok: 3 };

export function verdictOf(checks: TokenCheck[]): TokenVerdict {
  if (checks.some((c) => c.status === "bad")) return "danger";
  if (checks.some((c) => c.status === "warn" || c.status === "unknown")) return "check";
  return "clear";
}

export function assessToken(f: TokenFacts): TokenReport {
  const best = f.pairs?.[0] ?? null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const price = best?.priceUsd ? Number(best.priceUsd) : null;
  const marketCap = num(best?.marketCap) ?? num(best?.fdv);
  // Solana: whoever signed its first transaction, when the launch was read.
  const creator = f.creator ?? (f.launch?.reached ? (f.launch.creator ?? null) : null);
  const holders = f.holders ? holdersOf(f.holders, creator) : null;
  const wallets = f.trades ? byWallet(f.trades, f.label) : null;
  const supply = f.supply ?? f.holders?.supply ?? null;
  const launch = f.launch?.reached && supply ? launchOf(f.launch, supply, creator, holders) : null;
  const clusters = holders && f.links ? clustersOf(holders, f.links, creator, f.label) : null;
  if (holders && clusters)
    clusters.forEach((c, i) =>
      c.members.forEach((m) => {
        const h = holders.top.find((x) => x.address === m.address);
        if (h) h.cluster = i;
      }),
    );

  const notes: TokenNote[] = [];
  const groups: [TokenGroup, Check[]][] = [
    ["contract", contractChecks(f.contract, f.chain)],
    ["liquidity", liquidityChecks(f, marketCap)],
    ["holders", holderChecks(holders, creator, f.chain)],
    ["insiders", insiderChecks(f, holders, launch, clusters, notes)],
    ["trading", tradingChecks(f, wallets)],
  ];
  if (f.lp === undefined && best && f.chain === "solana" && !/pump/i.test(best.dexId))
    notes.push({ group: "liquidity", text: "Who holds its LP tokens wasn't read (concentrated pools have none)." });
  const checks = groups
    .flatMap(([group, list]) => list.map((c) => ({ ...c, group })))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return {
    chain: f.chain,
    address: f.address,
    name: best?.baseToken.name ?? f.name ?? null,
    symbol: best?.baseToken.symbol ?? f.symbol ?? null,
    priceUsd: price !== null && Number.isFinite(price) ? price : null,
    marketCap,
    liquidityUsd: f.pairs ? liquidityOf(f.pairs) : null,
    pool: best
      ? { address: best.pairAddress, dex: best.dexId, url: best.url, createdAt: num(best.pairCreatedAt) }
      : null,
    pools: f.pairs?.length ?? 0,
    verdict: verdictOf(checks),
    checks,
    flow: flowOf(f.pairs ?? [], f.pool),
    trades: best && f.trades ? tradesOf(best.pairAddress, f.trades, f.label) : null,
    holders,
    launch,
    clusters: clusters ?? [],
    notes,
    creator,
    updatedAt: f.now,
  };
}
