import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const asked: string[] = [];
vi.mock("@/lib/news", () => ({
  liveNews: async () => {
    asked.push("live");
    return [{ id: "live" }];
  },
  searchNews: async (q: string) => {
    asked.push(`search:${q}`);
    return [{ id: q }];
  },
}));

const get = async (qs: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://x/api/news?${qs}`));
};

describe("GET /api/news", () => {
  it("is the live news without a search, and a search's headlines with one", async () => {
    asked.length = 0;
    expect((await (await get("")).json()).items).toEqual([{ id: "live" }]);
    expect((await (await get("q=%20bukangi%20")).json()).items).toEqual([{ id: "bukangi" }]);
    expect(asked).toEqual(["live", "search:bukangi"]);
  });

  it("refuses a very long search", async () => {
    expect((await get(`q=${"x".repeat(101)}`)).status).toBe(400);
  });
});
