import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

const asked: { users: string[] | null }[] = [];
vi.mock("@/lib/accounts", () => ({
  accountsEnabled: () => true,
  topCallerIds: async () => ["top1", "top2"],
  feed: async (q: { users: string[] | null }) => {
    asked.push(q);
    return [];
  },
}));
vi.mock("@/lib/api-auth", () => ({
  requireAccount: async (req: Request) =>
    req.headers.get("authorization") === "Bearer good"
      ? { id: "me" }
      : NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 }),
}));

const get = async (qs: string, token?: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://x/api/feed?${qs}`, token ? { headers: { authorization: `Bearer ${token}` } } : {}));
};

describe("GET /api/feed", () => {
  it("scope=you is the signed-in caller's own, and needs a session", async () => {
    asked.length = 0;
    expect((await get("scope=you")).status).toBe(401);
    expect(asked).toEqual([]);

    expect((await get("scope=you&u=me", "good")).status).toBe(200);
    expect(asked[0].users).toEqual(["me"]);
  });

  it("scope=top is the top callers, everyone otherwise", async () => {
    asked.length = 0;
    await get("scope=top");
    await get("");
    expect(asked.map((q) => q.users)).toEqual([["top1", "top2"], null]);
  });
});
