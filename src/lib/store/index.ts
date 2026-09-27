import path from "node:path";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { MarketUpdate, RecordPage, Store, StoreStats, TokenQuery } from "./types";

export function storeKind(): "supabase" | "file" {
  return process.env.RANKR_MOCK !== "1" && supabaseConfig() ? "supabase" : "file";
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function createStore(): Store {
  // Mock market data never goes into a real database.
  const supabase = process.env.RANKR_MOCK === "1" ? null : supabaseConfig();
  if (supabase) return new SupabaseStore(supabase.url, supabase.key);

  const dir = process.env.RANKR_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const file = process.env.RANKR_MOCK === "1" ? "rankr.mock.json" : "rankr.json";
  return new FileStore(path.join(/*turbopackIgnore: true*/ dir, file));
}

// One instance per server process (survives dev hot reloads).
const globalStore = globalThis as unknown as { __rankrStore?: Store };
export const store: Store = (globalStore.__rankrStore ??= createStore());
