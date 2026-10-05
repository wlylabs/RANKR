import { afterEach, describe, expect, it } from "vitest";
import { resetBudgets, take, usage } from "../budget";
import { traceChain } from "./chains";
import { blockscoutKey, evmRpcUrl, freeRead, keyScope, onKeysFor, shareRead, solanaRpcUrls, withKeys, type Caller } from "./keys";
import { TraceError } from "./errors";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  resetBudgets();
});

const user = (blockscout: string | null, helius: string | null, allowance?: Caller["allowance"]): Caller => ({
  userId: "u1",
  blockscout,
  helius,
  allowance,
});
const solana = traceChain("solana")!;
const base = traceChain("base")!;
const bsc = traceChain("bsc")!;

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

  it("never hands an account on its own keys the site's", async () => {
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

  it("runs a chain the account has a key for on that key, taking nothing from its allowance", async () => {
    const taken: string[] = [];
    const caller = user("own-bs", null, async (w) => (taken.push(w), true));
    await withKeys(caller, () =>
      onKeysFor(base, "wallet", async () => {
        expect(blockscoutKey()).toBe("own-bs");
        expect(freeRead()).toBe(false);
      }),
    );
    // BSC's reports need no key: on the account's scope, never the site's RPCs.
    process.env.BSC_RPC_URL = "https://site-bsc.example";
    await withKeys(caller, () => onKeysFor(bsc, "report", async () => expect(evmRpcUrl("bsc")).toBeUndefined()));
    expect(taken).toEqual([]);
  });

  it("runs a chain without a key on the site's keys, out of the free allowance", async () => {
    process.env.SOLANA_RPC_URL = "https://site.example";
    let left = 1;
    const caller = user(null, null, async () => left-- > 0);
    await withKeys(caller, () =>
      onKeysFor(solana, "wallet", async () => {
        expect(solanaRpcUrls()).toEqual(["https://site.example"]);
        expect(freeRead()).toBe(true);
        expect(keyScope()).toBe("");
      }),
    );
    const spent = await withKeys(caller, () => onKeysFor(solana, "wallet", async () => "read")).catch((e) => e);
    expect(spent).toBeInstanceOf(TraceError);
    expect((spent as TraceError).code).toBe("allowance");
    // Without an allowance at all: a key is needed.
    const none = await withKeys(user(null, null), () => onKeysFor(base, "wallet", async () => "read")).catch((e) => e);
    expect((none as TraceError).code).toBe("nokey");
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

  it("holds free reads together to their share of the site's budget, keeping the rest for official accounts", async () => {
    process.env.BLOCKSCOUT_API_KEY = "site-key";
    process.env.BLOCKSCOUT_DAILY_CREDITS = "100";
    process.env.TRACE_FREE_SHARE = "0.4";
    const free = user(null, null, async () => true);
    // A day of its own: the counters outlive resetBudgets (rate-limit.ts keeps them).
    const day = Date.UTC(2030, 0, 1);
    const freeTakes = await withKeys(free, () =>
      onKeysFor(base, "wallet", async () => [
        await take("blockscout", 20, day),
        await take("blockscout", 20, day),
        await take("blockscout", 20, day),
      ]),
    );
    expect(freeTakes).toEqual([true, true, false]);
    // The site's own reads still have the 60 left.
    const site = [await take("blockscout", 20, day), await take("blockscout", 20, day), await take("blockscout", 20, day)];
    expect(site).toEqual([true, true, true]);
    expect(await take("blockscout", 20, day)).toBe(false);
  });

  it("lets a caller make its own read when the shared one failed for someone else's reasons", async () => {
    const theirs = { who: "someone-else", value: Promise.reject(new TraceError("allowance", "theirs")) };
    theirs.value.catch(() => {});
    expect(await withKeys(user(null, null), () => shareRead(theirs, async () => "mine"))).toBe("mine");
    const broken = { who: "someone-else", value: Promise.reject(new TraceError("upstream", "down")) };
    broken.value.catch(() => {});
    await expect(withKeys(user(null, null), () => shareRead(broken, async () => "mine"))).rejects.toThrow("down");
  });
});

describe("usage, free reads", () => {
  it("shows the site how much of the free share accounts have taken", async () => {
    process.env.BLOCKSCOUT_API_KEY = "site-key";
    process.env.BLOCKSCOUT_DAILY_CREDITS = "1000";
    process.env.TRACE_FREE_SHARE = "0.5";
    const day = Date.UTC(2031, 0, 1);
    await withKeys(user(null, null, async () => true), () => onKeysFor(base, "wallet", () => take("blockscout", 20, day)));
    const rows = await usage(day);
    const pool = rows.find((r) => r.id === "blockscout" && r.pool === "free")!;
    expect(pool).toMatchObject({ name: "Blockscout (free reads)", limit: 500, used: 20 });
    // An account on its own keys sees only its own budgets.
    const own = await withKeys(user("own", null), () => usage(day));
    expect(own.some((r) => r.pool)).toBe(false);
  });
});
