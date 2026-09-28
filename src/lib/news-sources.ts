// Where the news comes from: every free source. The ones without a key are always read: Google News (live
// sections and search), Bing News and GDELT (search), Hacker News, and publishers' own RSS. The ones with a
// free key are read once their key is set, as often as their daily quota allows. Server only.
//
// Feed URLs are taken from references, not guessed:
// - github.com/plenaryapp/awesome-rss-feeds (curated feeds, and its PR #45 for Yonhap, The Korea Herald and
//   Korea Times), github.com/vandenbroucke/rss-news-list;
// - github.com/nirholas/cryptocurrency.cv (an open-source crypto news aggregator; src/lib/crypto-news.ts, only
//   feeds its health check left enabled);
// - Google News RSS: its /rss, /rss/search and /rss/headlines/section/topic/<TOPIC> forms with hl, gl, ceid;
//   Bing News: a news search with &format=rss (and qft=sortbydate="1" for newest first); GDELT DOC 2.0 API
//   (one request per 5 seconds per IP); Hacker News' Algolia API; UPI Odd News and New York Post feeds as
//   their sites list them.
import type { NewsCategory } from "./types";

export type Headline = { title: string; url: string; source: string | null; publishedAt: number };

export type Source = {
  /** For logs; never the URL, which may hold a key. */
  name: string;
  /** Which tab of the news page its headlines are in. */
  category: NewsCategory;
  /** The live list, if the source has one. */
  live?: string;
  /** A search, if the source can (and its quota allows it). */
  search?: (q: string) => string;
  parse: (body: string) => Headline[];
  /** How long a read is kept: minutes for free feeds, hours for keyed APIs with a small daily quota. */
  ttl: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}

function tag(item: string, name: string): string | null {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}

/**
 * A date as the sources write it: RFC 822 (RSS), ISO 8601, "2026-09-28 03:40:00" (UTC, NewsData),
 * "2026-09-28 03:40:00 +0000" (Currents) or "20260928T034000Z" (GDELT). NaN when it isn't one.
 */
