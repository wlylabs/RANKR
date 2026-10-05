// Paper trades: what a buy of any amount, and selling it back later, would roughly fill at, from public data
// only (DexScreener's pair). No real money and no quote from a DEX: an estimate, and labeled as one.
//
// The model ("fill-v1"), the same for every DEX with its own fee and depth:
// - The pool is constant product, x·y = k, with depth D: the USD on its quote side (SOL, WETH, USDC...), the
//   side a sell is paid out of. Uniswap v2's getAmountOut, Raydium AMM/CPMM, PumpSwap and pump.fun's bonding
//   curve are all this shape.
// - Buy with A: a = (A - network) · (1 - fee); tokens = (a / P) / (1 + a / D). Price impact a / D.
// - Sell `tokens` at P2 into depth D2: V = tokens · P2; proceeds = V · (1 - fee) / (1 + V / D2) - network.
// - A paper buy doesn't move the real pool, so a sell is priced on the live pool, not one that remembers it.
// Not modeled: bots and MEV, token taxes, launch fees, failed transactions, routing over several pools. For
// concentrated-liquidity pools (Uniswap v3/v4, CLMM, DLMM, Whirlpools) depth from TVL is only a rough proxy.
// References: Uniswap v2-periphery UniswapV2Library.getAmountOut; pump.fun's pump-sdk (bondingCurve.ts) and
// pump-swap-sdk (mainnet fee config, 2026-09-08); Raydium, PancakeSwap and Aerodrome fee docs.

import type { MarketSnapshot } from "./types";

export const SIM_MODEL = "fill-v1";
/**
 * A quote older than this isn't a price to fill at (DexScreener down, or a budget used up, serves the last one):
 * a few refreshes' worth, with room for a client clock a little off the server's.
 */
export const MAX_QUOTE_AGE_MS = 120_000;

/** Whether the pair's data is recent enough to fill a paper trade at. */
export function isFresh(m: MarketSnapshot, now = Date.now()): boolean {
  return now - m.fetchedAt <= MAX_QUOTE_AGE_MS;
}

/** Price impact worth a warning, and one big enough to ask again before a paper buy (Uniswap's thresholds). */
/**
 * Slippage set for you, as a wallet's "Auto" does: room for the price to move between the quote and the swap.
 * Deep pools move least in those seconds and thin or roughly known ones most: 1% from $1M of liquidity, 5% under
 * $50K or on a rough estimate, 3% between. A swap with a large price impact gets half of it on top (others
 * trade into the same thin pool first), up to 15%.
 */
export function autoSlippage(m: MarketSnapshot, impact: number): number {
  const liquidity = m.liquidityUsd ?? 0;
  const base = poolOf(m).quality !== "good" || liquidity < 50_000 ? 0.05 : liquidity >= 1_000_000 ? 0.01 : 0.03;
  const slippage = Math.min(0.15, base + (Number.isFinite(impact) && impact > 0 ? impact / 2 : 0));
  return Math.round(slippage * 1000) / 1000;
}

export const WARN_IMPACT = 0.05;
export const CONFIRM_IMPACT = 0.15;

/** good: a constant-product pool with known depth. rough: depth or fee is a guess. none: no depth at all. */
export type Quality = "good" | "rough" | "none";

export type Pool = {
  /** Swap fee, as a fraction (0.0125 = 1.25%), each way. */
  fee: number;
  /** USD on the quote side, or null when unknown; 0 when the pool reports nothing left (drained, rugged). */
  depthUsd: number | null;
  /** Network costs per trade, in USD. */
  networkUsd: number;
  quality: Quality;
  /** pump.fun's bonding curve: the token hasn't graduated to a pool yet. */
  curve: boolean;
  /** Nothing on the quote side: no buy fills, and a sale brings in nothing. */
  drained: boolean;
};

const SOL = new Set(["SOL", "WSOL"]);

// pump.fun's curve: k = 30 SOL · 1,073,000,000 virtual tokens, 1B supply, so a market cap in SOL gives the
// curve's virtual SOL reserve: vSol = sqrt(32.19 · mcapSol). It graduates at about 115 virtual SOL.
const CURVE_K = 32.19;
const CURVE_GRADUATES = 115;

// PumpSwap's canonical pools: the fee falls with the market cap in SOL (pump-swap-sdk mainnet fee config,
// 2026-09-08). Between the tiers known for sure, the higher fee.
const PUMPSWAP_TIERS: [number, number][] = [
  [98_240, 0.003],
  [49_120, 0.0055],
  [9_820, 0.0095],
  [4_420, 0.01],
  [3_440, 0.0105],
  [2_460, 0.011],
  [1_470, 0.0115],
  [420, 0.012],
  [0, 0.0125],
];

