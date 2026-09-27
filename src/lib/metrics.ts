import type { MarketSnapshot, TokenRecord, TokenView } from "./types";

/** Milestones shown on the token page ladder. */
export const MILESTONES = [2, 3, 5, 10, 20, 50, 100, 1000];

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

export function toView(r: TokenRecord, now = Date.now()): TokenView {
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

/** Highest milestone reached (e.g. 5 for a 7.3x), or null below 2x. */
export function milestoneOf(multiple: number): number | null {
  let hit: number | null = null;
  for (const m of MILESTONES) if (multiple >= m) hit = m;
  return hit;
}

export type Tier = "moon" | "pump" | "up" | "flat" | "down" | "rekt";

export function tierOf(multiple: number): Tier {
  if (multiple >= 10) return "moon";
  if (multiple >= 2) return "pump";
  if (multiple >= 1.005) return "up";
  if (multiple > 0.995) return "flat";
  if (multiple > 0.1) return "down";
  return "rekt";
}
