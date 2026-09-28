import { afterEach, describe, expect, it, vi } from "vitest";
import { newsSources, parseDate, parseRss, parseTraffic, parseTrends, readSource } from "./news-sources";

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

describe("parseTrends", () => {
  // Google Trends' "Trending now" RSS: a search, then the stories behind it.
  const trend = (search: string, stories: [title: string, url: string, source: string][]) =>
    `<item><title>${search}</title><ht:approx_traffic>2000+</ht:approx_traffic><pubDate>Sun, 28 Sep 2026 03:40:00 -0700</pubDate>` +
    stories
      .map(([t, u, s]) => `<ht:news_item><ht:news_item_title>${t}</ht:news_item_title><ht:news_item_url>${u}</ht:news_item_url><ht:news_item_source>${s}</ht:news_item_source></ht:news_item>`)
      .join("") +
    "</item>";
  const feed = (items: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel>${items.join("")}</channel></rss>`;

  it("reads approx_traffic as the number it's at least", () => {
    expect(["2000+", "200,000+", "50K+", "1M+", "1.5M+", "500"].map(parseTraffic)).toEqual([2_000, 200_000, 50_000, 1_000_000, 1_500_000, 500]);
    expect([null, "", "lots"].map(parseTraffic)).toEqual([null, null, null]);
  });

  it("takes one story per search, the search as its topic, dated when the search took off", () => {
    const at = Date.parse("2026-09-28T10:40:00Z");
    expect(
      parseTrends(
        feed([
          trend("bukangi", [
            ["Shark fever hits Busan as 102,000 rush to see &#39;Bukangi&#39;", "https://en.yna.co.kr/view/1", "Yonhap News Agency"],
            ["Busan&#39;s shark, again", "https://koreaherald.com/2", "The Korea Herald"],
          ]),
          trend("no stories", []),
        ]),
      ),
    ).toEqual([
      { title: "Shark fever hits Busan as 102,000 rush to see 'Bukangi'", url: "https://en.yna.co.kr/view/1", source: "Yonhap News Agency", publishedAt: at, topic: "bukangi", searches: 2_000 },
    ]);
  });

  it("drops a story link hiding another address, and takes the next story", () => {
    const spam = "https://www2.university.test/tour/?&amp;xml=data:gsf,&lt;include url=&quot;//spam.test/x.xml&quot;/&gt;";
    const redirect = "https://real.test/go?to=https%3A%2F%2Fspam.test";
    const [h] = parseTrends(
      feed([
        trend("f1 gp", [
          ["HOW TO WATCH F1 GP LIVE", spam, "University"],
          ["Watch free", redirect, "Real"],
          ["Italian Grand Prix: Leclerc on pole", "https://news.test/f1", "News"],
        ]),
      ]),
    );
    expect(h).toMatchObject({ url: "https://news.test/f1", topic: "f1 gp" });
  });
});

describe("newsSources", () => {
  const keys = {
    GNEWS_API_KEY: "g-key",
    NEWSAPI_KEY: "na-key",
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
        "Google Trends US", "Google Trends SG", "Google News", "Google News Asia", "Google News entertainment",
        "UPI Odd News", "New York Post", "CoinDesk", "The Block", "Watcher Guru",
      ]),
    );
    // No world news or tech tab any more.
    expect(free.filter((n) => ["BBC News", "Yonhap News Agency", "Hacker News", "Google News world", "Google News technology"].includes(n))).toEqual([]);
    // Nor a search: the sources only a search read are gone.
    expect(free.filter((n) => ["Bing News", "GDELT"].includes(n))).toEqual([]);
    expect(free).not.toContain("GNews");
    expect(newsSources(keys).map((s) => s.name).filter((n) => !free.includes(n))).toEqual(["GNews", "NewsAPI.org", "TheNewsAPI"]);
    expect(byName("GNews").live).toContain("apikey=g-key");
  });

  it("puts each source in a tab, trending or crypto, reads each feed once, over https", () => {
    const all = newsSources(keys);
    const tab = (name: string) => all.find((s) => s.name === name)?.category;
    expect([tab("Google Trends US"), tab("Google News"), tab("UPI Odd News"), tab("CoinDesk"), tab("GNews")]).toEqual([
      "trending", "trending", "trending", "crypto", "trending",
    ]);
    expect(new Set(all.map((s) => s.category))).toEqual(new Set(["trending", "crypto"]));
    const urls = all.map((s) => s.live);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((u) => !u.startsWith("https://"))).toEqual([]);
    expect(all.filter((s) => s.category === "crypto").length).toBeGreaterThanOrEqual(30);
  });

  it("uses the feeds as their references give them", () => {
    expect(byName("Google Trends US").live).toBe("https://trends.google.com/trending/rss?geo=US");
    expect(byName("Google News entertainment").live).toBe("https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en");
  });

  it("reads each keyed API's answers", () => {
    const at = Date.parse("2026-09-28T03:40:00Z");
    const want = { title: "Busan shark Bukang-i", url: "https://news.test/a", publishedAt: at };
    expect(byName("GNews").parse(JSON.stringify({ articles: [{ title: want.title, url: want.url, publishedAt: "2026-09-28T03:40:00Z", source: { name: "Korea Times" } }] }))).toEqual([{ ...want, source: "Korea Times" }]);
    expect(byName("NewsAPI.org").parse(JSON.stringify({ articles: [
      { title: "[Removed]", url: "https://removed.test", publishedAt: "2026-09-28T03:40:00Z", source: { name: "x" } },
      { title: want.title, url: want.url, publishedAt: "2026-09-28T03:40:00Z", source: { name: "AP" } },
    ] }))).toEqual([{ ...want, source: "AP" }]);
    expect(byName("TheNewsAPI").parse(JSON.stringify({ data: [{ title: want.title, url: want.url, published_at: "2026-09-28T03:40:00.000000Z", source: "news.test" }] }))).toEqual([{ ...want, source: "news.test" }]);
    expect(byName("GNews").parse("Please limit requests")).toEqual([]); // not JSON: nothing, not an error
  });
});

describe("readSource", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never logs a key, and a failed read is nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const gnews = newsSources({ GNEWS_API_KEY: "secret-key" }).find((s) => s.name === "GNews");
    expect(await readSource(gnews!, gnews!.live)).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toContain("GNews responded 429");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("secret-key");
  });
});
