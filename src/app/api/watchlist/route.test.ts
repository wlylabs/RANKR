import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const asked: string[][] = [];
vi.mock("@/lib/rankr", () => ({
  watchlistOf: async (ids: string[]) => {
    asked.push(ids);
    return ids.map((id) => ({ id, token: null, market: null }));
  },
}));

describe("GET /api/watchlist", () => {
  it("takes only real token ids, EVM ones in lower case, each once", async () => {
    const { GET } = await import("./route");
    const sui = "sui:0x2::sui::SUI";
    const ids = [
      "solana:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      "base:0xAbCdEf0123456789aBcDeF0123456789AbCdEf01",
      "base:0xabcdef0123456789abcdef0123456789abcdef01",
      sui,
      "solana:not-an-address",
      ":7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      "BAD CHAIN:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    ];
    const res = await GET(new NextRequest(`http://x/api/watchlist?ids=${ids.map(encodeURIComponent).join(",")}`));
    expect(res.status).toBe(200);
    expect(asked[0]).toEqual([
      "solana:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      "base:0xabcdef0123456789abcdef0123456789abcdef01",
      sui,
    ]);
  });
});
