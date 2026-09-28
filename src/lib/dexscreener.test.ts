import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTokens } from "./dexscreener";

const pair = (chainId: string, address: string, symbol: string, liquidity: number, dexId = "raydium") => ({
  chainId,
  dexId,
  url: `https://dexscreener.com/${chainId}/${address}-${dexId}`,
  pairAddress: `${address}-${dexId}`,
  baseToken: { address, name: symbol, symbol },
  priceUsd: "0.001",
  liquidity: { usd: liquidity },
  volume: { h24: 1_000 },
  txns: { h24: { buys: 30, sells: 12 } },
});

describe("searchTokens", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives each token once, from its most liquid pair; same ticker, different address stays apart", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({
        pairs: [
          pair("solana", "AAA", "BUKANGI", 1_000, "pumpswap"),
          pair("solana", "AAA", "BUKANGI", 50_000, "raydium"),
          pair("solana", "BBB", "BUKANGI", 7_000),
          pair("base", "0xccc", "BUKANGI", 2_000, "aerodrome"),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tokens = await searchTokens("BUKANGI");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/latest/dex/search?q=BUKANGI");
    expect(tokens[0].txns24h).toBe(42); // buys and sells in the last 24 hours
    expect(tokens.map((t) => [t.chainId, t.address, t.dexId, t.liquidityUsd])).toEqual([
      ["solana", "AAA", "raydium", 50_000],
      ["solana", "BBB", "raydium", 7_000],
      ["base", "0xccc", "aerodrome", 2_000],
    ]);
  });
});
