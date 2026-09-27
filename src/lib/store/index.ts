import path from "node:path";
import { supabaseConfig } from "../supabase-rest";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { MarketUpdate, RecordPage, Store, StoreStats, TokenQuery } from "./types";

export function storeKind(): "supabase" | "file" {
  return supabaseConfig() ? "supabase" : "file";
}

function createStore(): Store {
  const supabase = supabaseConfig(); // null in mock mode: demo data never goes into a real database
  if (supabase) return new SupabaseStore(supabase.url, supabase.key);

  const dir = process.env.RANKR_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const file = process.env.RANKR_MOCK === "1" ? "rankr.mock.json" : "rankr.json";
  return new FileStore(path.join(/*turbopackIgnore: true*/ dir, file));
}

// One instance per server process (survives dev hot reloads).
const globalStore = globalThis as unknown as { __rankrStore?: Store };
export const store: Store = (globalStore.__rankrStore ??= createStore());
