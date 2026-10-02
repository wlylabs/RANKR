// A token's report from what was read about it: where buys and sells come from, who holds it, what its contract
// allows, and the checks that make the verdict. Pure: the readers (token-solana.ts, token-evm.ts, gecko.ts,
// honeypot.ts) fill TokenFacts, the mock makes up some, and both come out the same way here.
//
// Every check is a fact with its source, in plain words. The verdict only counts them: a warning sign (bad), worth
// a closer look (warn, or a check that couldn't be read), or none read. It's not an accusation, and none read isn't
// a promise.
import type { Pair } from "../dexscreener";
import type {
  TokenCheck,
  TokenFlowWindow,
  TokenHolderRole,
  TokenHolders,
  TokenReport,
  TokenTrader,
  TokenTrades,
  TokenVerdict,
  TokenWindow,
  TraceLabel,
} from "./types";

/** One trade in the main pool: a wallet buying or selling the token, in dollars at the time. */
export type RawTrade = { wallet: string; side: "buy" | "sell"; usd: number; time: number; tx: string };

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
};

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
};

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
  /** null when it couldn't be read. */
  contract: SolanaContract | EvmContract | null;
  /**
   * The main pool's LP tokens (EVM v2 pools): shares burned and locked, 0-100. undefined: not an LP token (v3 and
   * v4 positions, Solana pools), so not checked. null: it couldn't be read.
   */
  lp?: { burnedPct: number; lockedPct: number } | null;
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
  /** Tax on a buy, sell or transfer, percent. */
  tax: { warn: 0.5, bad: 10 },
  /** Liquidity under this, in dollars, is thin; or under this share of the market cap. */
  liquidity: { usd: 10_000, ofMcap: 0.02 },
  /** Share of the LP tokens burned or locked. */
  lp: { warn: 95, bad: 50 },
  /** Share of the sample's volume from wallets trading back and forth (see churn). */
  churn: { warn: 25, bad: 50 },
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

type Wallet = TokenTrader;

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
    };
    if (t.side === "buy") {
      w.buyUsd += t.usd;
      w.buys++;
    } else {
      w.sellUsd += t.usd;
      w.sells++;
    }
    w.last = Math.max(w.last, t.time);
    map.set(t.wallet, w);
  }
  return [...map.values()];
}

/** Shown per side. */
const TRADERS = 6;

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
      .slice(0, TRADERS),
    sellers: wallets
      .filter((w) => net(w) < 0)
      .sort((a, b) => net(a) - net(b))
      .slice(0, TRADERS),
  };
}

/** Not a wallet's own stake: pools, burn addresses, and exchanges (many people's money in one wallet). */
const aside = (h: { role: TokenHolderRole | null; label: TraceLabel | null }) =>
  h.role === "pool" || h.role === "burn" || h.label?.kind === "cex" || h.label?.kind === "dex";

