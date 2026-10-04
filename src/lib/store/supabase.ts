import { DEAD_MULTIPLE } from "../params";
import { SupabaseRest } from "../supabase-rest";
import type { MarketSnapshot, TokenRecord } from "../types";
import type { MarketUpdate, RecordPage, Store, StoreStats, TokenQuery } from "./types";

/** A row of public.tokens as PostgREST returns it (see supabase/migrations). */
export type TokenRow = {
  id: string;
  chain_id: string;
  address: string;
  name: string;
  symbol: string;
  image_url: string | null;
  entry_price_usd: number;
  entry_market_cap: number | null;
  first_pasted_at: string;
  last_pasted_at: string;
  paste_count: number;
  peak_price_usd: number;
  peak_at: string;
  low_price_usd: number;
  low_at: string;
  last_price_usd: number;
  market: MarketSnapshot | null;
  last_checked_at: string;
  multiple?: number;
  peak_multiple?: number;
};

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: string) => Date.parse(value);

export function toRow(r: TokenRecord): TokenRow {
  return {
    id: r.id,
    chain_id: r.chainId,
    address: r.address,
    name: r.name,
    symbol: r.symbol,
    image_url: r.imageUrl,
    entry_price_usd: r.entryPriceUsd,
    entry_market_cap: r.entryMarketCap,
    first_pasted_at: iso(r.firstPastedAt),
    last_pasted_at: iso(r.lastPastedAt),
    paste_count: r.pasteCount,
    peak_price_usd: r.peakPriceUsd,
    peak_at: iso(r.peakAt),
    low_price_usd: r.lowPriceUsd,
    low_at: iso(r.lowAt),
    last_price_usd: r.market?.priceUsd || r.entryPriceUsd,
    market: r.market,
    last_checked_at: iso(r.lastCheckedAt),
  };
}

export function fromRow(row: TokenRow): TokenRecord {
  return {
    id: row.id,
    chainId: row.chain_id,
    address: row.address,
    name: row.name,
    symbol: row.symbol,
    imageUrl: row.image_url,
    entryPriceUsd: row.entry_price_usd,
    entryMarketCap: row.entry_market_cap,
    firstPastedAt: ms(row.first_pasted_at),
    lastPastedAt: ms(row.last_pasted_at),
    pasteCount: row.paste_count,
    peakPriceUsd: row.peak_price_usd,
    peakAt: ms(row.peak_at),
    lowPriceUsd: row.low_price_usd,
    lowAt: ms(row.low_at),
    market: row.market,
    lastCheckedAt: ms(row.last_checked_at),
  };
}

/**
 * Supabase (Postgres) over its REST API. All writes go through the SQL functions in
 * supabase/migrations, which keep the entry sealed and make pastes atomic.
 */
export class SupabaseStore implements Store {
  private rest: SupabaseRest;

  constructor(url: string, key: string, fetchImpl: typeof fetch = fetch) {
    this.rest = new SupabaseRest(url, key, fetchImpl);
  }

  private request<T>(path: string) {
    return this.rest.select<T>(path.replace(/^\//, ""));
  }

  private rpc<T>(fn: string, args: Record<string, unknown>) {
    return this.rest.rpc<T>(fn, args);
  }

  async get(id: string) {
    const rows = await this.request<TokenRow[]>(`/tokens?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async recordPaste(fresh: TokenRecord) {
    const out = await this.rpc<{ created: boolean; record: TokenRow }>("rankr_record_paste", { p: toRow(fresh) });
    return { created: out.created, record: fromRow(out.record) };
  }

  async applyMarket(updates: MarketUpdate[]) {
    if (!updates.length) return;
    await this.rpc<number>("rankr_apply_market", {
      updates: updates.map((u) => ({
        id: u.id,
        name: u.snapshot.name,
        symbol: u.snapshot.symbol,
        image_url: u.snapshot.imageUrl,
        market: u.snapshot,
        last_price_usd: u.snapshot.priceUsd,
        checked_at: iso(u.at),
      })),
    });
  }

  async query(q: TokenQuery): Promise<RecordPage> {
    const out = await this.rpc<{ total: number; records: TokenRow[] }>("rankr_query", {
      p_sort: "new",
      p_chain: q.chain ?? null,
      p_ids: q.ids ?? null,
      p_limit: q.limit,
      p_offset: q.offset,
    });
    return { total: out.total, records: out.records.map(fromRow) };
  }

  async stale(checkedBefore: number, limit: number, deadBefore = checkedBefore) {
    const before = encodeURIComponent(iso(checkedBefore));
    // Alive tokens checked before `checkedBefore`, dead ones (see DEAD_MULTIPLE) before `deadBefore`.
    const dead = `or=(multiple.gt.${DEAD_MULTIPLE},last_checked_at.lt.${encodeURIComponent(iso(Math.min(checkedBefore, deadBefore)))})`;
    const rows = await this.request<TokenRow[]>(
      `/tokens?select=*&last_checked_at=lt.${before}&${dead}&order=last_checked_at.asc&limit=${limit}`,
    );
    return rows.map(fromRow);
  }

  async stats(): Promise<StoreStats> {
    const s = await this.rpc<{ total: number; doubled: number; in_red: number; best: TokenRow | null; chains: string[] }>(
      "rankr_stats",
      {},
    );
    return { total: s.total, doubled: s.doubled, inRed: s.in_red, best: s.best ? fromRow(s.best) : null, chains: s.chains };
  }
}
