import { afterEach, describe, expect, it } from "vitest";
import { resetBudgets, take, usage } from "../budget";
import { traceChain } from "./chains";
import { blockscoutKey, evmRpcUrl, keyScope, needKeyFor, solanaRpcUrls, withKeys } from "./keys";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  resetBudgets();
});

const user = (blockscout: string | null, helius: string | null) => ({ userId: "u1", blockscout, helius });

describe("trace keys", () => {
  it("reads the site's keys from the environment outside an account's scope", async () => {
    process.env.BLOCKSCOUT_API_KEY = "site-key";
    process.env.SOLANA_RPC_URL = "https://a.example, https://b.example";
    process.env.BASE_RPC_URL = "https://base.example";
    expect(blockscoutKey()).toBe("site-key");
    expect(solanaRpcUrls()).toEqual(["https://a.example", "https://b.example"]);
    expect(evmRpcUrl("base")).toBe("https://base.example");
    expect(keyScope()).toBe("");
  });

  it("never hands an account the site's keys", async () => {
    process.env.BLOCKSCOUT_API_KEY = "site-key";
    process.env.SOLANA_RPC_URL = "https://site.example";
    process.env.BASE_RPC_URL = "https://base.example";
    await withKeys(user(null, null), async () => {
      expect(blockscoutKey()).toBeUndefined();
      expect(solanaRpcUrls()).toEqual([]);
      expect(evmRpcUrl("base")).toBeUndefined();
      expect(keyScope()).toBe("u:u1:");
    });
    await withKeys(user("own-bs", "own-helius-key-0000"), async () => {
      expect(blockscoutKey()).toBe("own-bs");
      expect(solanaRpcUrls()).toEqual(["https://mainnet.helius-rpc.com/?api-key=own-helius-key-0000"]);
    });
  });

  it("says which key a chain needs, only for an account on its own keys", async () => {
    const solana = traceChain("solana")!;
    const base = traceChain("base")!;
    const bsc = traceChain("bsc")!;
    expect(() => needKeyFor(solana)).not.toThrow();
    await withKeys(user(null, null), async () => {
      expect(() => needKeyFor(solana)).toThrow(/Helius/);
      expect(() => needKeyFor(base)).toThrow(/Blockscout/);
      expect(() => needKeyFor(bsc)).not.toThrow();
    });
  });

  it("gives each account its own budgets, apart from the site's", async () => {
    process.env.BLOCKSCOUT_API_KEY = "site-key";
    process.env.BLOCKSCOUT_DAILY_CREDITS = "40";
    expect(await take("blockscout", 20)).toBe(true);
    expect(await take("blockscout", 20)).toBe(true);
    expect(await take("blockscout", 20)).toBe(false);
    // The account's budget is the free plan's, untouched by the site's spending (or its env limit).
    await withKeys(user("own-bs", null), async () => {
      expect(await take("blockscout", 20)).toBe(true);
      const row = (await usage()).find((r) => r.id === "blockscout")!;
      expect(row.limit).toBe(90_000);
      expect(row.used).toBeGreaterThanOrEqual(20);
      expect(row.used).toBeLessThan(1_000);
    });
  });
});
