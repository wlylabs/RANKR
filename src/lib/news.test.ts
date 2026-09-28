import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTokens } from "./dexscreener";
import { isNamesake, keywordsOf, liveNews, namesakes, normalize, searchNews } from "./news";
import type { MarketSnapshot } from "./types";

vi.mock("./dexscreener", () => ({ MOCK: false, searchTokens: vi.fn() }));

// The shape of a Google News RSS feed.
const rss = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items.join("")}</channel></rss>`;
const item = (title: string, link: string, date: string, source = "Yonhap News Agency") =>
  `<item><title>${title} - ${source}</title><link>${link}</link><guid isPermaLink="false">x</guid>` +
  `<pubDate>${date}</pubDate><description>&lt;a href="${link}"&gt;${title}&lt;/a&gt;</description>` +
  `<source url="https://en.yna.co.kr">${source}</source></item>`;

describe("keywordsOf", () => {
  it("finds what a token named after the story would be called, best first", () => {
    expect(normalize("Bukang-i")).toBe("bukangi");
    expect(keywordsOf("Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i")).toEqual(["Bukang-i", "Busan"]);
    expect(keywordsOf("Shark fever hits Busan as 102,000 rush to see 'Bukangi' at start of Chuseok break")[0]).toBe("Bukangi");
    expect(keywordsOf(`Shark 'Bukang-i' that drew 400,000 people... "Time to return to the sea" response meeting tomorrow`)[0]).toBe(
      "Bukang-i",
    );
    expect(keywordsOf("Moo Deng turns two: Thailand's famous pygmy hippo celebrates with a fruit cake").slice(0, 2)).toEqual([
      "Moo Deng",
      "Thailand",
    ]);
    expect(keywordsOf("Peanut the Squirrel's owner opens animal sanctuary a year later")[0]).toBe("Peanut the Squirrel");
  });

  it("copes with Title Case headlines and with none at all", () => {
    const k = keywordsOf("470,000 Flock to See Shark 'Bukangi' in Busan Canal");
    expect(k[0]).toBe("Bukangi");
    expect(k).toContain("Busan Canal");
    expect(k).not.toContain("Flock");
    expect(keywordsOf("the market is quiet today")).toEqual([]);
    expect(keywordsOf("Memecoin named after Busan's shark Bukangi jumps 300% in a day")).toEqual(["Busan", "Bukangi"]);
  });
});

describe("liveNews and searchNews", () => {
  afterEach(() => vi.unstubAllGlobals());
  const hours = (h: number) => new Date(Date.now() - h * 3_600_000).toUTCString();

  it("brings every source together: each story once, today's news only, newest first", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://news.google.com/rss?hl=en-US")) {
        return new Response(
          rss([
            item("Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i", "https://news.google.com/rss/articles/busan", hours(1)),
            ...Array.from({ length: 25 }, (_, i) => item(`Filler story ${i}`, `https://news.google.com/rss/articles/f${i}`, hours(2 + i / 10), "AP")),
          ]),
        );
      }
      if (url === "https://rss.upi.com/news/odd_news.rss") {
        return new Response(
          rss([
            // The same story, as UPI links it: shown once.
            `<item><title>Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i</title><link>https://upi.test/busan</link><pubDate>${hours(1)}</pubDate></item>`,
            `<item><title>Moo Deng turns two</title><link>https://upi.test/moo</link><pubDate>${hours(3)}</pubDate></item>`,
            `<item><title>Old news</title><link>https://upi.test/old</link><pubDate>${hours(72)}</pubDate></item>`,
          ]),
        );
      }
      // Google Trends: a search and the story behind it. The same search trends in two countries: shown once.
      const trend = (search: string, title: string, link: string, h: number) =>
        `<item><title>${search}</title><pubDate>${hours(h)}</pubDate><ht:news_item><ht:news_item_title>${title}</ht:news_item_title>` +
        `<ht:news_item_url>${link}</ht:news_item_url><ht:news_item_source>Yonhap News Agency</ht:news_item_source></ht:news_item></item>`;
      if (url === "https://trends.google.com/trending/rss?geo=US") {
        return new Response(rss([trend("bukangi", "Shark fever hits Busan as 102,000 rush to see 'Bukangi'", "https://yna.test/fever", 0.5)]));
      }
      if (url === "https://trends.google.com/trending/rss?geo=SG") {
        return new Response(
          rss([
            trend("bukangi", "Busan's shark draws crowds", "https://yna.test/crowds", 0.6),
            trend("pygmy hippo", "Thailand's famous hippo celebrates with a fruit cake", "https://yna.test/hippo", 4),
          ]),
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const news = await liveNews();
    const titles = news.map((n) => n.title);
    expect(titles[0]).toBe("Shark fever hits Busan as 102,000 rush to see 'Bukangi'");
    expect(titles).not.toContain("Busan's shark draws crowds");
    expect(titles.filter((t) => t.includes("Bukang-i"))).toHaveLength(1);
    expect(titles).toContain("Moo Deng turns two");
    expect(titles).not.toContain("Old news");
    expect(titles.filter((t) => t.startsWith("Filler"))).toHaveLength(19); // 20 from Google News, one of them Busan
    expect(news.find((n) => n.title.includes("Bukang-i"))).toMatchObject({ keywords: ["Bukang-i", "Busan"], category: "trending" });
    // What people searched for comes first, written as the headline writes it when it does.
    expect(news[0]).toMatchObject({ keywords: ["Bukangi", "Busan", "Shark"], category: "trending" });
    expect(news.find((n) => n.title.includes("hippo"))?.keywords).toEqual(["pygmy hippo", "Thailand"]);
    expect(news[0]).not.toHaveProperty("topic");

    const reads = fetchMock.mock.calls.length;
    await liveNews();
    expect(fetchMock).toHaveBeenCalledTimes(reads); // read again only after a few minutes

    await searchNews("bukangi");
    const searched = fetchMock.mock.calls.slice(reads).map(([u]) => String(u));
    expect(searched.some((u) => u.includes("news.google.com/rss/search?q=bukangi"))).toBe(true);
    expect(searched.some((u) => u.includes("bing.com/news/search?q=bukangi"))).toBe(true);
    expect(searched.some((u) => u.includes("api.gdeltproject.org"))).toBe(true);
  });

  it("is empty, not an error, when the news can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await searchNews("nothing here at all")).toEqual([]);
  });
});

