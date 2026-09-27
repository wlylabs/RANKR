import type { MarketSnapshot, TokenRecord, TokenView } from "./types";

/** Milestones on the token page ladder, in Rankr x (gain): 1x = +100%, so 1x means price doubled. */
export const MILESTONES = [1, 2, 3, 5, 10, 20, 50, 100];

/** Price multiple a token needs to reach a milestone: 1x -> 2 (doubled), 10x -> 11. */
export function milestonePrice(x: number): number {
  return 1 + x;
}

/** After this long without a successful refresh the numbers are flagged as stale. */
const STALE_AFTER_MS = 5 * 60_000;

export function ratio(value: number, base: number): number {
  return base > 0 && Number.isFinite(value) ? value / base : 1;
}

export function snapshotMarketCap(s: MarketSnapshot | null): number | null {
  return s ? (s.marketCap ?? s.fdv) : null;
}

export function newRecord(s: MarketSnapshot, id: string, now: number): TokenRecord {
  return {
    id,
    chainId: s.chainId,
    address: s.address,
    name: s.name,
    symbol: s.symbol,
    imageUrl: s.imageUrl,
    entryPriceUsd: s.priceUsd,
    entryMarketCap: snapshotMarketCap(s),
    firstPastedAt: now,
    lastPastedAt: now,
    pasteCount: 1,
    peakPriceUsd: s.priceUsd,
    peakAt: now,
    lowPriceUsd: s.priceUsd,
    lowAt: now,
    market: s,
    lastCheckedAt: now,
  };
}

/** Folds a fresh snapshot into a record, moving the peak / low watermarks. */
export function applySnapshot(r: TokenRecord, s: MarketSnapshot, now: number): TokenRecord {
  const next: TokenRecord = {
    ...r,
    name: s.name || r.name,
    symbol: s.symbol || r.symbol,
    imageUrl: s.imageUrl ?? r.imageUrl,
    market: s,
    lastCheckedAt: now,
  };
  if (s.priceUsd > r.peakPriceUsd) Object.assign(next, { peakPriceUsd: s.priceUsd, peakAt: now });
  if (s.priceUsd > 0 && s.priceUsd < r.lowPriceUsd) Object.assign(next, { lowPriceUsd: s.priceUsd, lowAt: now });
  return next;
}

/** Everything in a view except the seal, which needs node:crypto and is added server-side. */
export function toView(r: TokenRecord, now = Date.now()): Omit<TokenView, "seal"> {
  const price = r.market?.priceUsd || r.entryPriceUsd;
  const multiple = ratio(price, r.entryPriceUsd);
  return {
    ...r,
    multiple,
    peakMultiple: ratio(r.peakPriceUsd, r.entryPriceUsd),
    lowMultiple: ratio(r.lowPriceUsd, r.entryPriceUsd),
    marketCap: snapshotMarketCap(r.market) ?? (r.entryMarketCap !== null ? r.entryMarketCap * multiple : null),
    stale: now - r.lastCheckedAt > STALE_AFTER_MS,
  };
}

/** Highest milestone reached (e.g. 5 for a +730% move), or null below 1x (+100%). */
export function milestoneOf(multiple: number): number | null {
  let hit: number | null = null;
  for (const m of MILESTONES) if (multiple >= milestonePrice(m)) hit = m;
  return hit;
}

export type Tier = "moon" | "pump" | "up" | "flat" | "down" | "rekt";

export function tierOf(multiple: number): Tier {
  if (multiple >= milestonePrice(10)) return "moon"; // 10x+
  if (multiple >= milestonePrice(1)) return "pump"; // 1x+ (doubled)
  if (multiple >= 1.0005) return "up";
  if (multiple > 0.9995) return "flat";
  if (multiple > 0.1) return "down";
  return "rekt"; // -90% or worse
}
