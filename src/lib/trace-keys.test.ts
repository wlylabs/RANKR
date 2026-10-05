import { describe, expect, it } from "vitest";
import { checkBlockscout, checkHelius, parseBlockscout, parseHelius } from "./trace-keys";

const answer = (status: number) => (async () => new Response("{}", { status })) as unknown as typeof fetch;

describe("trace keys: parsing and checking", () => {
  it("takes a Helius key alone or in its RPC URL, nothing else", () => {
    const key = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
    expect(parseHelius(` ${key} `)).toBe(key);
    expect(parseHelius(`https://mainnet.helius-rpc.com/?api-key=${key}`)).toBe(key);
    expect(parseHelius(`https://evil.example/?api-key=${key}`)).toBeNull();
    expect(parseHelius("short")).toBeNull();
    expect(parseHelius("has spaces in it 1234567890")).toBeNull();
  });

  it("takes a Blockscout key as one token", () => {
    expect(parseBlockscout(" abcDEF_123-xyz ")).toBe("abcDEF_123-xyz");
    expect(parseBlockscout("a b")).toBeNull();
    expect(parseBlockscout("tiny")).toBeNull();
  });

  it("turns a key down only when its provider does", async () => {
    expect(await checkHelius("k", answer(401))).toBe(false);
    expect(await checkHelius("k", answer(200))).toBe(true);
    expect(await checkBlockscout("k", answer(403))).toBe(false);
    expect(await checkBlockscout("k", answer(500))).toBe(true);
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await checkBlockscout("k", down)).toBe(true);
  });
});
