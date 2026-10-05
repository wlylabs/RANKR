// Rupiah per dollar, to show paper trades in IDR. Free sources with no key (one rate a day is plenty for
// this), each tried in turn, kept for hours per server:
// - ExchangeRate-API's open access endpoint (open.er-api.com): its terms ask for a "Rates By Exchange Rate API"
//   link wherever its rates are shown (FxRate.credit);
// - Frankfurter (frankfurter.dev, central banks' rates, MIT, no attribution);
// - fawazahmed0/exchange-api (CC0) on jsDelivr, then on its Cloudflare mirror as its README asks; jsDelivr can
//   serve @latest days old, so a rate more than 3 days old is refused.
// Server only.
import { take } from "./budget";
import { MOCK } from "./dexscreener";

export type FxRate = {
  /** Rupiah per US dollar. */
  usdIdr: number;
  /** The day the rate is for, as the source says it ("2026-10-04"), when it does. */
  date: string | null;
  source: string;
  /** The link a source asks for wherever its rates are shown. */
  credit?: { text: string; url: string };
  fetchedAt: number;
};

type Source = {
  name: string;
  url: string;
  read: (body: unknown) => { rate: unknown; date: unknown };
  credit?: FxRate["credit"];
  /** Refuse a rate older than this many days (by its date). */
  maxAgeDays?: number;
};

type ErApi = { result?: string; time_last_update_unix?: number; rates?: { IDR?: number } };
type Frankfurter = { date?: string; rate?: number };
type CurrencyApi = { date?: string; usd?: { idr?: number } };

const day = (unix: number | undefined) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null);
const currencyApi = (b: unknown) => ({ rate: (b as CurrencyApi).usd?.idr, date: (b as CurrencyApi).date });

const SOURCES: Source[] = [
  {
    name: "ExchangeRate-API",
    url: "https://open.er-api.com/v6/latest/USD",
    read: (b) => {
      const er = b as ErApi;
      return { rate: er.result === "success" ? er.rates?.IDR : undefined, date: day(er.time_last_update_unix) };
    },
    credit: { text: "Rates By Exchange Rate API", url: "https://www.exchangerate-api.com" },
    maxAgeDays: 3,
  },
  {
    name: "Frankfurter",
    url: "https://api.frankfurter.dev/v2/rate/USD/IDR",
    read: (b) => ({ rate: (b as Frankfurter).rate, date: (b as Frankfurter).date }),
    // Central banks publish on working days: a long weekend can leave the last rate four days old.
    maxAgeDays: 5,
  },
  {
    name: "fawazahmed0/exchange-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
    read: currencyApi,
    maxAgeDays: 3,
  },
  {
    name: "fawazahmed0/exchange-api",
    url: "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
    read: currencyApi,
    maxAgeDays: 3,
  },
];

/** Kept this long; an older one is still used (up to STALE) while no source answers. */
const TTL = 6 * 3_600_000;
const STALE = 7 * 86_400_000;
/** A rate outside this is a broken answer, not the rupiah (a wrong rate is worse than an old one). */
const PLAUSIBLE = [10_000, 30_000] as const;

let cached: FxRate | null = null;
let inflight: Promise<FxRate | null> | null = null;

/** A source's answer as a rate, or null when it isn't one. */
export function parseRate(source: Omit<Source, "url">, body: unknown, now: number): FxRate | null {
  const { rate, date } = source.read(body ?? {});
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < PLAUSIBLE[0] || rate > PLAUSIBLE[1]) return null;
  const on = typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
  if (source.maxAgeDays !== undefined && (!on || now - Date.parse(`${on}T00:00:00Z`) > (source.maxAgeDays + 1) * 86_400_000)) return null;
  return { usdIdr: rate, date: on, source: source.name, ...(source.credit && { credit: source.credit }), fetchedAt: now };
}

async function fetchRate(now: number): Promise<FxRate | null> {
  for (const source of SOURCES) {
    if (!(await take("fx"))) return null;
    try {
      const res = await fetch(source.url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const rate = parseRate(source, await res.json(), now);
      if (rate) return rate;
    } catch {
      /* the next source */
    }
  }
  return null;
}

function refreshRate(now: number): Promise<FxRate | null> {
  inflight ??= fetchRate(now)
    .then((fresh) => {
      if (fresh) cached = fresh;
      return fresh;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Rupiah per dollar: fresh within hours, an older one while no source answers, null when there's none. Past
 * TTL the one kept is answered at once while a newer one is fetched behind it.
 */
export async function usdIdr(now = Date.now()): Promise<FxRate | null> {
  if (MOCK) return { usdIdr: 17_900, date: new Date(now).toISOString().slice(0, 10), source: "mock", fetchedAt: now };
  if (cached && now - cached.fetchedAt < TTL) return cached;
  if (cached && now - cached.fetchedAt < STALE) {
    void refreshRate(now);
    return cached;
  }
  await refreshRate(now);
  return cached && now - cached.fetchedAt < STALE ? cached : null;
}
