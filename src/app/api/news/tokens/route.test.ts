import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

let fail = false;
vi.mock("@/lib/dexscreener", () => ({ UpstreamError: class UpstreamError extends Error {} }));
vi.mock("@/lib/news", async () => {
  const { UpstreamError } = await import("@/lib/dexscreener");
  return {
    namesakes: async () => {
      if (fail) throw new UpstreamError("down");
      return [
        { chainId: "solana", address: "AAA", symbol: "BUKANGI", liquidityUsd: 50_000 },
        { chainId: "solana", address: "BBB", symbol: "BUKANGI", liquidityUsd: 7_000 },
      ];
    },
  };
});
vi.mock("@/lib/rankr", () => ({
  queryTokens: async (q: { ids: string[] }) => ({
    total: 1,
    tokens: q.ids.includes("solana:BBB") ? [{ id: "solana:BBB", multiple: 4.2 }] : [],
  }),
}));
vi.mock("@/lib/rate-limit", () => ({ hit: async () => ({ ok: true }), untilReset: () => "1m" }));

const get = async (qs: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://x/api/news/tokens?${qs}`));
};

describe("GET /api/news/tokens", () => {
  it("needs a name or a ticker", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get(`name=${"x".repeat(65)}`)).status).toBe(400);
  });

  it("gives the namesakes with Rankr's multiple for the tracked ones", async () => {
    const body = await (await get("name=Bukangi&symbol=BUKANGI")).json();
    expect(body.items.map((i: { market: { address: string }; multiple: number | null }) => [i.market.address, i.multiple])).toEqual([
      ["AAA", null],
      ["BBB", 4.2],
    ]);
  });

  it("says so when DexScreener isn't answering", async () => {
    fail = true;
    const res = await get("symbol=BUKANGI");
    fail = false;
    expect(res.status).toBe(502);
  });
});
