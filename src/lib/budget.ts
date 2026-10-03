// Usage limits for the free APIs Rankr reads, so it never runs past their quotas: each call takes from its
// upstream's budget first, and a call the budget can't cover isn't made (the reader skips that part, or says to
// try later). Two kinds of window:
// - per minute, per server instance (in memory): limits the providers count per IP (DexScreener, GeckoTerminal,
//   Honeypot.is, PublicNode), and every instance has its own IP;
// - per UTC day or month, shared by every instance (Postgres, rankr_rate_spend): quotas tied to a key (Blockscout's
//   credits a day, an RPC's credits a month). An instance leases a small block at a time, so most calls don't go
//   to Postgres; a block left over when an instance stops is simply not used (the count errs on the safe side).
// The defaults sit under the free plans' published limits; each can be set in the environment.
import { AsyncLocalStorage } from "node:async_hooks";
import { peek, spend, type Quota } from "./rate-limit";

type Window = "minute" | "day" | "month";
type Rule = { window: Window; max: number };

const env = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const ownSolanaRpc = () => !!process.env.SOLANA_RPC_URL?.trim();

/**
 * What each upstream allows, in its own unit: Solana RPC credits (Helius: 1M a month free; archival calls 10),
 * Blockscout credits (100K a UTC day free, 20 a request), requests for the rest.
 */
const RULES = {
  // Only with your own RPC: the public ones are paced per call instead (solana.ts), and have no monthly quota.
  solana: (): Rule[] =>
    ownSolanaRpc()
      ? [
          { window: "day", max: env("SOLANA_RPC_DAILY_CREDITS", env("SOLANA_RPC_MONTHLY_CREDITS", 900_000) / 25) },
          { window: "month", max: env("SOLANA_RPC_MONTHLY_CREDITS", 900_000) },
        ]
      : [],
  blockscout: (): Rule[] => [{ window: "day", max: env("BLOCKSCOUT_DAILY_CREDITS", 90_000) }],
  geckoterminal: (): Rule[] => [{ window: "minute", max: env("GECKOTERMINAL_PER_MINUTE", 25) }],
  honeypot: (): Rule[] => [{ window: "minute", max: env("HONEYPOT_PER_MINUTE", 60) }],
  // Its pairs, tokens and search endpoints allow 300 a minute; the rest 60.
  dexscreener: (): Rule[] => [{ window: "minute", max: env("DEXSCREENER_PER_MINUTE", 270) }],
  "dexscreener-slow": (): Rule[] => [{ window: "minute", max: env("DEXSCREENER_SLOW_PER_MINUTE", 55) }],
  publicnode: (): Rule[] => [{ window: "minute", max: env("EVM_RPC_PER_MINUTE", 120) }],
} satisfies Record<string, () => Rule[]>;

export type Upstream = keyof typeof RULES;

/** How each upstream is named when a report says what was skipped. */
export const UPSTREAM_NAMES: Record<Upstream, string> = {
  solana: "Solana RPC",
  blockscout: "Blockscout",
  geckoterminal: "GeckoTerminal",
  honeypot: "Honeypot.is",
  dexscreener: "DexScreener",
  "dexscreener-slow": "DexScreener",
  publicnode: "EVM RPC",
};

/** Blockscout's cost of one request, in credits (its default; heavier endpoints aren't used). */
export const BLOCKSCOUT_CREDITS = 20;
/** Solana RPC methods Helius counts as archival: 10 credits; every other call 1. */
const ARCHIVAL = new Set(["getTransaction", "getSignaturesForAddress", "getBlock", "getProgramAccounts"]);
export const solanaCredits = (method: string) => (ARCHIVAL.has(method) ? 10 : 1);

const MINUTE = 60_000;

/** The calendar period a window is in, UTC: "2026-10-03", "2026-10". */
function period(window: Exclude<Window, "minute">, now: number): { key: string; ends: number } {
  const d = new Date(now);
  if (window === "day")
    return { key: d.toISOString().slice(0, 10), ends: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) };
  return { key: d.toISOString().slice(0, 7), ends: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
}

// Per-minute counters, per instance.
const minutes = new Map<string, { start: number; used: number }>();
// Leased blocks of a day's or month's budget, per instance: units this instance may still use.
const leases = new Map<string, number>();
// When each upstream's spent budget comes back, for messages.
const resets = new Map<Upstream, number>();

function takeMinute(name: string, max: number, cost: number, now: number): boolean {
  const cur = minutes.get(name);
  const fresh = !cur || now - cur.start >= MINUTE;
  const base = fresh ? { start: now, used: 0 } : cur;
  if (base.used + cost > max) {
    minutes.set(name, base);
    return false;
  }
  minutes.set(name, { start: base.start, used: base.used + cost });
  return true;
}

async function takeShared(name: string, rule: Rule & { window: "day" | "month" }, cost: number, now: number) {
  const { key, ends } = period(rule.window, now);
  const bucket = `budget:${name}:${rule.window}:${key}`;
  const left = leases.get(bucket) ?? 0;
  if (left >= cost) {
    leases.set(bucket, left - cost);
    return true;
  }
  // A new block: a thousandth of the budget (Postgres is asked once per block, not per call).
  const block = Math.max(cost, Math.ceil(rule.max / 1000));
  const q: Quota = await spend(bucket, ends - now + 3_600_000, rule.max, block, now);
  if (!q.ok) {
    // Not even a block: what fits of the rest, if this call does.
    const rest = rule.max - q.hits;
    if (rest >= cost && (await spend(bucket, ends - now + 3_600_000, rule.max, cost, now)).ok) return true;
    return false;
  }
  if (leases.size > 100) leases.clear();
  leases.set(bucket, left + block - cost);
  return true;
}

