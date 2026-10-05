import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: true,
  keys: null as { userId: string; blockscout: string | null; helius: string | null } | null,
}));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    traceCaller: async () =>
      state.signedIn ? { keys: state.keys } : NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 }),
  };
});

const get = async () => {
  const { GET } = await import("./route");
  return GET(new NextRequest("http://x/api/trace/usage"));
};

describe("GET /api/trace/usage", () => {
  it("lists the budgets, never cached", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resources.map((r: { id: string }) => r.id)).toContain("geckoterminal");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("shows an account on its own keys its own budgets, and says which keys it hasn't added", async () => {
    state.keys = { userId: "u1", blockscout: null, helius: null };
    const body = await (await get()).json();
    const row = (id: string) => body.resources.find((r: { id: string }) => r.id === id);
    expect(row("blockscout").off).toBe("Not set up: add your Blockscout API key.");
    expect(row("solana").off).toBe("Not set up: add your Helius API key.");
    state.keys = null;
  });

  it("is for signed-in accounts", async () => {
    state.signedIn = false;
    expect((await get()).status).toBe(401);
    state.signedIn = true;
  });
});
