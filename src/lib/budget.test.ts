import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBudgets, resetOf, solanaCredits, take, tracked, usage } from "./budget";

const at = (iso: string) => Date.parse(iso);

describe("usage budgets", () => {
  beforeEach(() => resetBudgets());
  afterEach(() => vi.unstubAllEnvs());

  it("holds a per-minute upstream to its limit, and lets it go again a minute later", async () => {
    vi.stubEnv("GECKOTERMINAL_PER_MINUTE", "2");
    const t = at("2030-01-01T10:00:00Z");
    expect(await take("geckoterminal", 1, t)).toBe(true);
    expect(await take("geckoterminal", 1, t + 1_000)).toBe(true);
    expect(await take("geckoterminal", 1, t + 2_000)).toBe(false);
    expect(resetOf("geckoterminal", t + 2_000)).toBe(t + 60_000);
    expect(await take("geckoterminal", 1, t + 60_001)).toBe(true);
  });

  it("spends Blockscout's credits by the UTC day, 20 a request, and starts over the next day", async () => {
    vi.stubEnv("BLOCKSCOUT_DAILY_CREDITS", "100");
    const t = at("2030-01-02T23:00:00Z");
    for (let i = 0; i < 5; i++) expect(await take("blockscout", 20, t)).toBe(true);
    expect(await take("blockscout", 20, t)).toBe(false);
    expect(resetOf("blockscout", t)).toBe(at("2030-01-03T00:00:00Z"));
    expect(await take("blockscout", 20, at("2030-01-03T00:00:01Z"))).toBe(true);
  });

  it("budgets the Solana RPC only when it's your own: by the month, and a share of it a day", async () => {
    const t = at("2030-01-04T12:00:00Z");
    // The public RPCs have no quota to spend (they're paced instead).
    for (let i = 0; i < 50; i++) expect(await take("solana", 10, t)).toBe(true);
    vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example");
    vi.stubEnv("SOLANA_RPC_MONTHLY_CREDITS", "500");
    // 500 a month: 20 a day.
    expect(await take("solana", solanaCredits("getTransaction"), t)).toBe(true);
    expect(await take("solana", solanaCredits("getTransaction"), t)).toBe(true);
    expect(await take("solana", solanaCredits("getAccountInfo"), t)).toBe(false);
    expect(solanaCredits("getAccountInfo")).toBe(1);
  });

  it("says which upstreams turned a call down while a read ran", async () => {
    vi.stubEnv("HONEYPOT_PER_MINUTE", "1");
    const t = at("2030-01-05T08:00:00Z");
    const { value, refused } = await tracked(async () => {
      await take("honeypot", 1, t);
      await take("geckoterminal", 1, t);
      return (await take("honeypot", 1, t)) ? "ran" : "skipped";
    });
    expect(value).toBe("skipped");
    expect(refused).toEqual(["honeypot"]);
    // Outside a tracked read, nothing is noted.
    expect(await take("honeypot", 1, t)).toBe(false);
  });
});

describe("readers within their budgets", () => {
  beforeEach(() => resetBudgets());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("doesn't ask GeckoTerminal or Honeypot.is past their limits", async () => {
    vi.stubEnv("GECKOTERMINAL_PER_MINUTE", "1");
    vi.stubEnv("HONEYPOT_PER_MINUTE", "1");
    const fetch = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    const { poolTrades } = await import("./trace/gecko");
    const { simulateTrade } = await import("./trace/honeypot");
    expect(await poolTrades("solana", "Pool", "Mint")).toEqual([]);
    expect(await poolTrades("solana", "Pool", "Mint")).toBeNull();
    await simulateTrade("base", "0xabc");
    expect(await simulateTrade("base", "0xabc")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops at Blockscout's daily budget with a reason, and at DexScreener's minute", async () => {
    vi.stubEnv("BLOCKSCOUT_API_KEY", "k");
    vi.stubEnv("BLOCKSCOUT_DAILY_CREDITS", "20");
    vi.stubEnv("DEXSCREENER_PER_MINUTE", "1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const { blockscout } = await import("./trace/evm");
    const { traceChain } = await import("./trace/chains");
    const { tokenPairs } = await import("./dexscreener");
    await blockscout(traceChain("base")!, "/addresses/0x1");
    await expect(blockscout(traceChain("base")!, "/addresses/0x1")).rejects.toMatchObject({
      code: "quota",
      message: expect.stringContaining("Blockscout budget is used up"),
    });
    await tokenPairs("solana", "Mint");
    await expect(tokenPairs("solana", "Mint")).rejects.toThrow("DexScreener's rate limit");
  });
});

describe("usage", () => {
  beforeEach(() => resetBudgets());
  afterEach(() => vi.unstubAllEnvs());

  it("lists every budget with its limit, use, what's left and its reset, taking nothing", async () => {
    vi.stubEnv("BLOCKSCOUT_API_KEY", "k");
    vi.stubEnv("BLOCKSCOUT_DAILY_CREDITS", "1000");
    vi.stubEnv("GECKOTERMINAL_PER_MINUTE", "25");
    const t = at("2031-03-10T06:00:00Z");
    await take("blockscout", 20, t);
    await take("geckoterminal", 1, t);
    await take("geckoterminal", 1, t + 5_000);
    const rows = await usage(t + 10_000);
    const blockscout = rows.find((r) => r.id === "blockscout")!;
    // A block of 20 credits was leased for the request: that's what the shared count holds.
    expect(blockscout).toMatchObject({ window: "day", unit: "credits", limit: 1000, used: 20, remaining: 980, scope: "shared" });
    expect(blockscout.reset).toBe(at("2031-03-11T00:00:00Z"));
    expect(rows.find((r) => r.id === "geckoterminal")).toMatchObject({
      window: "minute",
      used: 2,
      remaining: 23,
      reset: t + 60_000,
      scope: "instance",
    });
    // Without your own RPC, Solana's is paced, with no quota to show.
    expect(rows.find((r) => r.id === "solana")?.off).toContain("paced");
    // Reading it took nothing.
    expect((await usage(t + 10_000)).find((r) => r.id === "geckoterminal")?.used).toBe(2);
  });

  it("says when Blockscout isn't set up", async () => {
    expect((await usage(at("2031-03-12T06:00:00Z"))).find((r) => r.id === "blockscout")?.off).toContain(
      "BLOCKSCOUT_API_KEY",
    );
  });
});
