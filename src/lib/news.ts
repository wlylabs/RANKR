// News: what's in the news right now, from Google News' RSS (top stories and a few sections; no key), and
// every token named after a story, from DexScreener. Only the headline, the publisher and a link are kept; the
// article stays on the publisher's page. Server only.
import { MOCK, searchTokens } from "./dexscreener";
import type { MarketSnapshot, NewsItem } from "./types";

const GOOGLE_NEWS = "https://news.google.com/rss";
const EN_US = "hl=en-US&gl=US&ceid=US:en";
/**
 * The live list: top stories (the US edition and an Asian one, where stories like Busan's shark break) and the
 * sections memes come from.
 */
const FEEDS = [
  `${GOOGLE_NEWS}?${EN_US}`,
  `${GOOGLE_NEWS}?hl=en-SG&gl=SG&ceid=SG:en`,
  ...["WORLD", "ENTERTAINMENT", "SCIENCE", "TECHNOLOGY"].map((t) => `${GOOGLE_NEWS}/headlines/section/topic/${t}?${EN_US}`),
];
const LIVE_TTL = 5 * 60_000;
const SEARCH_TTL = 15 * 60_000;
const MAX_ITEMS = 60;

/** Lower case, letters and digits only: "Bukang-i" and "BUKANGI" are both "bukangi". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

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

export type Headline = { title: string; url: string; source: string | null; publishedAt: number };

/** The items of an RSS feed. Google News ends a title with " - Publisher", which is dropped. */
export function parseRss(xml: string): Headline[] {
  const out: Headline[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const source = tag(item, "source");
    let title = tag(item, "title") ?? "";
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const url = tag(item, "link") ?? "";
    const publishedAt = Date.parse(tag(item, "pubDate") ?? "");
    // Only web links: the page puts it in an href.
    if (title && /^https?:\/\//i.test(url) && Number.isFinite(publishedAt)) out.push({ title, url, source, publishedAt });
  }
  return out;
}

// Words a headline has in capitals only because they start it, or that name nothing a token would be named after.
const COMMON = new Set(
  (
    "a an the and or but nor of to in on at for from by with as is are was were be been being has have had it its " +
    "this that these those after before over under into about up down out off new news says said say will would can " +
    "could may might must more most first last next year years day days week weeks month time times people man woman " +
    "men women world how why what who when where which amid near just than then their there here our your his her " +
    "they we you i he she one two three four five see sees seen rush rushes flock flocks visitors turns opens owner " +
    "start break report reports live video watch photos update breaking top best big small all no not only still " +
    "again inside meet meets gets get goes go back home help"
  ).split(" "),
);
/** Small words that may sit inside a name: "Peanut the Squirrel". */
const JOINERS = new Set(["the", "of", "de", "la", "van", "von"]);

/** A word without the quotes and punctuation around it, or its "'s": "'Bukangi'," is Bukangi, "Thailand's" is Thailand. */
function bare(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/['’]s$/i, "");
}

/**
 * What a token named after a story would be called, best first (up to 4): a quoted name ('Bukangi'), a run of
 * capitalised words ("Moo Deng", "Peanut the Squirrel"), or a capitalised word (Busan). Not common words, nor
 * the capital a headline starts with.
 */
export function keywordsOf(title: string): string[] {
  const found = new Map<string, { text: string; score: number; at: number }>();
  const add = (text: string, score: number, at: number) => {
    const key = normalize(text);
    if (key.length < 3 || /^\d+$/.test(key) || COMMON.has(key)) return;
    const had = found.get(key);
    if (!had || had.score < score) found.set(key, { text, score, at: had?.at ?? at });
  };

  // Quoted, one to three words: 'Bukangi', "Moo Deng". Not a quoted sentence.
  for (const m of title.matchAll(/(?<=^|\s)['"‘“]([^'"’”]{2,40}?)['"’”](?=[\s,.:;!?)]|$)/gu)) {
    const words = m[1].trim().split(/\s+/);
    if (words.length <= 3) add(words.map(bare).join(" "), 6, m.index ?? 0);
  }

  const words = title.split(/\s+/);
  let run: { text: string; at: number }[] = [];
  const flush = () => {
    const names = run.filter((w) => !JOINERS.has(w.text.toLowerCase()));
    if (names.length >= 2 && run.length <= 4) {
      add(run.map((w) => w.text).join(" "), 5, run[0].at);
      // A part of a name ("Deng" of Moo Deng) comes after names standing alone.
      for (const w of names) add(w.text, 2, w.at);
    } else {
      for (const w of names) add(w.text, 3 + (w.text.includes("-") ? 1 : 0) + (w.text.length >= 5 ? 1 : 0) - (w.at === 0 ? 1 : 0), w.at);
    }
    run = [];
  };
  words.forEach((raw, at) => {
    const word = bare(raw);
    const quoted = /^['"‘“]/.test(raw);
    const capital = /^\p{Lu}/u.test(word) && !COMMON.has(normalize(word));
    const joiner = run.length > 0 && JOINERS.has(word.toLowerCase()) && /^\p{Lu}/u.test(bare(words[at + 1] ?? ""));
    if (capital && !quoted) run.push({ text: word, at });
    else if (joiner) run.push({ text: word.toLowerCase(), at });
    else flush();
    // A name ends at a comma or a colon: "Moo Deng turns two: Thailand's…".
    if (/[,:;]$/.test(raw)) flush();
  });
  flush();

  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 4)
    .map((k) => k.text);
}

/** RANKR_MOCK=1: made-up stories, so the page works offline. */
function mockHeadlines(): Headline[] {
  const now = Date.now();
  const hours = [0.3, 2, 5, 9, 20, 30];
  return [
    "Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i",
    "Moo Deng turns two: Thailand's famous pygmy hippo celebrates with a fruit cake",
    "Peanut the Squirrel's owner opens animal sanctuary a year later",
    "Shark fever hits Busan as 102,000 rush to see 'Bukangi' at start of Chuseok break",
    "Chill Guy meme creator on the dog that became a symbol of calm",
    "Giant pumpkin named 'Big Moe' breaks state record",
  ].map((title, i) => ({
    title,
    url: `https://example.com/news/${i}`,
    source: ["Mock Times", "Mock Daily", "Mock Wire"][i % 3],
    publishedAt: now - hours[i] * 3_600_000,
  }));
}

async function fetchFeed(url: string): Promise<Headline[]> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/rss+xml, application/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return parseRss(await res.text());
    console.warn(`[rankr] news feed responded ${res.status}`);
  } catch (err) {
    console.warn(`[rankr] news feed failed: ${(err as Error).message}`);
  }
  return [];
}

