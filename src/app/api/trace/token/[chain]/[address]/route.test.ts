import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { TraceError } from "@/lib/trace/errors";

const state = vi.hoisted(() => ({ official: true }));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTraceAccess: async () =>
      state.official ? null : NextResponse.json({ error: "Trace is private for now.", code: "private" }, { status: 403 }),
  };
});
vi.mock("@/lib/trace", async () => ({
  TraceError,
  traceToken: async (chain: string, address: string) => {
    if (address.startsWith("Wallet")) throw new TraceError("invalid", "That isn't a token's address.");
    return { chain, address, verdict: "clear" };
  },
}));

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

  it("is closed to accounts that aren't official", async () => {
    state.official = false;
    expect((await get("solana", "MemeMint", "3.3.3.3")).status).toBe(403);
    state.official = true;
  });
});
