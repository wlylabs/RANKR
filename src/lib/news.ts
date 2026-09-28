// News: headlines that name a token, from Google News (its RSS search needs no key). Only the headline, the
// publisher and a link are kept; the article stays on the publisher's page. Server only.
import { MOCK, searchTokens } from "./dexscreener";
import type { MarketSnapshot, NewsItem, TokenView } from "./types";

const TTL = 15 * 60_000;
const PER_TOKEN = 20;

/** Lower case, letters and digits only: "Bukang-i" and "BUKANGI" are both "bukangi". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Whether a headline names the token: its whole name (4+ letters, so "Cat" doesn't match every cat story),
 * spelled any way ("Bukang-i" for Bukangi), or its $ticker.
 */
export function mentions(title: string, token: Pick<TokenView, "name" | "symbol">): boolean {
  const name = normalize(token.name);
  if (name.length >= 4 && normalize(title).includes(name)) return true;
  const symbol = token.symbol.replace(/[^\p{L}\p{N}]/gu, "");
  return !!symbol && new RegExp(`\\$${symbol}(?![\\p{L}\\p{N}])`, "iu").test(title);
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

/** RANKR_MOCK=1: two made-up headlines per token, so the page works offline. */
function mockHeadlines(token: TokenView): Headline[] {
  const now = Date.now();
  const url = `https://example.com/news/${token.address}`;
  return [
    { title: `Why everyone is talking about ${token.name}`, url, source: "Mock Times", publishedAt: now - 2 * 3_600_000 },
    { title: `$${token.symbol} and the story behind the meme`, url: `${url}/story`, source: "Mock Daily", publishedAt: now - 26 * 3_600_000 },
  ];
}

async function fetchHeadlines(query: string): Promise<Headline[]> {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, {
      headers: { accept: "application/rss+xml, application/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return parseRss(await res.text());
    console.warn(`[rankr] news search responded ${res.status}`);
  } catch (err) {
    console.warn(`[rankr] news search failed: ${(err as Error).message}`);
  }
  return [];
}

// Searches in flight or done, so parallel and repeated lookups ask once per TTL.
const cache = new Map<string, { headlines: Promise<Headline[]>; until: number }>();

/** Google News headlines for a search, cached for a while. Nothing (not an error) when it can't be reached. */
function search(query: string): Promise<Headline[]> {
  const now = Date.now();
  const hit = cache.get(query);
  if (hit && hit.until > now) return hit.headlines;
  if (cache.size > 500) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  const headlines = fetchHeadlines(query);
  cache.set(query, { headlines, until: now + TTL });
  return headlines;
}

/**
 * Headlines naming each token (searched by name, or by $ticker when the name is too short to count), newest
 * first; one headline shows once, under its first token.
 */
export async function newsFor(tokens: TokenView[]): Promise<NewsItem[]> {
  const found = await Promise.all(
    tokens.map(async (token) => {
      const query = normalize(token.name).length >= 4 ? `"${token.name}"` : `"$${token.symbol}"`;
      const headlines = MOCK ? mockHeadlines(token) : await search(query);
      return headlines
        .filter((h) => mentions(h.title, token))
        .slice(0, PER_TOKEN)
        .map((h) => ({
          id: h.url,
          ...h,
          token: { id: token.id, chainId: token.chainId, address: token.address, symbol: token.symbol, name: token.name },
        }));
    }),
  );
  const seen = new Set<string>();
  return found
    .flat()
    .filter((n) => !seen.has(n.url) && !!seen.add(n.url))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/**
 * Whether a token is a namesake of a story's token: its ticker or name is one of the `keywords` (normalized),
 * holds one or is held by one, 4+ letters each ("Bukang" and "Bukangi Inu" for Bukangi).
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
 * Every token named like a story's token (by its name and by its ticker), most liquid first: many tokens
 * share a ticker, and the reader picks. Throws UpstreamError when DexScreener can't be reached.
 */
export async function namesakes(name: string, symbol: string): Promise<MarketSnapshot[]> {
  const keywords = [...new Set([normalize(name), normalize(symbol)])].filter(Boolean);
  const queries = [...new Set([symbol.trim(), name.trim()])].filter(Boolean);
  const byId = new Map<string, MarketSnapshot>();
  for (const tokens of await Promise.all(queries.map(searchCached))) {
    for (const t of tokens) if (isNamesake(t, keywords)) byId.set(`${t.chainId}:${t.address}`, t);
  }
  return [...byId.values()].sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1)).slice(0, NAMESAKES);
}

