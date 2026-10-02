import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { TraceError } from "@/lib/trace/errors";

const asked: string[][] = [];
vi.mock("@/lib/trace", async () => ({
  TraceError,
  traceWallet: async (chain: string, address: string) => {
    asked.push([chain, address]);
    if (address.startsWith("Token")) throw new TraceError("token", "That's a token, not a wallet.");
    return { chain, address };
  },
}));

const get = async (chain: string, address: string, ip: string) => {
  const { GET } = await import("./route");
  const req = new NextRequest(`http://x/api/trace/${chain}/${address}`, { headers: { "x-forwarded-for": ip } });
  return GET(req, { params: Promise.resolve({ chain, address }) });
};

describe("GET /api/trace/:chain/:address", () => {
  it("reads the wallet, trimmed and decoded, and lets only the browser keep it a minute", async () => {
    const res = await get("solana", "%209WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "1.1.1.1");
    expect(res.status).toBe(200);
    expect(asked.at(-1)).toEqual(["solana", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]);
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("answers a wallet it can't trace with the reason and its code", async () => {
    const res = await get("solana", "TokenMintAddress", "2.2.2.2");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "That's a token, not a wallet.", code: "token" });
  });

  it("slows down one visitor reading too many wallets", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await get("solana", `W${i}`, "3.3.3.3")).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });
});
