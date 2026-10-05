import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { TraceError } from "@/lib/trace/errors";

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
vi.mock("@/lib/trace", async () => {
  const { ownKeys } = await import("@/lib/trace/keys");
  return {
    TraceError,
    traceToken: async (chain: string, address: string) => {
      if (address.startsWith("Wallet")) throw new TraceError("invalid", "That isn't a token's address.");
      const own = ownKeys();
      return own ? { chain, address, verdict: "clear", on: own.userId } : { chain, address, verdict: "clear" };
    },
  };
});

const get = async (chain: string, address: string, ip = "1.1.1.1") => {
  const { GET } = await import("./route");
  const req = new NextRequest(`http://x/api/trace/token/${chain}/${address}`, { headers: { "x-forwarded-for": ip } });
  return GET(req, { params: Promise.resolve({ chain, address }) });
};

describe("GET /api/trace/token/:chain/:address", () => {
  it("reads the token's report, for the browser alone to keep", async () => {
    const res = await get("solana", "%20MemeMint");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chain: "solana", address: "MemeMint", verdict: "clear" });
    expect(res.headers.get("cache-control")).toBe("private, max-age=30");
  });

  it("answers an address that isn't a token with the reason", async () => {
    const res = await get("solana", "WalletAddress", "2.2.2.2");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That isn't a token's address.", code: "invalid" });
  });

  it("reads on the caller's own keys when it has to bring them", async () => {
    state.keys = { userId: "u1", blockscout: null, helius: "h".repeat(36) };
    expect(await (await get("solana", "MemeMint", "4.4.4.4")).json()).toMatchObject({ on: "u1" });
    state.keys = null;
  });

  it("is closed to anyone signed out", async () => {
    state.signedIn = false;
    expect((await get("solana", "MemeMint", "3.3.3.3")).status).toBe(401);
    state.signedIn = true;
  });
});