/** Upstreams that turned a call down, per request (token.ts reads it to say what was skipped). */
const refused = new AsyncLocalStorage<Set<Upstream>>();

/**
 * Takes `cost` from `name`'s budget, in every window it has. False when one of them can't cover it: the call
 * isn't to be made.
 */
export async function take(name: Upstream, cost = 1, now = Date.now()): Promise<boolean> {
  for (const rule of RULES[name]()) {
    const ok =
      rule.window === "minute"
        ? takeMinute(name, rule.max, cost, now)
        : await takeShared(name, rule as Rule & { window: "day" | "month" }, cost, now);
    if (!ok) {
      resets.set(
        name,
        rule.window === "minute" ? (minutes.get(name)?.start ?? now) + MINUTE : period(rule.window, now).ends,
      );
      refused.getStore()?.add(name);
      return false;
    }
  }
  return true;
}

/** When `name`'s spent budget comes back (after a refusal), ms. */
export function resetOf(name: Upstream, now = Date.now()): number {
  return resets.get(name) ?? now + MINUTE;
}

/** Runs `fn`, and says which upstreams turned a call down while it ran. */
export async function tracked<T>(fn: () => Promise<T>): Promise<{ value: T; refused: Upstream[] }> {
  const seen = new Set<Upstream>();
  const value = await refused.run(seen, fn);
  return { value, refused: [...seen] };
}

// ---- What's been used: the usage page, in the shape of GitHub's /rate_limit (limit, used, remaining, reset).

/** What each upstream is read for, on the usage page. */
const USES: Record<Upstream, string> = {
  solana: "Solana wallets and token reports",
  blockscout: "EVM wallets and token reports",
  geckoterminal: "Trades and wallets in a token's pool",
  honeypot: "Test buy and sell, taxes (Ethereum, Base, BSC)",
  dexscreener: "Prices, pools, search: the whole app",
  "dexscreener-slow": "A pasted address without its chain",
  publicnode: "A token's owner(), BSC tokens",
};

export type UsageRow = {
  id: Upstream;
  name: string;
  use: string;
  window: Window;
  unit: "credits" | "requests";
  limit: number;
  used: number;
  remaining: number;
  /** When the window starts over, ms. */
  reset: number;
  /** Counted for every server together (a day's or month's quota), or for this one (a provider's per-IP minute). */
  scope: "shared" | "instance";
  /** Why it isn't budgeted: not set up, or paced instead. */
  off?: string;
};

const UNITS: Partial<Record<Upstream, "credits">> = { solana: "credits", blockscout: "credits" };

/** Every budget, how much of it is used and when it starts over. Reads the shared counters, takes nothing. */
export async function usage(now = Date.now()): Promise<UsageRow[]> {
  const rows: UsageRow[] = [];
  const shared: { row: UsageRow; bucket: string }[] = [];
  for (const id of Object.keys(RULES) as Upstream[]) {
    const name = id === "dexscreener-slow" ? "DexScreener (other endpoints)" : UPSTREAM_NAMES[id];
    const base = { id, name, use: USES[id], unit: UNITS[id] ?? ("requests" as const) };
    const rules = RULES[id]();
    if (id === "solana" && !rules.length) {
      rows.push({
        ...base,
        window: "minute",
        limit: 0,
        used: 0,
        remaining: 0,
        reset: now,
        scope: "instance",
        off: "Public RPCs: paced at 3.5 calls a second, no quota to spend. Set SOLANA_RPC_URL (a Helius key) for more.",
      });
      continue;
    }
    for (const rule of rules) {
      if (rule.window === "minute") {
        const cur = minutes.get(id);
        const live = cur && now - cur.start < MINUTE;
        const used = live ? cur.used : 0;
        rows.push({
          ...base,
          window: "minute",
          limit: rule.max,
          used,
          remaining: Math.max(0, rule.max - used),
          reset: live ? cur.start + MINUTE : now + MINUTE,
          scope: "instance",
        });
        continue;
      }
      const { key, ends } = period(rule.window, now);
      const row: UsageRow = {
        ...base,
        window: rule.window,
        limit: rule.max,
        used: 0,
        remaining: rule.max,
        reset: ends,
        scope: "shared",
        ...(id === "blockscout" && !process.env.BLOCKSCOUT_API_KEY && { off: "Not set up: no BLOCKSCOUT_API_KEY." }),
      };
      shared.push({ row, bucket: `budget:${id}:${rule.window}:${key}` });
      rows.push(row);
    }
  }
  const counts = await peek(shared.map((s) => s.bucket));
  for (const { row, bucket } of shared) {
    row.used = Math.min(row.limit, counts.get(bucket) ?? 0);
    row.remaining = Math.max(0, row.limit - row.used);
  }
  return rows;
}

/** For tests: forget every count. */
export function resetBudgets() {
  minutes.clear();
  leases.clear();
  resets.clear();
}
