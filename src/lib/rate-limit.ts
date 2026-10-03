// Fixed-window rate limits, server side. With Supabase set up, the counters live in Postgres
// (rankr_rate_hit), so every server instance shares them. Without it (local dev), or if that call fails
// (e.g. the migration hasn't been run yet), an in-memory counter per instance takes over: weaker, but
// pasting never breaks because of the limiter itself.
import { SupabaseRest, supabaseConfig } from "./supabase-rest";

export type Quota = { ok: boolean; hits: number; resetAt: number };

let client: SupabaseRest | null | undefined;
function rest(): SupabaseRest | null {
  if (client === undefined) {
    const cfg = supabaseConfig();
    client = cfg ? new SupabaseRest(cfg.url, cfg.key) : null;
  }
  return client;
}

const memory = new Map<string, { start: number; hits: number }>();

function hitMemory(bucket: string, windowMs: number, max: number, now: number): Quota {
  const cur = memory.get(bucket);
  const fresh = !cur || now - cur.start >= windowMs;
  const next = fresh ? { start: now, hits: 1 } : { start: cur.start, hits: cur.hits + 1 };
  if (memory.size > 10_000) memory.clear();
  memory.set(bucket, next);
  return { ok: next.hits <= max, hits: next.hits, resetAt: next.start + windowMs };
}

/** Counts one hit on `bucket` and says whether it is within `max` per `windowMs`. */
export async function hit(bucket: string, windowMs: number, max: number, now = Date.now()): Promise<Quota> {
  const api = rest();
  if (api) {
    try {
      const out = await api.rpc<{ ok: boolean; hits: number; reset_at: string }>("rankr_rate_hit", {
        p_bucket: bucket,
        p_window_seconds: Math.round(windowMs / 1000),
        p_max: max,
      });
      return { ok: out.ok, hits: out.hits, resetAt: Date.parse(out.reset_at) };
    } catch (err) {
      console.error("[rankr] rate limit: Postgres counter failed, using memory", err);
    }
  }
  return hitMemory(bucket, windowMs, max, now);
}

function spendMemory(bucket: string, windowMs: number, max: number, cost: number, now: number): Quota {
  const cur = memory.get(bucket);
  const fresh = !cur || now - cur.start >= windowMs;
  const base = fresh ? { start: now, hits: 0 } : cur;
  const ok = base.hits + cost <= max;
  const next = ok ? { start: base.start, hits: base.hits + cost } : base;
  if (memory.size > 10_000) memory.clear();
  memory.set(bucket, next);
  return { ok, hits: next.hits, resetAt: next.start + windowMs };
}

/**
 * Takes `cost` units from `bucket`'s `max` per `windowMs`, only if they fit (a budget: Blockscout's credits a day,
 * an RPC's a month). Shared across server instances through Postgres (rankr_rate_spend), in memory without it.
 */
export async function spend(
  bucket: string,
  windowMs: number,
  max: number,
  cost: number,
  now = Date.now(),
): Promise<Quota> {
  const api = rest();
  if (api) {
    try {
      const out = await api.rpc<{ ok: boolean; hits: number; reset_at: string }>("rankr_rate_spend", {
        p_bucket: bucket,
        p_window_seconds: Math.round(windowMs / 1000),
        p_max: max,
        p_cost: cost,
      });
      return { ok: out.ok, hits: out.hits, resetAt: Date.parse(out.reset_at) };
    } catch (err) {
      console.error("[rankr] budget: Postgres counter failed, using memory", err);
    }
  }
  return spendMemory(bucket, windowMs, max, cost, now);
}

/** "3h" / "25m" / "40s" until `resetAt`. */
export function untilReset(resetAt: number, now = Date.now()): string {
  const s = Math.max(1, Math.ceil((resetAt - now) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m}m` : `${Math.ceil(m / 60)}h`;
}
