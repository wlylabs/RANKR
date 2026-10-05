import { afterEach, describe, expect, it } from "vitest";
import { allowanceOf, takeAllowance } from "./trace-allowance";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("free allowance", () => {
  it("counts each account's free reads per UTC day, guests getting less", async () => {
    process.env.TRACE_FREE_WALLETS = "2";
    process.env.TRACE_FREE_GUEST_WALLETS = "1";
    const day = Date.UTC(2026, 9, 5, 12);
    expect([await takeAllowance("a", false, "wallet", day), await takeAllowance("a", false, "wallet", day)]).toEqual([true, true]);
    expect(await takeAllowance("a", false, "wallet", day)).toBe(false);
    expect(await takeAllowance("g", true, "wallet", day)).toBe(true);
    expect(await takeAllowance("g", true, "wallet", day)).toBe(false);
    // Another account, and the next day, start fresh.
    expect(await takeAllowance("b", false, "wallet", day)).toBe(true);
    expect(await takeAllowance("a", false, "wallet", day + 86_400_000)).toBe(true);

    const left = await allowanceOf("a", false, day);
    expect(left.wallets).toEqual({ used: 2, limit: 2 });
    expect(left.reports).toEqual({ used: 0, limit: 5 });
    expect(left.reset).toBe(Date.UTC(2026, 9, 6));
  });
});
