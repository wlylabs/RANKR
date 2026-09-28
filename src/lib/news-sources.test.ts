import { afterEach, describe, expect, it, vi } from "vitest";
import { newsSources, parseDate, parseRss, readSource } from "./news-sources";

const rss = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items.join("")}</channel></rss>`;
const item = (title: string, link: string, date: string, extra = "") =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate>${extra}</item>`;

describe("parseDate", () => {
  it("reads every way the sources write a date", () => {
    const at = Date.parse("2026-09-28T03:40:00Z");
    expect(parseDate("Sun, 28 Sep 2026 03:40:00 GMT")).toBe(at); // RSS
    expect(parseDate("2026-09-28T03:40:00Z")).toBe(at); // ISO
    expect(parseDate("2026-09-28T03:40:00.000000Z")).toBe(at); // TheNewsAPI
    expect(parseDate("2026-09-28 03:40:00")).toBe(at); // NewsData, UTC
    expect(parseDate("2026-09-28 03:40:00 +0000")).toBe(at); // Currents
    expect(parseDate("2026-09-28 10:40:00 +0700")).toBe(at);
    expect(parseDate("20260928T034000Z")).toBe(at); // GDELT
    expect(parseDate("soon")).toBeNaN();
    expect(parseDate(null)).toBeNaN();
  });
});

describe("parseRss", () => {
  it("reads headline, publisher, link and time, without Google News' ' - Publisher' ending", () => {
    const xml = rss([
      item("Shark &#39;Bukang-i&#39; drew 400,000 people &amp; more - Yonhap News Agency", "https://news.google.com/rss/articles/A", "Sun, 28 Sep 2026 03:40:00 GMT", '<source url="https://en.yna.co.kr">Yonhap News Agency</source>'),
      item("<![CDATA[A CDATA headline]]>", "https://bing.com/news/B", "Sat, 27 Sep 2026 10:00:00 GMT", "<News:Source>Korea Times</News:Source>"),
      item("Not a web link", "javascript:alert(1)", "Sat, 27 Sep 2026 10:00:00 GMT"),
      item("No date", "https://x.test/c", "soon"),
      item("Odd &#99999999; entity", "https://x.test/d", "Sat, 27 Sep 2026 10:00:00 GMT"),
    ]);
    expect(parseRss(xml)).toEqual([
      { title: "Shark 'Bukang-i' drew 400,000 people & more", url: "https://news.google.com/rss/articles/A", source: "Yonhap News Agency", publishedAt: Date.parse("2026-09-28T03:40:00Z") },
      { title: "A CDATA headline", url: "https://bing.com/news/B", source: "Korea Times", publishedAt: Date.parse("2026-09-27T10:00:00Z") },
      { title: "Odd &#99999999; entity", url: "https://x.test/d", source: null, publishedAt: Date.parse("2026-09-27T10:00:00Z") },
    ]);
  });

  it("names a publisher's own feed after the publisher", () => {
    expect(parseRss(rss([item("Busan's shark", "https://bbc.co.uk/a", "Sun, 28 Sep 2026 03:40:00 GMT")]), "BBC News")[0].source).toBe("BBC News");
  });
});

