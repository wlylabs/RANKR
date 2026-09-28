import type { MarketSnapshot } from "./types";

// Synthetic market data for RANKR_MOCK=1: lets the app run offline and gives every
// address a deterministic price that swings over time (some pump, some bleed).

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PREFIX = ["PEPE", "DOGE", "WIF", "BONK", "CAT", "FROG", "CHAD", "GIGA", "MOON", "BASED", "TURBO", "SIGMA"];
const SUFFIX = ["", "AI", "INU", "COIN", "404", "X", "2.0", "KING", "HAT", "CULT"];
const DEX: Record<string, string> = { solana: "pumpswap", base: "aerodrome", ethereum: "uniswap", bsc: "pancakeswap" };

export function mockSnapshot(address: string, chainHint: string | null): MarketSnapshot {
  const h = hash(address);
  const chainId = chainHint ?? (address.startsWith("0x") ? (h % 2 ? "base" : "ethereum") : "solana");
  const symbol = PREFIX[h % PREFIX.length] + SUFFIX[(h >>> 4) % SUFFIX.length];
  const supply = 1_000_000_000;
  const basePrice = (5 + (h % 500)) / 1e7; // $50K - $5M base market cap

  // Slow swing (30-150 min period, up to ~12x amplitude) plus a small fast wobble.
  const t = Date.now() / 60_000;
  const period = 30 + ((h >>> 8) % 120);
  const amp = 0.4 + ((h >>> 12) % 21) / 10;
  const phase = ((h >>> 16) % 628) / 100;
  const swing = amp * Math.sin((2 * Math.PI * t) / period + phase) + 0.08 * Math.sin(t / 1.7 + phase);
  const priceUsd = basePrice * Math.exp(swing);
  const marketCap = priceUsd * supply;

  return {
    chainId,
    address,
    name: `${symbol.charAt(0)}${symbol.slice(1).toLowerCase()} Token`,
    symbol,
    imageUrl: null,
    priceUsd,
    marketCap,
    fdv: marketCap,
    liquidityUsd: marketCap * (0.08 + (h % 7) / 100),
    volume24h: marketCap * (0.5 + (h % 30) / 10),
    priceChange24h: Math.round((Math.exp(swing) - 1) * 1000) / 10,
    txns24h: h % 900,
    pairAddress: `mockpair${h.toString(16)}`,
    dexId: DEX[chainId] ?? "uniswap",
    url: `https://dexscreener.com/${chainId}/${address}`,
    pairCreatedAt: Date.now() - (h % 72) * 3_600_000,
    websites: [{ label: "Website", url: "https://example.com" }],
    socials: [{ label: "twitter", url: "https://x.com/search?q=%24" + symbol }],
    fetchedAt: Date.now(),
  };
}