/** Pools whose depth isn't spread like x·y = k: TVL says little about how a trade would move them. */
const CONCENTRATED = /^(v3|v4|clmm|dlmm|whirlpool|slipstream|cl)$/i;

/** Network costs per trade, in USD; on Solana about 0.002 SOL (base fee, priority fee, tip). */
const NETWORK_USD: Record<string, number> = {
  ethereum: 3,
  base: 0.05,
  arbitrum: 0.05,
  optimism: 0.05,
  polygon: 0.02,
  bsc: 0.1,
  robinhood: 0.05,
};

/** USD per unit of the pair's quote coin, from the price in USD and in the quote coin. */
export function quoteUsdOf(m: MarketSnapshot): number | null {
  return m.priceNative && m.priceNative > 0 && m.priceUsd > 0 ? m.priceUsd / m.priceNative : null;
}

function feeOf(m: MarketSnapshot, concentrated: boolean, mcapSol: number | null): { fee: number; known: boolean } {
  const v2 = (m.labels ?? []).some((l) => /^v2$/i.test(l));
  switch (m.dexId) {
    case "pumpfun":
      return { fee: 0.0125, known: true };
    case "pumpswap":
      return mcapSol === null
        ? { fee: 0.0125, known: false }
        : { fee: PUMPSWAP_TIERS.find(([min]) => mcapSol >= min)![1], known: true };
    case "raydium":
      // AMM v4 is 0.25%; CPMM pools pick their own tier (0.25% by default, up to 4%).
      return concentrated ? { fee: 0.01, known: false } : { fee: 0.0025, known: !(m.labels ?? []).some((l) => /^cpmm$/i.test(l)) };
    case "uniswap":
    case "sushiswap":
      return v2 ? { fee: 0.003, known: true } : { fee: 0.01, known: false };
    case "pancakeswap":
      return v2 ? { fee: 0.0025, known: true } : { fee: 0.01, known: false };
    case "aerodrome":
      return concentrated ? { fee: 0.01, known: false } : { fee: 0.003, known: true };
    default:
      return { fee: 0.01, known: false };
  }
}

/** How a pair would fill: its fee, its depth and what each trade costs in network fees. */
export function poolOf(m: MarketSnapshot): Pool {
  const quoteUsd = quoteUsdOf(m);
  const solQuote = SOL.has((m.quoteSymbol ?? "").toUpperCase());
  const mcapSol = solQuote && quoteUsd && m.marketCap ? m.marketCap / quoteUsd : null;
  const concentrated =
    (m.labels ?? []).some((l) => CONCENTRATED.test(l)) || ["orca", "meteora", "uniswapv4"].includes(m.dexId);
  const { fee, known } = feeOf(m, concentrated, mcapSol);
  const networkUsd = m.chainId === "solana" ? (solQuote && quoteUsd ? 0.002 * quoteUsd : 0.3) : (NETWORK_USD[m.chainId] ?? 0.3);

  // pump.fun's curve: its depth follows from the market cap, exactly, for a standard 1B-supply coin.
  if (m.dexId === "pumpfun" && mcapSol !== null && mcapSol > 0 && quoteUsd) {
    return { fee, depthUsd: Math.sqrt(CURVE_K * mcapSol) * quoteUsd, networkUsd, quality: "good", curve: true, drained: false };
  }
  // A pool: half its TVL, or less if its quote side holds less (only that side pays a sell out). A side that
  // reports 0 is drained, not unknown: a rug leaves the price behind and nothing to sell into.
  const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const tvl = num(m.liquidityUsd);
  const quoteLeft = num(m.liquidityQuote);
  const half = tvl === null ? null : tvl / 2;
  const quoteSide = quoteLeft !== null && quoteUsd ? quoteLeft * quoteUsd : null;
  const depthUsd = half !== null && quoteSide !== null ? Math.min(half, quoteSide) : (half ?? quoteSide);
  const drained = depthUsd !== null && !(depthUsd > 1e-9);
  const quality: Quality =
    depthUsd === null ? "none" : concentrated || !known || m.dexId === "pumpfun" ? "rough" : "good";
  return { fee, depthUsd: drained ? 0 : depthUsd, networkUsd, quality, curve: m.dexId === "pumpfun", drained };
}

