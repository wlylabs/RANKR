// Made-up token reports for RANKR_MOCK=1: the same facts for the same address, run through the real checks.
// About a third come out clean, a third worth a look, a third with warning signs.
import type { Pair } from "../dexscreener";
import type { TraceChain } from "./chains";
import { hash, mockAddress, rng } from "./mock";
import type { RawHolder, RawTrade, TokenFacts } from "./token-assess";

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
  const churners = mood === 2 ? crowd.slice(0, 4) : [];
  const trades: RawTrade[] = [];
  for (let i = 0; i < 240; i++) {
    const churn = churners.length && i % 2 === 0;
    const wallet = churn ? churners[i % churners.length] : crowd[Math.floor(r() * crowd.length)];
    const side = churn ? (Math.floor(i / 2) % 2 ? "sell" : "buy") : r() < 0.55 ? "buy" : "sell";
    trades.push({
      wallet,
      side,
      usd: churn ? 900 : Math.round(20 + r() ** 3 * 4_000),
      time: now - i * 40_000,
      tx: at(`tx/${i}`),
    });
  }

  const supply = 1e9;
  const shares = [mood === 2 ? 0.24 : 0.04, 0.03, 0.025, 0.02, 0.018, 0.015, 0.012, 0.01, 0.009, 0.008, 0.007, 0.006];
  const list: RawHolder[] = [
    { address: pool, amount: supply * 0.2, role: "pool", label: null },
    ...shares.map((s, i) => ({ address: crowd[i + 5], amount: supply * s, role: null, label: null })),
  ];

  return {
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
          }
        : {
            kind: "evm",
            verified: mood !== 2,
            proxy: false,
            scam: false,
            sim: { honeypot: false, reason: null, buyTax: 0, sellTax: mood === 2 ? 12 : 0, transferTax: 0 },
          },
    lp: chain.kind === "evm" ? { burnedPct: mood === 2 ? 20 : 100, lockedPct: 0 } : undefined,
    creator: chain.kind === "evm" ? crowd[5] : null,
    label: () => null,
    now,
  };
}
