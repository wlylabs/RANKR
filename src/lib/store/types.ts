import type { SortKey } from "../params";
import type { MarketSnapshot, TokenRecord } from "../types";

export type TokenQuery = {
  sort: SortKey;
  chain?: string | null;
  /** Only tokens first pasted at or after this time (ms). */
  since?: number | null;
  /** Ticker / name substring, or an exact address. */
  q?: string | null;
  ids?: string[] | null;
  limit: number;
  offset: number;
};

export type RecordPage = { total: number; records: TokenRecord[] };

export type MarketUpdate = { id: string; snapshot: MarketSnapshot; at: number };

export type StoreStats = {
  total: number;
  /** Tokens whose peak reached 1x (+100%) or more. */
  doubled: number;
  /** Tokens below their entry right now. */
  inRed: number;
  best: TokenRecord | null;
  chains: string[];
};

export interface Store {
  get(id: string): Promise<TokenRecord | null>;
  /**
   * A paste. New token: stored as given (its entry becomes the sealed entry).
   * Known token: paste count +1 and the fresh market data folded in; the entry never changes.
   */
  recordPaste(fresh: TokenRecord): Promise<{ record: TokenRecord; created: boolean }>;
  /** Market refresh. Peak / low only move outward. */
  applyMarket(updates: MarketUpdate[]): Promise<void>;
  query(q: TokenQuery): Promise<RecordPage>;
  /** Tokens last checked before `checkedBefore`, oldest first. */
  stale(checkedBefore: number, limit: number): Promise<TokenRecord[]>;
  stats(): Promise<StoreStats>;
}