export function holdersOf(h: NonNullable<TokenFacts["holders"]>, creator: string | null): TokenHolders {
  const same = (a: string, b: string | null) => !!b && (a.startsWith("0x") ? a.toLowerCase() === b.toLowerCase() : a === b);
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
 * Wallets trading back and forth: three or more buys and three or more sells in the sample, about as much each
 * way (within 10%). Their share of the sample's volume: volume made to be seen, or bots farming it.
 */
export function churnShare(wallets: Wallet[]): number {
  const total = wallets.reduce((s, w) => s + w.buyUsd + w.sellUsd, 0);
  if (!total) return 0;
  const churn = wallets
    .filter((w) => w.buys >= 3 && w.sells >= 3 && Math.abs(w.buyUsd - w.sellUsd) <= 0.1 * (w.buyUsd + w.sellUsd))
    .reduce((s, w) => s + w.buyUsd + w.sellUsd, 0);
  return (churn / total) * 100;
}

type Check = Omit<TokenCheck, "group">;
const level = (value: number, l: { warn: number; bad: number }) =>
  value >= l.bad ? "bad" : value >= l.warn ? "warn" : "ok";

function contractChecks(c: TokenFacts["contract"], chain: string): Check[] {
  if (!c) return [{ id: "contract", status: "unknown", text: "Couldn't read the contract", source: "" }];
  if (c.kind === "solana") {
    const src = "Solana RPC";
    const out: Check[] = [
      c.mintAuthority
        ? { id: "mint", status: "bad", text: "Mint authority is on: more can be minted at will", source: src }
        : { id: "mint", status: "ok", text: "Mint authority revoked: the supply is fixed", source: src },
      c.freezeAuthority
        ? {
            id: "freeze",
            status: "bad",
            text: "Freeze authority is on: any holder's tokens can be frozen, sells blocked",
            source: src,
          }
        : { id: "freeze", status: "ok", text: "No freeze authority: holders can't be frozen", source: src },
    ];
    if (c.transferFeeBps) {
      const fee = c.transferFeeBps / 100;
      out.push({
        id: "fee",
        status: fee >= LIMITS.tax.bad ? "bad" : "warn",
        text: `Transfer fee of ${pct(fee)} on every transfer${c.feeAuthority ? ", and it can be raised" : ""}`,
        source: src,
      });
    }
    if (c.permanentDelegate)
      out.push({
        id: "delegate",
        status: "bad",
        text: "Permanent delegate: one wallet can move or burn anyone's tokens",
        source: src,
      });
    if (c.transferHook)
      out.push({
        id: "hook",
        status: "warn",
        text: "Transfer hook: a program runs on every transfer, and can refuse one",
        source: src,
      });
    if (c.nonTransferable)
      out.push({ id: "soulbound", status: "bad", text: "Non-transferable: it can't be sold", source: src });
    if (c.defaultFrozen)
      out.push({
        id: "frozen",
        status: "bad",
        text: "New holders start frozen: a buyer can't sell until thawed",
        source: src,
      });
    if (c.pausable)
      out.push({
        id: "pause",
        status: c.pausable.paused ? "bad" : "warn",
        text: c.pausable.paused ? "Transfers are paused right now" : "Transfers can be paused",
        source: src,
      });
    return out;
  }

  const out: Check[] = [];
  if (c.scam) out.push({ id: "scam", status: "bad", text: "Flagged as a scam", source: "Blockscout" });
  const src = "Honeypot.is";
  if (c.sim === undefined)
    out.push({
      id: "sell",
      status: "unknown",
      text: `No sell test on ${chain}: couldn't check that it can be sold`,
      source: "",
    });
  else if (c.sim === null)
    out.push({ id: "sell", status: "unknown", text: "Couldn't run a test buy and sell", source: src });
  else if (c.sim.honeypot)
    out.push({
      id: "sell",
      status: "bad",
      text: `Can't be sold: a test sell failed${c.sim.reason ? ` (${c.sim.reason})` : ""}`,
      source: src,
    });
  else {
    const taxes = [c.sim.buyTax, c.sim.sellTax, c.sim.transferTax].map((t) => t ?? 0);
    const status = level(Math.max(...taxes), LIMITS.tax);
    out.push({
      id: "sell",
      status: "ok",
      text: "A test buy and sell went through",
      source: src,
    });
    out.push({
      id: "tax",
      status,
      text:
        status === "ok"
          ? "No buy or sell tax"
          : `Tax: ${pct(taxes[0])} to buy, ${pct(taxes[1])} to sell${taxes[2] ? `, ${pct(taxes[2])} to transfer` : ""}`,
      source: src,
    });
  }
  if (c.verified === false)
    out.push({
      id: "source",
      status: "warn",
      text: "Source code isn't verified: what it does can't be read",
      source: "Blockscout",
    });
  else if (c.verified)
    out.push({ id: "source", status: "ok", text: "Source code is verified", source: "Blockscout" });
  if (c.proxy)
    out.push({
      id: "proxy",
      status: "warn",
      text: "Upgradeable (a proxy): its code can be swapped after you buy",
      source: "Blockscout",
    });
  return out;
}

/** Liquidity over every pool; null when none of them reports it. */
function liquidityOf(pairs: Pair[]): number | null {
  const known = pairs.map((p) => p.liquidity?.usd).filter((v): v is number => typeof v === "number");
  return known.length ? known.reduce((s, v) => s + v, 0) : null;
}

function liquidityChecks(f: TokenFacts, mcap: number | null): Check[] {
  if (!f.pairs) return [{ id: "pools", status: "unknown", text: "Couldn't read its pools", source: "DexScreener" }];
  const best = f.pairs[0];
  if (!best) return [{ id: "pools", status: "unknown", text: "No DEX pool trades it yet", source: "DexScreener" }];
  const out: Check[] = [];
  const liq = liquidityOf(f.pairs);
  if (liq === null) {
    // A pump.fun bonding curve has no pool to pull: its sells go against the curve.
    out.push(
      /pump/i.test(best.dexId) && !/swap/i.test(best.dexId)
        ? { id: "liquidity", status: "ok", text: "Still on pump.fun's bonding curve: no pool to pull", source: "DexScreener" }
        : { id: "liquidity", status: "unknown", text: "Its pools don't report their liquidity", source: "DexScreener" },
    );
    return out;
  }
  const share = mcap ? liq / mcap : null;
  const thin = liq < LIMITS.liquidity.usd || (share !== null && share < LIMITS.liquidity.ofMcap);
  out.push({
    id: "liquidity",
    status: thin ? "warn" : "ok",
    text: `${thin ? "Thin liquidity" : "Liquidity"}: ${usd(liq)}${share !== null ? `, ${pct(share * 100)} of its market cap` : ""}${thin ? ". A sell moves the price a lot" : ""}`,
    source: "DexScreener",
  });
  if (f.lp === null)
    out.push({ id: "lp", status: "unknown", text: "Couldn't read who holds the pool's LP tokens", source: "Blockscout" });
  else if (f.lp) {
    const safe = Math.min(100, f.lp.burnedPct + f.lp.lockedPct);
    const status = safe < LIMITS.lp.bad ? "bad" : safe < LIMITS.lp.warn ? "warn" : "ok";
    out.push({
      id: "lp",
      status,
      text:
        status === "ok"
          ? `Liquidity can't be pulled: ${pct(safe)} of the LP is burned or locked`
          : `${status === "bad" ? "Most of the liquidity" : "Some of the liquidity"} can be pulled: only ${pct(safe)} of the LP is burned or locked`,
      source: "Blockscout",
    });
  }
  return out;
}

function holderChecks(h: TokenHolders | null, creator: string | null, chain: string): Check[] {
  const src = chain === "solana" ? "Solana RPC" : "Blockscout";
  if (!h) return [{ id: "holders", status: "unknown", text: "Couldn't read the holders", source: src }];
  const out: Check[] = [];
  const top10 = level(h.top10Pct, LIMITS.top10);
  out.push({
    id: "top10",
    status: top10,
    text: `Top 10 wallets hold ${pct(h.top10Pct)} of the supply${top10 === "ok" ? "" : top10 === "bad" ? ": a few can dump on everyone" : ": concentrated"}`,
    source: src,
  });
  const largest = h.top.find((x) => !aside(x));
  if (largest && level(largest.pct, LIMITS.largest) !== "ok") {
    out.push({
      id: "largest",
      status: level(largest.pct, LIMITS.largest),
      text: `One wallet holds ${pct(largest.pct)}`,
      source: src,
    });
  }
  if (creator) {
    const dev = h.top.find((x) => x.role === "creator");
    const status = dev ? level(dev.pct, LIMITS.creator) : "ok";
    out.push({
      id: "creator",
      status,
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

function tradingChecks(f: TokenFacts, wallets: Wallet[] | null): Check[] {
  const src = "GeckoTerminal";
  if (!f.trades) {
    return f.pairs?.length
      ? [{ id: "trades", status: "unknown", text: "Couldn't read the latest trades", source: src }]
      : [];
  }
  if (f.trades.length < LIMITS.sample || !wallets) {
    return [{ id: "trades", status: "ok", text: `Only ${f.trades.length} trades lately: too few to judge`, source: src }];
  }
  const out: Check[] = [];
  const churn = churnShare(wallets);
  const churnLevel = level(churn, LIMITS.churn);
  out.push({
    id: "wash",
    status: churnLevel,
    text:
      churnLevel === "ok"
        ? "No sign of wash trading in the latest trades"
        : `${churnLevel === "bad" ? "Looks like wash trading" : "Some wash trading"}: ${pct(churn)} of the volume is wallets buying and selling the same back and forth`,
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
      out.push({ id: "buyers", status: "warn", text: `3 wallets did ${pct(share)} of the buying`, source: src });
  }
  if (buys.length >= 1.5 * sells.length && sells.length > 0 && sellUsd > 1.2 * buyUsd) {
    out.push({
      id: "dumping",
      status: "warn",
      text: `Many small buys, a few big sells: ${buys.length} buys for ${usd(buyUsd)}, ${sells.length} sells for ${usd(sellUsd)}`,
      source: src,
    });
  } else if (sellUsd >= 2 * buyUsd && sellUsd >= 1_000) {
    out.push({
      id: "selling",
      status: "warn",
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
  const holders = f.holders ? holdersOf(f.holders, f.creator) : null;
  const wallets = f.trades ? byWallet(f.trades, f.label) : null;

  const groups: [TokenCheck["group"], Check[]][] = [
    ["contract", contractChecks(f.contract, f.chain)],
    ["liquidity", liquidityChecks(f, marketCap)],
    ["holders", holderChecks(holders, f.creator, f.chain)],
    ["trading", tradingChecks(f, wallets)],
  ];
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
    creator: f.creator,
    updatedAt: f.now,
  };
}
