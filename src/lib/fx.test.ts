import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRate } from "./fx";

const NOW = Date.parse("2026-10-04T10:00:00Z");
const currencyApi = {
  name: "fawazahmed0/exchange-api",
  read: (b: unknown) => ({ rate: (b as { usd?: { idr?: number } }).usd?.idr, date: (b as { date?: string }).date }),
  maxAgeDays: 3,
};

describe("parseRate", () => {
  it("takes a plausible rupiah rate with its day", () => {
    expect(parseRate(currencyApi, { date: "2026-10-04", usd: { idr: 17_888.6 } }, NOW)).toEqual({
      usdIdr: 17_888.6,
      date: "2026-10-04",
      source: "fawazahmed0/exchange-api",
      fetchedAt: NOW,
    });
  });

  it("refuses an answer that isn't the rupiah, or one too old", () => {
    expect(parseRate(currencyApi, { date: "2026-10-04", usd: { idr: 1.2 } }, NOW)).toBeNull();
    expect(parseRate(currencyApi, { date: "2026-10-04", usd: { idr: 178_886 } }, NOW)).toBeNull();
    expect(parseRate(currencyApi, { date: "2026-10-04", usd: { idr: "17888" } }, NOW)).toBeNull();
    expect(parseRate(currencyApi, {}, NOW)).toBeNull();
    expect(parseRate(currencyApi, null, NOW)).toBeNull();
    // jsDelivr can serve @latest days old.
    expect(parseRate(currencyApi, { date: "2026-09-27", usd: { idr: 17_500 } }, NOW)).toBeNull();
    expect(parseRate(currencyApi, { usd: { idr: 17_500 } }, NOW)).toBeNull();
  });
});

describe("usdIdr", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reads ExchangeRate-API first, with the credit its terms ask for, and keeps it for hours", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return Response.json({ result: "success", time_last_update_unix: 1_791_072_152, rates: { IDR: 17_888.613936 } });
      }),
    );
    const { usdIdr } = await import("./fx");
    expect(await usdIdr(NOW)).toEqual({
      usdIdr: 17_888.613936,
      date: "2026-10-04",
      source: "ExchangeRate-API",
      credit: { text: "Rates By Exchange Rate API", url: "https://www.exchangerate-api.com" },
      fetchedAt: NOW,
    });
    expect(await usdIdr(NOW + 3_600_000)).toMatchObject({ usdIdr: 17_888.613936 });
    expect(urls).toEqual(["https://open.er-api.com/v6/latest/USD"]);
  });

  it("tries the next source when one fails, then keeps an older rate for a week while none answers", async () => {
    let up = true;
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (!up || url.includes("er-api")) return new Response("down", { status: 503 });
        return Response.json({ date: "2026-10-03", base: "USD", quote: "IDR", rate: 17_850 });
      }),
    );
    const { usdIdr } = await import("./fx");
    expect(await usdIdr(NOW)).toMatchObject({ usdIdr: 17_850, source: "Frankfurter", date: "2026-10-03" });
    expect(urls).toHaveLength(2);
    up = false;
    expect((await usdIdr(NOW + 7 * 3_600_000))?.usdIdr).toBe(17_850);
    expect(await usdIdr(NOW + 8 * 86_400_000)).toBeNull();
  });
});
