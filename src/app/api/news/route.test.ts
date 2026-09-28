import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const queries: Record<string, unknown>[] = [];
const view = (symbol: string) => ({ id: `solana:${symbol}`, chainId: "solana", address: symbol, symbol, name: symbol });
vi.mock("@/lib/rankr", () => ({
  queryTokens: async (q: Record<string, unknown>) => {
    queries.push(q);
    return { total: 2, tokens: q.ids ? [view("BUKANGI")] : q.sort === "hot" ? [view("A"), view("B")] : [view("B"), view("C")] };
  },
}));
vi.mock("@/lib/news", () => ({ newsFor: async (tokens: { symbol: string }[]) => tokens.map((t) => ({ id: t.symbol })) }));

const get = async (qs: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://x/api/news?${qs}`));
};

describe("GET /api/news", () => {
  it("looks up one token by id, and refuses what isn't one", async () => {
    expect((await get("token=solana:not-an-address")).status).toBe(400);
    expect((await get("token=bad")).status).toBe(400);

    queries.length = 0;
    const address = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
    const res = await get(`token=solana:${address}`);
    expect(res.status).toBe(200);
    expect(queries[0].ids).toEqual([`solana:${address}`]);
    expect((await res.json()).tokens.map((t: { symbol: string }) => t.symbol)).toEqual(["BUKANGI"]);
  });

  it("without a token: the most pasted and the top tokens, each once, without dead ones", async () => {
    queries.length = 0;
    const body = await (await get("")).json();
    expect(queries.map((q) => [q.sort, q.hideDead])).toEqual([["hot", true], ["top", true]]);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["A", "B", "C"]);
  });
});
