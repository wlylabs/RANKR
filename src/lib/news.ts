// News: what's in the news right now from every free source (src/lib/news-sources.ts), each story once, and
// every token named after a story, from DexScreener. Only the headline, the publisher and a link are kept; the
// article stays on the publisher's page. Server only.
import { MOCK, searchTokens } from "./dexscreener";
import { newsSources, readSource, type Headline, type Source } from "./news-sources";
import type { MarketSnapshot, NewsCategory, NewsItem } from "./types";

/** Each tab's list: the newest of each category. */
const PER_CATEGORY = 60;
/** No one source crowds out the rest. */
const PER_SOURCE = 20;
/** The live list is today's news: feeds that keep older items don't bring them back. */
const LIVE_WINDOW = 48 * 3_600_000;

/** Lower case, letters and digits only: "Bukang-i" and "BUKANGI" are both "bukangi". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
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
    "again inside meet meets gets get goes go back home help " +
    // Crypto headlines' own words: "Memecoin named after Busan's shark Bukangi jumps 300%".
    "memecoin memecoins coin coins token tokens crypto cryptocurrency price prices market markets rally jumps " +
    "surges surge soars plunges trader traders whale whales"
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

/** A headline in its source's category. */
type Tagged = Headline & { category: NewsCategory };

/** RANKR_MOCK=1: made-up stories, so the page works offline. */
function mockHeadlines(): Tagged[] {
  const now = Date.now();
  return (
    [
      ["Over 560,000 visitors flock to Busan to see canal-trapped shark Bukang-i", "world", 0.3],
      ["Moo Deng turns two: Thailand's famous pygmy hippo celebrates with a fruit cake", "viral", 2],
      ["Peanut the Squirrel's owner opens animal sanctuary a year later", "viral", 5],
      ["Shark fever hits Busan as 102,000 rush to see 'Bukangi' at start of Chuseok break", "world", 9],
      ["Memecoin named after Busan's shark Bukangi jumps 300% in a day", "crypto", 11],
      ["Chill Guy meme creator on the dog that became a symbol of calm", "viral", 20],
      ["Show HN: a tracker for tokens named after the news", "tech", 26],
    ] as const
  ).map(([title, category, hours], i) => ({
    title,
    category,
    url: `https://example.com/news/${i}`,
    source: ["Mock Times", "Mock Daily", "Mock Wire"][i % 3],
    publishedAt: now - hours * 3_600_000,
  }));
}

/**
 * Newest first, each story once (the same headline can be in several feeds), at most `PER_CATEGORY` of each
 * category, with its keywords.
 */
function toItems(headlines: Tagged[]): NewsItem[] {
  const seen = new Set<string>();
  const counts = new Map<NewsCategory, number>();
  return headlines
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((h) => {
      const keys = [h.url, normalize(h.title)];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      const n = counts.get(h.category) ?? 0;
      counts.set(h.category, n + 1);
      return n < PER_CATEGORY;
    })
    .map((h) => ({ id: h.url, ...h, keywords: keywordsOf(h.title) }));
}

/** A source's newest `PER_SOURCE` headlines at `url` (since `since`), in its category. */
async function newest(source: Source, url: string, since = 0): Promise<Tagged[]> {
  return (await readSource(source, url))
    .filter((h) => h.publishedAt >= since)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, PER_SOURCE)
    .map((h) => ({ ...h, category: source.category }));
}

/** What's in the news right now, from every source with a live list, newest first. */
export async function liveNews(): Promise<NewsItem[]> {
  if (MOCK) return toItems(mockHeadlines());
  const since = Date.now() - LIVE_WINDOW;
  const lists = await Promise.all(newsSources().flatMap((s) => (s.live ? [newest(s, s.live, since)] : [])));
  return toItems(lists.flat());
}

/** Headlines for a search, from every source that can search, newest first. */
export async function searchNews(query: string): Promise<NewsItem[]> {
  if (MOCK) return toItems(mockHeadlines().filter((h) => normalize(h.title).includes(normalize(query))));
  const lists = await Promise.all(newsSources().flatMap((s) => (s.search ? [newest(s, s.search(query))] : [])));
  return toItems(lists.flat());
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