export function parseDate(text: string | null | undefined): number {
  if (!text) return Number.NaN;
  const s = text.trim();
  const gdelt = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (gdelt) return Date.UTC(+gdelt[1], +gdelt[2] - 1, +gdelt[3], +gdelt[4], +gdelt[5], +gdelt[6]);
  const plain = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (plain) {
    const zone = !plain[3] || plain[3].toUpperCase() === "Z" ? "Z" : plain[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    return Date.parse(`${plain[1]}T${plain[2]}${zone}`);
  }
  return Date.parse(s);
}

/** A headline if it has a title, a web link (it goes in an href) and a date. */
function headline(title: unknown, url: unknown, source: unknown, date: unknown): Headline | null {
  const t = typeof title === "string" ? decode(title) : "";
  const u = typeof url === "string" ? url.trim() : "";
  const publishedAt = parseDate(typeof date === "string" ? date : null);
  if (!t || !/^https?:\/\//i.test(u) || !Number.isFinite(publishedAt)) return null;
  return { title: t, url: u, source: typeof source === "string" && source.trim() ? source.trim() : null, publishedAt };
}

/**
 * The items of an RSS feed. The publisher is the item's <source> (Google News), <News:Source> (Bing) or, for a
 * publisher's own feed, `publisher`. Google News ends a title with " - Publisher", which is dropped.
 */
export function parseRss(xml: string, publisher?: string): Headline[] {
  const out: Headline[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const source = tag(item, "source") ?? tag(item, "News:Source") ?? publisher ?? null;
    let title = tag(item, "title") ?? "";
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const h = headline(title, tag(item, "link"), source, tag(item, "pubDate") ?? tag(item, "dc:date"));
    if (h) out.push(h);
  }
  return out;
}

type Json = Record<string, unknown>;

/** Headlines from a JSON body: the list at `list`, each read by `pick`. Nothing when the body isn't that. */
function json(list: (body: Json) => unknown, pick: (a: Json) => Headline | null) {
  return (body: string): Headline[] => {
    try {
      const items = list(JSON.parse(body) as Json);
      return Array.isArray(items) ? items.flatMap((a) => (a && typeof a === "object" ? (pick(a as Json) ?? []) : [])) : [];
    } catch {
      return [];
    }
  };
}

const field = (o: unknown, key: string): unknown => (o && typeof o === "object" ? (o as Json)[key] : undefined);
const domain = (url: unknown) => (typeof url === "string" ? url.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] : null);

const GOOGLE = "https://news.google.com/rss";
const EN_US = "hl=en-US&gl=US&ceid=US:en";
const q = encodeURIComponent;

type Feed = [name: string, url: string];

/** Publishers' own RSS, by tab: world news (Asia too, where stories like Busan's shark break), odd news, crypto. */
const WORLD: Feed[] = [
  ["BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["The Guardian", "https://www.theguardian.com/world/rss"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["NPR", "https://www.npr.org/rss/rss.php?id=1004"],
  ["Sky News", "https://feeds.skynews.com/feeds/rss/world.xml"],
  ["DW", "https://rss.dw.com/xml/rss-en-all"],
  ["CBC News", "https://www.cbc.ca/cmlink/rss-world"],
  ["Yonhap News Agency", "https://en.yna.co.kr/RSS/news.xml"],
  ["The Korea Herald", "https://www.koreaherald.com/rss/newsAll"],
  ["Korea Times", "https://www.koreatimes.co.kr/www/rss/nation.xml"],
  ["CNA", "https://www.channelnewsasia.com/rssfeeds/8395986"],
];
const VIRAL: Feed[] = [
  ["UPI Odd News", "https://rss.upi.com/news/odd_news.rss"],
  ["New York Post", "https://nypost.com/feed/"],
];
/** Crypto news outlets, as cryptocurrency.cv lists them (enabled ones). */
const CRYPTO: Feed[] = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["The Block", "https://www.theblock.co/rss.xml"],
  ["Decrypt", "https://decrypt.co/feed"],
  ["CoinTelegraph", "https://cointelegraph.com/rss"],
  ["Blockworks", "https://blockworks.co/feed"],
  ["CryptoSlate", "https://cryptoslate.com/feed/"],
  ["NewsBTC", "https://www.newsbtc.com/feed/"],
  ["Bitcoinist", "https://bitcoinist.com/feed/"],
  ["BeInCrypto", "https://beincrypto.com/feed/"],
  ["U.Today", "https://u.today/rss"],
  ["Crypto Briefing", "https://cryptobriefing.com/feed/"],
  ["The Daily Hodl", "https://dailyhodl.com/feed/"],
  ["Watcher Guru", "https://watcher.guru/news/feed"],
  ["Cryptopolitan", "https://www.cryptopolitan.com/feed/"],
  ["Bitcoin.com News", "https://news.bitcoin.com/feed/"],
  ["CoinJournal", "https://coinjournal.net/feed/"],
  ["CryptoGlobe", "https://www.cryptoglobe.com/latest/feed/"],
  ["Crypto Daily", "https://cryptodaily.co.uk/feed"],
  ["Coinspeaker", "https://www.coinspeaker.com/feed/"],
  ["TheNewsCrypto", "https://thenewscrypto.com/feed/"],
  ["Crypto-News Flash", "https://www.crypto-news-flash.com/feed/"],
  ["InsideBitcoins", "https://insidebitcoins.com/feed"],
  ["TheCryptoBasic", "https://thecryptobasic.com/feed/"],
  ["CoinCentral", "https://coincentral.com/news/feed/"],
  ["CryptoNewsZ", "https://www.cryptonewsz.com/feed/"],
  ["Protos", "https://protos.com/feed/"],
  ["Unchained Crypto", "https://unchainedcrypto.com/feed/"],
  ["Forkast News", "https://forkast.news/feed/"],
  ["Blockhead", "https://www.blockhead.co/latest/rss/"],
  ["The Crypto Times India", "https://www.cryptotimes.io/feed/"],
  ["BitPinas", "https://bitpinas.com/feed/"],
  ["Wu Blockchain", "https://wublock.substack.com/feed"],
  ["CNBC Crypto", "https://www.cnbc.com/id/100727362/device/rss/rss.html"],
  ["Yahoo Finance Crypto", "https://finance.yahoo.com/rss/cryptocurrency"],
  ["TechCrunch Crypto", "https://techcrunch.com/category/cryptocurrency/feed/"],
];

/** Every source to read: the free ones, and the keyed ones whose key is set in `env`. */
export function newsSources(env: Record<string, string | undefined> = process.env): Source[] {
  const out: Source[] = [
    {
      name: "Google News",
      category: "world",
      live: `${GOOGLE}?${EN_US}`,
      search: (s) => `${GOOGLE}/search?q=${q(s)}&${EN_US}`,
      parse: (b) => parseRss(b),
      ttl: 5 * MINUTE,
    },
    {
      name: "Google News Asia",
      category: "world",
      live: `${GOOGLE}?hl=en-SG&gl=SG&ceid=SG:en`,
      parse: (b) => parseRss(b),
      ttl: 5 * MINUTE,
    },
    ...(
      [
        ["WORLD", "world"],
        ["ENTERTAINMENT", "viral"],
        ["SCIENCE", "viral"],
        ["TECHNOLOGY", "tech"],
      ] as const
    ).map(([topic, category]) => ({
      name: `Google News ${topic.toLowerCase()}`,
      category,
      live: `${GOOGLE}/headlines/section/topic/${topic}?${EN_US}`,
      parse: (b: string) => parseRss(b),
      ttl: 5 * MINUTE,
    })),
    {
      name: "Bing News",
      category: "world",
      search: (s) => `https://www.bing.com/news/search?q=${q(s)}&qft=${q('sortbydate="1"')}&format=rss`,
      parse: (b) => parseRss(b),
      ttl: 15 * MINUTE,
    },
    {
      // Free and keyless, about one request per 5 seconds: searches only.
      name: "GDELT",
      category: "world",
      search: (s) =>
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${q(`${s} sourcelang:english`)}&mode=artlist&format=json&sort=datedesc&maxrecords=50&timespan=3d`,
      parse: json(
        (b) => b.articles,
        (a) => headline(a.title, a.url, a.domain, a.seendate),
      ),
      ttl: 15 * MINUTE,
    },
    {
      name: "Hacker News",
      category: "tech",
      live: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
      search: (s) => `https://hn.algolia.com/api/v1/search_by_date?query=${q(s)}&tags=story&hitsPerPage=30`,
      parse: json(
        (b) => b.hits,
        (a) => headline(a.title, a.url ?? `https://news.ycombinator.com/item?id=${a.objectID}`, "Hacker News", a.created_at),
      ),
      ttl: 5 * MINUTE,
    },
    ...(
      [
        [WORLD, "world"],
        [VIRAL, "viral"],
        [CRYPTO, "crypto"],
      ] as const
    ).flatMap(([feeds, category]) =>
      feeds.map(([name, url]) => ({ name, category, live: url, parse: (b: string) => parseRss(b, name), ttl: 10 * MINUTE })),
    ),
  ];

  // Free keys. How often each is read keeps it inside its free daily quota, searches included.
  const gnews = env.GNEWS_API_KEY;
  if (gnews) {
    out.push({
      name: "GNews", // 100 requests a day
      category: "world",
      live: `https://gnews.io/api/v4/top-headlines?lang=en&max=10&apikey=${q(gnews)}`,
      search: (s) => `https://gnews.io/api/v4/search?q=${q(s)}&lang=en&sortby=publishedAt&max=10&apikey=${q(gnews)}`,
      parse: json(
        (b) => b.articles,
        (a) => headline(a.title, a.url, field(a.source, "name"), a.publishedAt),
      ),
      ttl: HOUR,
    });
  }
  const newsdata = env.NEWSDATA_API_KEY;
  if (newsdata) {
    out.push({
      name: "NewsData.io", // 200 credits a day
      category: "world",
      live: `https://newsdata.io/api/1/latest?language=en&apikey=${q(newsdata)}`,
      search: (s) => `https://newsdata.io/api/1/latest?language=en&q=${q(s)}&apikey=${q(newsdata)}`,
      parse: json(
        (b) => b.results,
        (a) => headline(a.title, a.link, a.source_name ?? a.source_id, a.pubDate),
      ),
      ttl: 30 * MINUTE,
    });
  }
  const guardian = env.GUARDIAN_API_KEY;
  if (guardian) {
    out.push({
      name: "The Guardian API", // 5,000 requests a day
      category: "world",
      live: `https://content.guardianapis.com/search?order-by=newest&page-size=30&api-key=${q(guardian)}`,
      search: (s) => `https://content.guardianapis.com/search?q=${q(s)}&order-by=newest&page-size=30&api-key=${q(guardian)}`,
      parse: json(
        (b) => field(b.response, "results"),
        (a) => headline(a.webTitle, a.webUrl, "The Guardian", a.webPublicationDate),
      ),
      ttl: 5 * MINUTE,
    });
  }
  const newsapi = env.NEWSAPI_KEY;
  if (newsapi) {
    out.push({
      name: "NewsAPI.org", // 100 requests a day (its free plan is for development)
      category: "world",
      live: `https://newsapi.org/v2/top-headlines?language=en&pageSize=50&apiKey=${q(newsapi)}`,
      search: (s) => `https://newsapi.org/v2/everything?q=${q(s)}&language=en&sortBy=publishedAt&pageSize=50&apiKey=${q(newsapi)}`,
      parse: json(
        (b) => b.articles,
        (a) => (a.title === "[Removed]" ? null : headline(a.title, a.url, field(a.source, "name"), a.publishedAt)),
      ),
      ttl: HOUR,
    });
  }
  const currents = env.CURRENTS_API_KEY;
  if (currents) {
    out.push({
      name: "Currents", // about 600 requests a day
      category: "world",
      live: `https://api.currentsapi.services/v1/latest-news?language=en&apiKey=${q(currents)}`,
      search: (s) => `https://api.currentsapi.services/v1/search?keywords=${q(s)}&language=en&apiKey=${q(currents)}`,
      parse: json(
        (b) => b.news,
        (a) => headline(a.title, a.url, domain(a.url), a.published),
      ),
      ttl: 15 * MINUTE,
    });
  }
  const thenewsapi = env.THENEWSAPI_KEY;
  if (thenewsapi) {
    out.push({
      name: "TheNewsAPI", // 3 requests a day on the free plan: the live list only, three times a day
      category: "world",
      live: `https://api.thenewsapi.com/v1/news/top?language=en&locale=us&api_token=${q(thenewsapi)}`,
      parse: json(
        (b) => b.data,
        (a) => headline(a.title, a.url, a.source, a.published_at),
      ),
      ttl: 8 * HOUR,
    });
  }
  return out;
}

async function fetchSource(source: Source, url: string): Promise<Headline[]> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/rss+xml, application/xml, application/json;q=0.9, */*;q=0.8", "user-agent": "RankrNews/1.0" },
      cache: "no-store",
      // Many feeds are read at once: a slow one doesn't hold the page up for long.
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) return source.parse(await res.text());
    console.warn(`[rankr] news: ${source.name} responded ${res.status}`);
  } catch (err) {
    console.warn(`[rankr] news: ${source.name} failed: ${(err as Error).message}`);
  }
  return [];
}

// Reads in flight or done, so parallel and repeated reads ask once per TTL.
const cache = new Map<string, { headlines: Promise<Headline[]>; until: number }>();

/** A source's headlines at `url` (its live list or a search), cached for its TTL. Nothing when it fails. */
export function readSource(source: Source, url: string): Promise<Headline[]> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.until > now) return hit.headlines;
  if (cache.size > 1_000) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  const headlines = fetchSource(source, url);
  cache.set(url, { headlines, until: now + source.ttl });
  return headlines;
}