// Feeds in flight or read, so parallel and repeated reads ask once per TTL.
const cache = new Map<string, { headlines: Promise<Headline[]>; until: number }>();

/** A feed's headlines, cached for `ttl`. Nothing (not an error) when it can't be reached. */
function read(url: string, ttl: number): Promise<Headline[]> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.until > now) return hit.headlines;
  if (cache.size > 500) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  const headlines = fetchFeed(url);
  cache.set(url, { headlines, until: now + ttl });
  return headlines;
}

/** Newest first, each story once (the same headline can be in several feeds), with its keywords. */
function toItems(headlines: Headline[]): NewsItem[] {
  const seen = new Set<string>();
  return headlines
    .filter((h) => {
      const keys = [h.url, normalize(h.title)];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    })
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_ITEMS)
    .map((h) => ({ id: h.url, ...h, keywords: keywordsOf(h.title) }));
}

/** What's in the news right now: top stories and a few sections, newest first. */
export async function liveNews(): Promise<NewsItem[]> {
  if (MOCK) return toItems(mockHeadlines());
  return toItems((await Promise.all(FEEDS.map((url) => read(url, LIVE_TTL)))).flat());
}

/** Headlines for a search, newest first. */
export async function searchNews(query: string): Promise<NewsItem[]> {
  if (MOCK) return toItems(mockHeadlines().filter((h) => normalize(h.title).includes(normalize(query))));
  return toItems(await read(`${GOOGLE_NEWS}/search?q=${encodeURIComponent(query)}&${EN_US}`, SEARCH_TTL));
}

/**
 * Whether a token is named after a story: its ticker or name is one of the `keywords` (normalized), holds one
 * or is held by one, 4+ letters each ("Bukang" and "Bukangi Inu" for Bukangi).
 */
export function isNamesake(token: Pick<MarketSnapshot, "name" | "symbol">, keywords: string[]): boolean {
  const own = [normalize(token.symbol), normalize(token.name)].filter(Boolean);
  return keywords.some((k) =>
    own.some((x) => x === k || (x.length >= 4 && k.length >= 4 && (x.includes(k) || k.includes(x)))),
  );
}

const NAMESAKES = 12;
const found = new Map<string, { tokens: Promise<MarketSnapshot[]>; until: number }>();

/** DexScreener's tokens for a search, for a minute (market numbers move). A failed search isn't kept. */
function searchCached(query: string): Promise<MarketSnapshot[]> {
  const now = Date.now();
  const hit = found.get(query);
  if (hit && hit.until > now) return hit.tokens;
  if (found.size > 500) for (const [k, v] of found) if (v.until <= now) found.delete(k);
  const tokens = searchTokens(query);
  found.set(query, { tokens, until: now + 60_000 });
  tokens.catch(() => found.get(query)?.tokens === tokens && found.delete(query));
  return tokens;
}

/**
 * Every token named after `keyword` (a name from a story), most liquid first: many tokens share a name or a
 * ticker, and the reader picks. Searched as written and run together ("Bukang-i" and "Bukangi"). Throws
 * UpstreamError when DexScreener can't be reached.
 */
export async function namesakes(keyword: string): Promise<MarketSnapshot[]> {
  const queries = [...new Set([keyword.trim(), keyword.replace(/[^\p{L}\p{N}]/gu, "")])].filter(Boolean);
  const keywords = [normalize(keyword)].filter(Boolean);
  const byId = new Map<string, MarketSnapshot>();
  for (const tokens of await Promise.all(queries.map(searchCached))) {
    for (const t of tokens) if (isNamesake(t, keywords)) byId.set(`${t.chainId}:${t.address}`, t);
  }
  return [...byId.values()].sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1)).slice(0, NAMESAKES);
}
