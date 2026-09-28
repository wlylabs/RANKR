import { afterEach, describe, expect, it, vi } from "vitest";
import { mentions, newsFor, normalize, parseRss } from "./news";
import type { TokenView } from "./types";

const token = (symbol: string, name: string) =>
  ({ id: `solana:${symbol}`, chainId: "solana", address: symbol, symbol, name }) as TokenView;

// The shape of a Google News RSS search.
const rss = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items.join("")}</channel></rss>`;
const item = (title: string, link: string, date: string, source = "Yonhap News Agency") =>
  `<item><title>${title} - ${source}</title><link>${link}</link><guid isPermaLink="false">x</guid>` +
  `<pubDate>${date}</pubDate><description>&lt;a href="${link}"&gt;${title}&lt;/a&gt;</description>` +
  `<source url="https://en.yna.co.kr">${source}</source></item>`;

describe("mentions", () => {
  it("finds the name however it's spelled", () => {
    const bukangi = token("BUKANGI", "Bukangi");
    expect(normalize("Bukang-i")).toBe("bukangi");
    expect(mentions("Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i", bukangi)).toBe(true);
    expect(mentions("Shark fever hits Busan as 102,000 rush to see 'Bukangi'", bukangi)).toBe(true);
    expect(mentions("Busan port reopens after the holiday", bukangi)).toBe(false);
  });

  it("needs the $ticker for short names, and a whole one", () => {
    const cat = token("CAT", "Cat");
    expect(mentions("Cat rescued from a tree", cat)).toBe(false);
    expect(mentions("$CAT doubles overnight", cat)).toBe(true);
    expect(mentions("$CATS doubles overnight", cat)).toBe(false);
  });
});

describe("parseRss", () => {
  it("reads headline, publisher, link and time, without the ' - Publisher' ending", () => {
    const xml = rss([
      item("Shark &#39;Bukang-i&#39; that drew 400,000 people &amp; more", "https://news.google.com/rss/articles/A?oc=5", "Sun, 28 Sep 2026 03:40:00 GMT"),
      item("<![CDATA[A CDATA headline]]>", "https://news.google.com/rss/articles/B", "Sat, 27 Sep 2026 10:00:00 GMT", "Korea Times"),
      item("Not a web link", "javascript:alert(1)", "Sat, 27 Sep 2026 10:00:00 GMT"),
      item("No date", "https://news.google.com/rss/articles/C", "soon"),
    ]);
    expect(parseRss(rss([item("Odd &#99999999; entity", "https://x.test/a", "Sat, 27 Sep 2026 10:00:00 GMT")]))[0].title).toBe(
      "Odd &#99999999; entity",
    );
    expect(parseRss(xml)).toEqual([
      {
        title: "Shark 'Bukang-i' that drew 400,000 people & more",
        url: "https://news.google.com/rss/articles/A?oc=5",
        source: "Yonhap News Agency",
        publishedAt: Date.parse("2026-09-28T03:40:00Z"),
      },
      { title: "A CDATA headline", url: "https://news.google.com/rss/articles/B", source: "Korea Times", publishedAt: Date.parse("2026-09-27T10:00:00Z") },
    ]);
  });
});

describe("newsFor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps headlines naming the token, newest first, each once, and asks again only after a while", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(
        rss([
          item("Shark fever hits Busan as 102,000 rush to see 'Bukangi'", "https://news.google.com/rss/articles/old", "Thu, 25 Sep 2026 09:00:00 GMT", "Korea Times"),
          item("Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i", "https://news.google.com/rss/articles/new", "Sun, 28 Sep 2026 03:40:00 GMT"),
          item("Busan weather: sunny", "https://news.google.com/rss/articles/other", "Sun, 28 Sep 2026 05:00:00 GMT"),
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const bukangi = token("BUKANGI", "Bukangi");
    const news = await newsFor([bukangi, bukangi]);
    expect(news.map((n) => n.url)).toEqual(["https://news.google.com/rss/articles/new", "https://news.google.com/rss/articles/old"]);
    expect(news[0]).toMatchObject({ source: "Yonhap News Agency", token: { symbol: "BUKANGI" } });
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=%22Bukangi%22");

    await newsFor([bukangi]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the parallel and the later lookups share one search
  });

  it("searches short names by $ticker", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(rss([])));
    vi.stubGlobal("fetch", fetchMock);
    await newsFor([token("CAT", "Cat")]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=%22%24CAT%22");
  });

  it("is empty, not an error, when the news can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await newsFor([token("ZZZZ", "Nothing Here")])).toEqual([]);
  });
});
