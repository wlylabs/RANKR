// Made-up token reports for RANKR_MOCK=1: the same facts for the same address, run through the real checks.
// About a third come out clean, a third worth a look, a third with warning signs.
import type { Pair } from "../dexscreener";
import type { TraceChain } from "./chains";
import { hash, mockAddress, rng } from "./mock";
import type { LaunchBuy, RawHolder, RawTrade, TokenFacts } from "./token-assess";

export function mockTokenFacts(chain: TraceChain, address: string, now = Date.now()): TokenFacts {
  const r = rng(`token:${chain.id}:${address}`);
  const mood = hash(address) % 3; // 0 clean, 1 worth a look, 2 warning signs
  const at = (seed: string) => mockAddress(chain, `${address}/${seed}`);
  const pool = at("pool");
  const symbol = ["MOON", "PEPE2", "CAT", "WIF", "GIGA"][hash(address) % 5];
  const liquidity = mood === 2 ? 4_000 + r() * 5_000 : 40_000 + r() * 400_000;
  const mcap = liquidity * (8 + r() * 20);
  const counts = (scale: number) => ({ buys: Math.round(scale * (0.8 + r())), sells: Math.round(scale * (0.5 + r())) });
  const pair: Pair = {
    chainId: chain.id,
    dexId: chain.kind === "solana" ? "pumpswap" : "uniswap",
    url: `https://dexscreener.com/${chain.id}/${pool}`,
    pairAddress: pool,
    baseToken: { address, name: `${symbol} Coin`, symbol },
    quoteToken: { address: at("quote"), name: chain.native, symbol: chain.native },
    priceUsd: String(mcap / 1e9),
    liquidity: { usd: liquidity },
    marketCap: mcap,
    fdv: mcap,
    pairCreatedAt: now - Math.floor((2 + r() * 200) * 3_600_000),
    txns: { m5: counts(12), h1: counts(120), h6: counts(600), h24: counts(2_000) },
    volume: { m5: liquidity * 0.05, h1: liquidity * 0.6, h6: liquidity * 3, h24: liquidity * 9 },
    labels: chain.kind === "evm" ? ["v2"] : undefined,
  };

  // Trades: a crowd of wallets, and for a token with warning signs a few wallets trading back and forth.
  const crowd = Array.from({ length: 60 }, (_, i) => at(`wallet/${i}`));
  const churners = mood === 2 ? [0, 1, 2, 3].map((i) => at(`churner/${i}`)) : [];
  const trades: RawTrade[] = [];
  for (let i = 0; i < 240; i++) {
    const churn = churners.length && i % 2 === 0;
    // Each churner in turn, buying then selling the same amount, over and over.
    const k = i / 2;
    const wallet = churn ? churners[k % churners.length] : crowd[Math.floor(r() * crowd.length)];
    const side = churn ? (Math.floor(k / churners.length) % 2 ? "sell" : "buy") : r() < 0.55 ? "buy" : "sell";
    const usd = churn ? 900 : Math.round(20 + r() ** 3 * 4_000);
    trades.push({ wallet, side, usd, amount: churn ? 250_000 : usd * 300, time: now - i * 40_000, tx: at(`tx/${i}`) });
  }

  const supply = 1e9;
  const shares = [mood === 2 ? 0.24 : 0.04, 0.03, 0.025, 0.02, 0.018, 0.015, 0.012, 0.01, 0.009, 0.008, 0.007, 0.006];
  const list: RawHolder[] = [
    { address: pool, amount: supply * 0.2, role: "pool", label: null },
    ...shares.map((s, i) => ({ address: crowd[i + 5], amount: supply * s, role: null, label: null })),
  ];

  // The deployer, and its launch: a few wallets in the launch block (many, for a token with warning signs).
  const dev = crowd[5];
  const buys: LaunchBuy[] = [
    { wallet: dev, amount: supply * (mood === 2 ? 0.06 : 0.03), phase: "bundle" },
    ...crowd.slice(20, mood === 2 ? 25 : 21).map((wallet) => ({ wallet, amount: supply * 0.07, phase: "bundle" as const })),
    ...crowd.slice(30, mood === 1 ? 38 : 33).map((wallet) => ({ wallet, amount: supply * 0.03, phase: "sniper" as const })),
  ];
  // Who funded the biggest holders: apart, or (a token worth a look or with warning signs) a few from one wallet.
  const funder = at("funder");
  const links = list
    .filter((h) => !h.role)
    .slice(0, 8)
    .map((h, i) => ({
      holder: h.address,
      funder: mood === 2 && i >= 1 && i <= 4 ? dev : mood === 1 && i >= 1 && i <= 5 ? funder : at(`f/${i}`),
    }));

  const facts: TokenFacts = {
    chain: chain.id,
    address,
    pairs: [pair],
    pool: {
      "5m": { buys: 12, sells: 9, buyers: 10, sellers: 8 },
      "1h": { buys: 130, sells: 95, buyers: 70, sellers: 52 },
      "6h": { buys: 640, sells: 520, buyers: 300, sellers: 210 },
      "24h": { buys: 2_100, sells: 1_800, buyers: mood === 1 ? 260 : 820, sellers: mood === 1 ? 190 : 600 },
    },
    trades,
    holders: { supply, count: chain.kind === "evm" ? 1_200 + Math.floor(r() * 9_000) : null, list },
    contract:
      chain.kind === "solana"
        ? {
            kind: "solana",
            token2022: false,
            mintAuthority: null,
            freezeAuthority: mood === 2 ? at("freezer") : null,
            transferFeeBps: null,
            feeAuthority: null,
            permanentDelegate: null,
            transferHook: null,
            nonTransferable: false,
            defaultFrozen: false,
            pausable: null,
            mutableMetadata: mood === 1,
          }
        : {
            kind: "evm",
            verified: mood !== 2,
            proxy: false,
            scam: false,
            sim: { honeypot: false, reason: null, buyTax: 0, sellTax: mood === 2 ? 12 : 0, transferTax: 0 },
            owner: mood === 2 ? dev : "renounced",
            powers: mood === 2 ? ["mint", "blacklist", "fees"] : ["fees"],
          },
    lp: { burnedPct: mood === 2 ? 20 : 100, lockedPct: 0 },
    launch: { reached: true, at: (pair.pairCreatedAt ?? now) + 1_000, buys, creator: dev },
    links,
    history:
      chain.kind === "evm"
        ? { tokens: mood === 2 ? 6 : 0, dead: mood === 2 ? 5 : 0, clones: mood === 2 ? 4 : 0, deadClones: mood === 2 ? 4 : 0 }
        : { tokens: mood === 2 ? 7 : 0, dead: mood === 2 ? 6 : 0 },
    // A token worth a look borrows a bigger one's name.
    copycat: mood === 1 ? { chain: "ethereum", address: at("original"), symbol, liquidityUsd: 8e6, times: 32 } : null,
    supply,
    creator: dev,
    label: () => null,
    now,
  };
  // BSC reads no holders list, launch, funders or deployer: what another source counts instead.
  if (chain.tokensOnly)
    return {
      ...facts,
      holders: null,
      holderSummary: { count: 2_400, top10Pct: mood === 2 ? 58 : 24, source: "GeckoTerminal" },
      // No verified ABI to read: what its owner can do isn't known.
      contract: facts.contract && { ...facts.contract, ...(facts.contract.kind === "evm" && { powers: null }) },
      lp: undefined,
      launch: undefined,
      links: undefined,
      history: undefined,
      creator: null,
    };
  return facts;
}
