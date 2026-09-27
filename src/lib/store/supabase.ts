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
  private base: string;

  constructor(
    url: string,
    private key: string,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `${url.replace(/\/+$/, "")}/rest/v1`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { apikey: this.key, "content-type": "application/json", accept: "application/json" };
    // New secret keys (sb_secret_...) are not JWTs and must only travel in `apikey`.
    // Legacy service_role keys are JWTs and also go in Authorization.
    if (this.key.startsWith("eyJ")) h.authorization = `Bearer ${this.key}`;
    return h;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: this.headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* not JSON */
      }
      throw new Error(`Supabase ${res.status}: ${message}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  private rpc<T>(fn: string, args: Record<string, unknown>) {
    return this.request<T>(`/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
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
      p_sort: q.sort,
      p_chain: q.chain ?? null,
      p_since: q.since != null ? iso(q.since) : null,
      p_q: q.q || null,
      p_ids: q.ids ?? null,
      p_limit: q.limit,
      p_offset: q.offset,
    });
    return { total: out.total, records: out.records.map(fromRow) };
  }

  async stale(checkedBefore: number, limit: number) {
    const rows = await this.request<TokenRow[]>(
      `/tokens?select=*&last_checked_at=lt.${encodeURIComponent(iso(checkedBefore))}&order=last_checked_at.asc&limit=${limit}`,
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
