import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Offline: synthetic market data (RANKR_MOCK) and a file store in a temp dir.
const A = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const B = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

describe("lookup and watchlist data", () => {
  let rankr: typeof import("./rankr");

  beforeAll(async () => {
    vi.stubEnv("RANKR_MOCK", "1");
    vi.stubEnv("RANKR_DATA_DIR", mkdtempSync(path.join(tmpdir(), "rankr-")));
    delete (globalThis as { __rankrStore?: unknown }).__rankrStore;
    vi.resetModules();
    rankr = await import("./rankr");
    await rankr.trackToken(A, "solana");
  });

  it("looks a paste up without recording it", async () => {
    const tracked = await rankr.lookupToken(`https://dexscreener.com/solana/${A}`);
    expect(tracked.preview.address).toBe(A);
    expect(tracked.token?.id).toBe(`solana:${A}`);

    const fresh = await rankr.lookupToken(B);
    expect(fresh.preview.address).toBe(B);
    expect(fresh.token).toBeNull();
    expect((await rankr.lookupToken(B)).token).toBeNull();
    await expect(rankr.lookupToken("not an address")).rejects.toMatchObject({ status: 400 });
  });

  it("gives live data for watched tokens, tracked or not", async () => {
    const items = await rankr.watchlistOf([`solana:${A}`, `solana:${B}`]);
    expect(items[0]).toMatchObject({ id: `solana:${A}`, market: null });
    expect(items[0].token?.market?.priceUsd).toBeGreaterThan(0);
    expect(items[1]).toMatchObject({ id: `solana:${B}`, token: null });
    expect(items[1].market?.priceUsd).toBeGreaterThan(0);
    expect(await rankr.watchlistOf([])).toEqual([]);
  });
});
