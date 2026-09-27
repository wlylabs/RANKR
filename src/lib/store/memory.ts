// In-memory query semantics. The file store uses these directly; the Supabase SQL
// (supabase/migrations) implements the same rules, and the tests pin both down.
import { applySnapshot, ratio } from "../metrics";
import { DEAD_MULTIPLE, type SortKey } from "../params";
import type { TokenRecord } from "../types";
import type { RecordPage, StoreStats, TokenQuery } from "./types";

export const multipleOf = (r: TokenRecord) => ratio(r.market?.priceUsd || r.entryPriceUsd, r.entryPriceUsd);
export const peakMultipleOf = (r: TokenRecord) => ratio(r.peakPriceUsd, r.entryPriceUsd);
export const isDead = (r: TokenRecord) => multipleOf(r) <= DEAD_MULTIPLE;

const BY: Record<SortKey, (a: TokenRecord, b: TokenRecord) => number> = {
  top: (a, b) => multipleOf(b) - multipleOf(a),
  peak: (a, b) => peakMultipleOf(b) - peakMultipleOf(a),
  losers: (a, b) => multipleOf(a) - multipleOf(b),
  new: () => 0,
  hot: (a, b) => b.pasteCount - a.pasteCount || b.lastPastedAt - a.lastPastedAt,
};

/** Sort order for a leaderboard tab; ties go to the newest paste, then id. */
export function compareRecords(sort: SortKey) {
  return (a: TokenRecord, b: TokenRecord) =>
    BY[sort](a, b) || b.firstPastedAt - a.firstPastedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function matchesQuery(r: TokenRecord, q: TokenQuery): boolean {
  if (q.chain && r.chainId !== q.chain) return false;
  if (q.since != null && r.firstPastedAt < q.since) return false;
  if (q.ids && !q.ids.includes(r.id)) return false;
  if (q.hideDead && isDead(r)) return false;
  if (q.q) {
    const needle = q.q.toLowerCase();
    const hit =
      r.symbol.toLowerCase().includes(needle) ||
      r.name.toLowerCase().includes(needle) ||
      r.address.toLowerCase() === needle;
    if (!hit) return false;
  }
  return true;
}

export function queryRecords(records: Iterable<TokenRecord>, q: TokenQuery): RecordPage {
  const rows = [...records].filter((r) => matchesQuery(r, q)).sort(compareRecords(q.sort));
  const offset = Math.max(0, q.offset);
  return { total: rows.length, records: rows.slice(offset, offset + Math.max(1, q.limit)) };
}

export function statsOfRecords(records: Iterable<TokenRecord>): StoreStats {
  let total = 0;
  let doubled = 0;
  let inRed = 0;
  let best: TokenRecord | null = null;
  const chains = new Set<string>();
  for (const r of records) {
    total++;
    if (peakMultipleOf(r) >= 2) doubled++;
    if (multipleOf(r) < 1) inRed++;
    if (!best || peakMultipleOf(r) > peakMultipleOf(best)) best = r;
    chains.add(r.chainId);
  }
  return { total, doubled, inRed, best, chains: [...chains].sort() };
}

/** Tokens due for a refresh, oldest check first: last checked before `checkedBefore`, dead ones before `deadBefore`. */
export function staleRecords(records: Iterable<TokenRecord>, checkedBefore: number, limit: number, deadBefore = checkedBefore) {
  return [...records]
    .filter((r) => r.lastCheckedAt < (isDead(r) ? Math.min(checkedBefore, deadBefore) : checkedBefore))
    .sort((a, b) => a.lastCheckedAt - b.lastCheckedAt)
    .slice(0, limit);
}

/** What a repeat paste does to a known token. */
export function repaste(current: TokenRecord, fresh: TokenRecord): TokenRecord {
  const merged = fresh.market ? applySnapshot(current, fresh.market, fresh.lastCheckedAt) : current;
  return { ...merged, pasteCount: current.pasteCount + 1, lastPastedAt: fresh.lastPastedAt };
}
