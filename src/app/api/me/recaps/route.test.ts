import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

const asked: string[] = [];
vi.mock("@/lib/accounts", () => ({
  myRecaps: async (account: { id: string }) => {
    asked.push(account.id);
    return [{ month: "2026-09-01", calls: 1, hits: 1, wins: 1, avgMultiple: 2, bestMultiple: 2, bestToken: null, topTier: 2 }];
  },
}));
vi.mock("@/lib/api-auth", () => ({
  requireAccount: async (req: Request) =>
    req.headers.get("authorization") === "Bearer good"
      ? { id: "me" }
      : NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 }),
}));

const get = async (token?: string) => {
  const { GET } = await import("./route");
  return GET(new Request("http://x/api/me/recaps", token ? { headers: { authorization: `Bearer ${token}` } } : {}));
};

describe("GET /api/me/recaps", () => {
  it("needs a session, and reads only that account's recaps, never cached in between", async () => {
    expect((await get()).status).toBe(401);
    expect(asked).toEqual([]);

    const res = await get("good");
    expect(res.status).toBe(200);
    expect(asked).toEqual(["me"]);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).recaps).toHaveLength(1);
  });
});
