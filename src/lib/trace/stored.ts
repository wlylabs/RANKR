// Trails read lately, kept in Postgres (trace_cache) for every server and every account: a wallet anyone has
// read is served from here for TRACE_CACHE_MINUTES (60 by default), spending no API budget and no free allowance.
// Only public chain data, so sharing it is fine. Without Supabase (local dev) nothing is kept, and a failing
// store never fails a read.
import { SupabaseRest, supabaseConfig } from "../supabase-rest";
import type { TraceResponse } from "./types";

let client: SupabaseRest | null | undefined;
function rest(): SupabaseRest | null {
  if (client === undefined) {
    const cfg = supabaseConfig();
    client = cfg ? new SupabaseRest(cfg.url, cfg.key) : null;
  }
  return client;
}

/** How long a stored read is served, ms. */
export const storedFor = () => {
  const n = Number(process.env.TRACE_CACHE_MINUTES);
  return (Number.isFinite(n) && n >= 0 ? n : 60) * 60_000;
};

/** The wallet's stored read, if one is fresh enough. */
export async function readStored(key: string, now = Date.now()): Promise<TraceResponse | null> {
  const api = rest();
  const ttl = storedFor();
  if (!api || ttl <= 0) return null;
  try {
    const since = new Date(now - ttl).toISOString();
    const rows = await api.select<{ value: TraceResponse }[]>(
      `trace_cache?select=value&key=eq.${encodeURIComponent(key)}&read_at=gte.${encodeURIComponent(since)}&limit=1`,
    );
    return rows[0]?.value ?? null;
  } catch (err) {
    console.warn("[rankr] trace cache unreadable:", (err as Error).message);
    return null;
  }
}

/** Keeps a wallet's read for everyone (in the background: the read doesn't wait). */
export function store(key: string, value: TraceResponse): void {
  const api = rest();
  if (!api || storedFor() <= 0) return;
  api.rpc("rankr_cache_trace", { p_key: key, p_value: value }).catch((err) => {
    console.warn("[rankr] trace cache not saved:", (err as Error).message);
  });
}
