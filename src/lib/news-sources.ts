// Where the news comes from: every free source, for two tabs, trending and crypto. The ones without a key are
// always read: Google Trends (what people search for right now, with the story behind each search), Google News
// (top stories) and publishers' own RSS. The ones with a free key are read once their key is set, as often as
// their daily quota allows. Server only.
//
// Feed URLs are taken from references, not guessed:
// - Google Trends' "Trending now" RSS, trends.google.com/trending/rss?geo=<country>: each <item> is a search
//   (its <title>) with the stories behind it (<ht:news_item>: <ht:news_item_title>, _url, _source), as
//   github.com/minodisk/google-trends-bot reads it. Its story links have carried spam that hides another
//   address in a real site's link (github.com/tmokmss/my-ambient-agents issue #728): those are dropped;
// - github.com/nirholas/cryptocurrency.cv (an open-source crypto news aggregator; src/lib/crypto-news.ts, only
//   feeds its health check left enabled);
// - Google News RSS: its /rss and /rss/headlines/section/topic/<TOPIC> forms with hl, gl, ceid; UPI Odd News and
//   New York Post feeds as their sites list them.
import type { NewsCategory } from "./types";

export type Headline = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: number;
  /** What people searched for, when the source says (Google Trends): the likeliest name for a token. */
  topic?: string;
  /** How many searched for it in the last day, when the source says (Google Trends; a floor). */
  searches?: number;
};

export type Source = {
  /** For logs; never the URL, which may hold a key. */
  name: string;
  /** Which tab of the news page its headlines are in. */
  category: NewsCategory;
  /** Its list of what's in the news now. */
  live: string;
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
 * A date as news sources write it: RFC 822 (RSS), ISO 8601, "2026-09-28 03:40:00" (UTC),
 * "2026-09-28 03:40:00 +0000" or "20260928T034000Z". NaN when it isn't one.
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

/** A link hiding another address (a second URL, or a data: URL, in its query) is spam, not a story. */
function hidesAnother(url: string): boolean {
  let rest = url.replace(/^https?:\/\//i, "");
  try {
    rest = decodeURIComponent(rest);
  } catch {
    // Kept as written.
  }
  return /:\/\/|data:/i.test(rest);
}

/** Google Trends' approx_traffic ("2000+", "200,000+", "50K+", "1M+"): its floor, as a number. Null if it isn't one. */
export function parseTraffic(text: string | null): number | null {
  const m = text?.replace(/[,\s]/g, "").match(/^(\d+(?:\.\d+)?)([KMB])?\+?$/i);
  if (!m) return null;
  const unit = m[2] ? { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase() as "K" | "M" | "B"] : 1;
  return Math.round(Number(m[1]) * unit);
}

/**
 * Google Trends' "Trending now" RSS: each item is a search people make right now, with the stories behind it.
 * One story per search (the first that isn't spam), dated when the search took off, the search as its topic and
 * how many made it (approx_traffic).
 */
export function parseTrends(xml: string): Headline[] {
  const out: Headline[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const topic = tag(item, "title");
    const date = tag(item, "pubDate");
    const searches = parseTraffic(tag(item, "ht:approx_traffic"));
    for (const [, story] of item.matchAll(/<ht:news_item\b[^>]*>([\s\S]*?)<\/ht:news_item>/gi)) {
      const url = tag(story, "ht:news_item_url") ?? "";
      const h = hidesAnother(url) ? null : headline(tag(story, "ht:news_item_title"), url, tag(story, "ht:news_item_source"), date);
      if (h) {
        out.push({ ...h, ...(topic && { topic }), ...(searches && { searches }) });
        break;
      }
    }
  }
  return out;
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

const GOOGLE = "https://news.google.com/rss";
const EN_US = "hl=en-US&gl=US&ceid=US:en";
const q = encodeURIComponent;

type Feed = [name: string, url: string];

/** Where Google Trends is read: English-speaking countries, so the names in the stories are in English. */
const TRENDS_GEOS = ["US", "GB", "CA", "AU", "IN", "SG"];

/** Publishers' own RSS, by tab: odd and viral news (what memes come from), crypto. */
const TRENDING: Feed[] = [
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
    ...TRENDS_GEOS.map((geo) => ({
      name: `Google Trends ${geo}`,
      category: "trending" as const,
      live: `https://trends.google.com/trending/rss?geo=${geo}`,
      parse: parseTrends,
      ttl: 10 * MINUTE,
    })),
    {
      // Top stories: what Google ranks as the news right now.
      name: "Google News",
      category: "trending",
      live: `${GOOGLE}?${EN_US}`,
      parse: (b) => parseRss(b),
      ttl: 5 * MINUTE,
    },
    {
      name: "Google News Asia",
      category: "trending",
      live: `${GOOGLE}?hl=en-SG&gl=SG&ceid=SG:en`,
      parse: (b) => parseRss(b),
      ttl: 5 * MINUTE,
    },
    ...["ENTERTAINMENT", "SCIENCE"].map((topic) => ({
      name: `Google News ${topic.toLowerCase()}`,
      category: "trending" as const,
      live: `${GOOGLE}/headlines/section/topic/${topic}?${EN_US}`,
      parse: (b: string) => parseRss(b),
      ttl: 5 * MINUTE,
    })),
    ...(
      [
        [TRENDING, "trending"],
        [CRYPTO, "crypto"],
      ] as const
    ).flatMap(([feeds, category]) =>
      feeds.map(([name, url]) => ({ name, category, live: url, parse: (b: string) => parseRss(b, name), ttl: 10 * MINUTE })),
    ),
  ];

  // Free keys: their top headlines, read as often as each one's free daily quota allows.
  const gnews = env.GNEWS_API_KEY;
  if (gnews) {
    out.push({
      name: "GNews", // 100 requests a day
      category: "trending",
      live: `https://gnews.io/api/v4/top-headlines?lang=en&max=10&apikey=${q(gnews)}`,
      parse: json(
        (b) => b.articles,
        (a) => headline(a.title, a.url, field(a.source, "name"), a.publishedAt),
      ),
      ttl: HOUR,
    });
  }
  const newsapi = env.NEWSAPI_KEY;
  if (newsapi) {
    out.push({
      name: "NewsAPI.org", // 100 requests a day (its free plan is for development)
      category: "trending",
      live: `https://newsapi.org/v2/top-headlines?language=en&pageSize=50&apiKey=${q(newsapi)}`,
      parse: json(
        (b) => b.articles,
        (a) => (a.title === "[Removed]" ? null : headline(a.title, a.url, field(a.source, "name"), a.publishedAt)),
      ),
      ttl: HOUR,
    });
  }
  const thenewsapi = env.THENEWSAPI_KEY;
  if (thenewsapi) {
    out.push({
      name: "TheNewsAPI", // 3 requests a day on the free plan: three times a day
      category: "trending",
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

/** A source's headlines at `url`, cached for its TTL. Nothing when it fails. */
export function readSource(source: Source, url: string): Promise<Headline[]> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.until > now) return hit.headlines;
  if (cache.size > 1_000) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  const headlines = fetchSource(source, url);
  cache.set(url, { headlines, until: now + source.ttl });
  return headlines;
}