describe("isNamesake", () => {
  const keywords = ["bukangi"];
  it("takes the same name or ticker, and ones holding it or held by it", () => {
    expect(isNamesake({ symbol: "BUKANGI", name: "Bukangi" }, keywords)).toBe(true);
    expect(isNamesake({ symbol: "BKG", name: "Bukang-i the Shark" }, keywords)).toBe(true);
    expect(isNamesake({ symbol: "BUKANG", name: "Busan shark" }, keywords)).toBe(true);
    expect(isNamesake({ symbol: "SHARK", name: "Busan Shark" }, keywords)).toBe(false);
    expect(isNamesake({ symbol: "BUK", name: "Buk" }, keywords)).toBe(false); // too short to count as part
  });
});

describe("namesakes", () => {
  const snap = (address: string, symbol: string, name: string, volume24h: number | null, liquidityUsd: number | null) =>
    ({ chainId: "solana", address, symbol, name, volume24h, liquidityUsd }) as MarketSnapshot;

  it("searches as written and run together, keeps each live namesake once, most traded first", async () => {
    const search = vi.mocked(searchTokens);
    search.mockImplementation(async (q: string) =>
      q === "Bukang-i"
        ? [
            snap("A", "BUKANGI", "Bukangi", 400_000, 5_000),
            snap("B", "BUKANGI", "Bukangi Inu", 20_000, 90_000),
            snap("D", "BUKANGI", "Bukangi Dog", 20_000, 150_000),
            snap("X", "SHARK", "Shark", 9e6, 1e6),
            snap("E", "BUKANGI", "Bukangi Dead", 300, 2_000), // below $1K volume: left out
          ]
        : [snap("A", "BUKANGI", "Bukangi", 400_000, 5_000), snap("C", "BUKANG", "Bukang", null, null)],
    );
    const tokens = await namesakes("Bukang-i");
    // By 24h volume; the same volume goes to the more liquid; unknown last.
    expect(tokens.map((t) => t.address)).toEqual(["A", "D", "B", "C"]);
    expect(search.mock.calls.map(([q]) => q)).toEqual(["Bukang-i", "Bukangi"]);

    await namesakes("Bukang-i");
    expect(search).toHaveBeenCalledTimes(2); // kept for a minute
  });
});
