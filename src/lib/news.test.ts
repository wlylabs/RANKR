import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTokens } from "./dexscreener";
import { isNamesake, keywordsOf, liveNews, namesakes, normalize, parseRss, searchNews } from "./news";
import type { MarketSnapshot } from "./types";

vi.mock("./dexscreener", () => ({ MOCK: false, searchTokens: vi.fn() }));

// The shape of a Google News RSS feed.
const rss = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items.join("")}</channel></rss>`;
const item = (title: string, link: string, date: string, source = "Yonhap News Agency") =>
  `<item><title>${title} - ${source}</title><link>${link}</link><guid isPermaLink="false">x</guid>` +
  `<pubDate>${date}</pubDate><description>&lt;a href="${link}"&gt;${title}&lt;/a&gt;</description>` +
  `<source url="https://en.yna.co.kr">${source}</source></item>`;

describe("parseRss", () => {
  it("reads headline, publisher, link and time, without the ' - Publisher' ending", () => {
    const xml = rss([
      item("Shark &#39;Bukang-i&#39; that drew 400,000 people &amp; more", "https://news.google.com/rss/articles/A?oc=5", "Sun, 28 Sep 2026 03:40:00 GMT"),
      item("<![CDATA[A CDATA headline]]>", "https://news.google.com/rss/articles/B", "Sat, 27 Sep 2026 10:00:00 GMT", "Korea Times"),
      item("Not a web link", "javascript:alert(1)", "Sat, 27 Sep 2026 10:00:00 GMT"),
      item("No date", "https://news.google.com/rss/articles/C", "soon"),
    ]);
    expect(parseRss(xml)).toEqual([
      {
        title: "Shark 'Bukang-i' that drew 400,000 people & more",
        url: "https://news.google.com/rss/articles/A?oc=5",
        source: "Yonhap News Agency",
        publishedAt: Date.parse("2026-09-28T03:40:00Z"),
      },
      { title: "A CDATA headline", url: "https://news.google.com/rss/articles/B", source: "Korea Times", publishedAt: Date.parse("2026-09-27T10:00:00Z") },
    ]);
    expect(parseRss(rss([item("Odd &#99999999; entity", "https://x.test/a", "Sat, 27 Sep 2026 10:00:00 GMT")]))[0].title).toBe(
      "Odd &#99999999; entity",
    );
  });
});

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
  });
});

describe("liveNews and searchNews", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads every feed once, keeps each story once (same link or same headline), newest first", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(
        url.includes("section/topic/WORLD")
          ? rss([
              item("Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i", "https://news.google.com/rss/articles/other-link", "Sun, 28 Sep 2026 03:40:00 GMT"),
              item("Moo Deng turns two", "https://news.google.com/rss/articles/moo", "Sat, 27 Sep 2026 03:00:00 GMT", "Reuters"),
            ])
          : rss([
              item("Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i", "https://news.google.com/rss/articles/busan", "Sun, 28 Sep 2026 03:40:00 GMT"),
              item("Markets close higher", "https://news.google.com/rss/articles/mkt", "Sun, 28 Sep 2026 05:00:00 GMT", "AP"),
            ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const news = await liveNews();
    expect(news.map((n) => n.title)).toEqual([
      "Markets close higher",
      "Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i",
      "Moo Deng turns two",
    ]);
    expect(news[1]).toMatchObject({ source: "Yonhap News Agency", keywords: ["Bukang-i", "Busan"] });
    const feeds = fetchMock.mock.calls.length;
    expect(feeds).toBeGreaterThanOrEqual(4);

    await liveNews();
    expect(fetchMock).toHaveBeenCalledTimes(feeds); // read again only after a few minutes

    await searchNews("bukangi");
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("/rss/search?q=bukangi");
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
  const snap = (address: string, symbol: string, name: string, liquidityUsd: number | null) =>
    ({ chainId: "solana", address, symbol, name, liquidityUsd }) as MarketSnapshot;

  it("searches as written and run together, keeps each namesake once, most liquid first", async () => {
    const search = vi.mocked(searchTokens);
    search.mockImplementation(async (q: string) =>
      q === "Bukang-i"
        ? [snap("A", "BUKANGI", "Bukangi", 5_000), snap("B", "BUKANGI", "Bukangi Inu", 90_000), snap("X", "SHARK", "Shark", 1e6)]
        : [snap("A", "BUKANGI", "Bukangi", 5_000), snap("C", "BUKANG", "Bukang", null)],
    );
    const tokens = await namesakes("Bukang-i");
    expect(tokens.map((t) => t.address)).toEqual(["B", "A", "C"]);
    expect(search.mock.calls.map(([q]) => q)).toEqual(["Bukang-i", "Bukangi"]);

    await namesakes("Bukang-i");
    expect(search).toHaveBeenCalledTimes(2); // kept for a minute
  });
});