describe("newsSources", () => {
  const keys = {
    GNEWS_API_KEY: "g-key",
    NEWSDATA_API_KEY: "nd-key",
    GUARDIAN_API_KEY: "gu-key",
    NEWSAPI_KEY: "na-key",
    CURRENTS_API_KEY: "cu-key",
    THENEWSAPI_KEY: "tn-key",
  };
  const byName = (name: string) => {
    const s = newsSources(keys).find((x) => x.name === name);
    if (!s) throw new Error(`no ${name}`);
    return s;
  };

  it("reads the free ones always, and a keyed one once its key is set", () => {
    const free = newsSources({}).map((s) => s.name);
    expect(free).toEqual(
      expect.arrayContaining([
        "Google News", "Bing News", "GDELT", "Hacker News", "BBC News", "DW", "CBC News", "Yonhap News Agency",
        "The Korea Herald", "Korea Times", "UPI Odd News", "CoinDesk", "The Block", "Watcher Guru",
      ]),
    );
    expect(free).not.toContain("GNews");
    expect(newsSources(keys).length - free.length).toBe(6);
    expect(byName("GNews").live).toContain("apikey=g-key");
    expect(byName("TheNewsAPI").search).toBeUndefined(); // 3 requests a day: the live list only
  });

  it("puts each source in a tab, reads each feed once, over https", () => {
    const all = newsSources(keys);
    const tab = (name: string) => all.find((s) => s.name === name)?.category;
    expect([tab("BBC News"), tab("Google News entertainment"), tab("CoinDesk"), tab("Hacker News"), tab("GNews")]).toEqual([
      "world", "viral", "crypto", "tech", "world",
    ]);
    const urls = all.flatMap((s) => [s.live, s.search?.("x")].filter((u): u is string => !!u));
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((u) => !u.startsWith("https://"))).toEqual([]);
    expect(all.filter((s) => s.category === "crypto").length).toBeGreaterThanOrEqual(30);
  });

  it("uses the feeds and searches as their references give them", () => {
    expect(byName("NPR").live).toBe("https://www.npr.org/rss/rss.php?id=1004"); // World, as awesome-rss-feeds lists it
    expect(byName("Bing News").search?.("bukangi")).toBe(
      "https://www.bing.com/news/search?q=bukangi&qft=sortbydate%3D%221%22&format=rss",
    );
    expect(byName("Google News world").live).toBe("https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en");
  });

  it("reads each keyed API's answers", () => {
    const at = Date.parse("2026-09-28T03:40:00Z");
    const want = { title: "Busan shark Bukang-i", url: "https://news.test/a", publishedAt: at };
    expect(byName("GNews").parse(JSON.stringify({ articles: [{ title: want.title, url: want.url, publishedAt: "2026-09-28T03:40:00Z", source: { name: "Korea Times" } }] }))).toEqual([{ ...want, source: "Korea Times" }]);
    expect(byName("NewsData.io").parse(JSON.stringify({ results: [{ title: want.title, link: want.url, pubDate: "2026-09-28 03:40:00", source_id: "yna" }] }))).toEqual([{ ...want, source: "yna" }]);
    expect(byName("The Guardian API").parse(JSON.stringify({ response: { results: [{ webTitle: want.title, webUrl: want.url, webPublicationDate: "2026-09-28T03:40:00Z" }] } }))).toEqual([{ ...want, source: "The Guardian" }]);
    expect(byName("NewsAPI.org").parse(JSON.stringify({ articles: [
      { title: "[Removed]", url: "https://removed.test", publishedAt: "2026-09-28T03:40:00Z", source: { name: "x" } },
      { title: want.title, url: want.url, publishedAt: "2026-09-28T03:40:00Z", source: { name: "AP" } },
    ] }))).toEqual([{ ...want, source: "AP" }]);
    expect(byName("Currents").parse(JSON.stringify({ news: [{ title: want.title, url: "https://www.news.test/a", published: "2026-09-28 03:40:00 +0000" }] }))).toEqual([{ ...want, url: "https://www.news.test/a", source: "news.test" }]);
    expect(byName("TheNewsAPI").parse(JSON.stringify({ data: [{ title: want.title, url: want.url, published_at: "2026-09-28T03:40:00.000000Z", source: "news.test" }] }))).toEqual([{ ...want, source: "news.test" }]);
    expect(byName("GDELT").parse(JSON.stringify({ articles: [{ title: want.title, url: want.url, seendate: "20260928T034000Z", domain: "yna.co.kr" }] }))).toEqual([{ ...want, source: "yna.co.kr" }]);
    expect(byName("Hacker News").parse(JSON.stringify({ hits: [{ title: "Ask HN: sharks?", url: null, objectID: "42", created_at: "2026-09-28T03:40:00Z" }] }))).toEqual([
      { title: "Ask HN: sharks?", url: "https://news.ycombinator.com/item?id=42", source: "Hacker News", publishedAt: at },
    ]);
    expect(byName("GNews").parse("Please limit requests")).toEqual([]); // not JSON: nothing, not an error
  });
});

describe("readSource", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never logs a key, and a failed read is nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const gnews = newsSources({ GNEWS_API_KEY: "secret-key" }).find((s) => s.name === "GNews");
    expect(await readSource(gnews!, gnews!.live!)).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toContain("GNews responded 429");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("secret-key");
  });
});