export type BuyFill = {
  spentUsd: number;
  tokens: number;
  /** Spent / tokens: the price paid, all costs in. */
  fillPriceUsd: number;
  /** The market price the buy was priced on. */
  priceUsd: number;
  feeUsd: number;
  networkUsd: number;
  /** How far above the market price the buy fills, from moving the pool (0.03 = 3%). */
  impact: number;
  quality: Quality;
  /** The buy alone would take a pump.fun coin past its graduation: the curve estimate stops holding. */
  completesCurve: boolean;
};

/**
 * A paper buy of `spendUsd` at the pair's price now; null without a price, into a drained pool, or with nothing
 * left after costs.
 */
export function quoteBuy(m: MarketSnapshot, spendUsd: number): BuyFill | null {
  const p = m.priceUsd;
  if (!(p > 0) || !(spendUsd > 0)) return null;
  const pool = poolOf(m);
  if (pool.drained) return null;
  const networkUsd = Math.min(pool.networkUsd, spendUsd);
  const a = (spendUsd - networkUsd) * (1 - pool.fee);
  if (!(a > 0)) return null;
  const impact = pool.depthUsd !== null ? a / pool.depthUsd : 0;
  const tokens = a / p / (1 + impact);
  const quoteUsd = quoteUsdOf(m);
  const completesCurve =
    pool.curve && !!pool.depthUsd && !!quoteUsd && (pool.depthUsd + a) / quoteUsd > CURVE_GRADUATES;
  return {
    spentUsd: spendUsd,
    tokens,
    fillPriceUsd: spendUsd / tokens,
    priceUsd: p,
    feeUsd: (spendUsd - networkUsd) * pool.fee,
    networkUsd,
    impact,
    quality: completesCurve && pool.quality === "good" ? "rough" : pool.quality,
    completesCurve,
  };
}

export type SellFill = {
  /** Tokens · price now: what they're worth at the market price, before any costs. */
  valueUsd: number;
  /** What selling them now would bring in, all costs out. */
  proceedsUsd: number;
  feeUsd: number;
  networkUsd: number;
  /** How far below the market price the sell fills (0.03 = 3%). */
  impact: number;
  quality: Quality;
};

/**
 * What selling `tokens` into the pool brings in before network costs: V(1 - fee) / (1 + V / D). Nothing from a
 * drained pool. Selling more in one go always brings in less per token, so part sales on the same pool are
 * priced as what they add to the whole (see src/lib/paper.ts).
 */
export function grossSell(m: MarketSnapshot, tokens: number): number {
  const p = m.priceUsd;
  if (!(p > 0) || !(tokens > 0)) return 0;
  const pool = poolOf(m);
  if (pool.drained) return 0;
  const valueUsd = tokens * p;
  return (valueUsd * (1 - pool.fee)) / (1 + (pool.depthUsd !== null ? valueUsd / pool.depthUsd : 0));
}

/** Selling `tokens` now; null without a price. */
export function quoteSell(m: MarketSnapshot, tokens: number): SellFill | null {
  const p = m.priceUsd;
  if (!(p > 0) || !(tokens > 0)) return null;
  const pool = poolOf(m);
  const valueUsd = tokens * p;
  const gross = grossSell(m, tokens);
  const ratio = pool.drained ? Infinity : pool.depthUsd !== null ? valueUsd / pool.depthUsd : 0;
  return {
    valueUsd,
    proceedsUsd: Math.max(0, gross - pool.networkUsd),
    feeUsd: pool.drained ? 0 : valueUsd * pool.fee,
    networkUsd: Math.min(pool.networkUsd, gross),
    impact: pool.drained ? 1 : ratio / (1 + ratio),
    quality: pool.quality,
  };
}

/**
 * The pair as it would be had the price moved `k` times (2 = doubled, 0.5 = halved) through trading in an
 * x·y = k pool: each side's reserve moves by √k, so the depth a sell meets grows with the price. Only "if the
 * liquidity holds": a pulled pool skips past any level.
 */
export function atMultiple(m: MarketSnapshot, k: number): MarketSnapshot {
  const r = Math.sqrt(k);
  const scale = (v: number | null | undefined, by: number) => (v == null ? v : v * by);
  return {
    ...m,
    priceUsd: m.priceUsd * k,
    priceNative: scale(m.priceNative, k),
    marketCap: scale(m.marketCap, k) ?? null,
    fdv: scale(m.fdv, k) ?? null,
    liquidityUsd: scale(m.liquidityUsd, r) ?? null,
    liquidityQuote: scale(m.liquidityQuote, r),
  };
}

